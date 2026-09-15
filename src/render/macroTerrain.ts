/**
 * Macro terrain manager - caches anchor-relative LOD tile meshes around the
 * player and rebuilds them when the frame anchor re-bases or the world moves
 * into a new tile neighborhood.
 *
 * Real-time behavior: on each update, the manager computes the 7x7 macro
 * neighborhood around the player, skips tiles overlapping the loaded voxel
 * chunks (the near-field mesh already depicts them), and materializes tiles
 * whose underlying elevation tiles are resident, requesting the rest.
 * Cached tiles are re-seated (translated) when the frame anchor re-bases instead
 * of being re-generated: only rings marked `rebakeOnRebase` (whose clip boundary
 * follows the player) rebuild their geometry. See docs/08.
 *
 * Architecture: lives in /src/render/; imports Three.js and sim types only.
 */

import { Material, Mesh, MeshStandardMaterial, Scene } from 'three';
import type { EarthElevationSource } from '../types/world';
import { frameAnchor } from './frameAnchor';
import { applyMeshBase, captureMeshBase, type MeshBase } from './meshBase';
import { buildMacroTileGeometry } from './macroTileBuilder';
import {
  macroBuildTag,
  tileOverlapsRing,
  MACRO_NEAR_RING,
  MACRO_FAR_RING,
  MacroRing,
} from './macroGeometry';

/** Macro tile material (shared, vertex-colored, distant friendly shading). */
function createMacroMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    vertexColors: true,
    side: 0,
    flatShading: false,
    metalness: 0.1,
    roughness: 0.85,
  });
}

export class MacroTerrainManager {
  private scene: Scene;
  private source: EarthElevationSource;
  private material: MeshStandardMaterial;
  private meshes = new Map<string, Mesh>();
  private builtTags = new Set<string>();
  /** Render origin each cached tile's geometry was baked against. */
  private tileBases = new Map<string, MeshBase>();
  /** Anchor seen at the last update, used to detect render-origin re-bases. */
  private lastAnchorX = Number.NaN;
  private lastAnchorZ = Number.NaN;

  constructor(scene: Scene, source: EarthElevationSource) {
    this.scene = scene;
    this.source = source;
    this.material = createMacroMaterial();
  }

  /**
   * Update macro tiles around the player (world meters). Tiles overlapping
   * the near-field voxel box keep their voxel depiction; everything else out
   * to both ring radii is filled, loading elevation tiles on demand.
   */
  update(centerWorldX: number, centerWorldZ: number): void {
    const rebased = this.lastAnchorX !== frameAnchor.x || this.lastAnchorZ !== frameAnchor.z;
    this.lastAnchorX = frameAnchor.x;
    this.lastAnchorZ = frameAnchor.z;

    const wanted = new Set<string>();
    this.updateRing(centerWorldX, centerWorldZ, MACRO_NEAR_RING, wanted);
    this.updateRing(centerWorldX, centerWorldZ, MACRO_FAR_RING, wanted);

    // Dispose tiles that left both neighborhoods.
    for (const [key, mesh] of this.meshes) {
      if (!wanted.has(key)) {
        mesh.geometry.dispose();
        this.scene.remove(mesh);
        this.meshes.delete(key);
        this.tileBases.delete(key);
        for (const tag of Array.from(this.builtTags)) {
          if (tag === key || tag.startsWith(key + '@')) this.builtTags.delete(tag);
        }
      }
    }

    // Bake-once tiles (the far shell) only need re-seating on a re-base.
    if (rebased) this.syncAnchor();
  }

  /**
  * Update a single LOD ring: include every tile whose bounds overlap the
  * ring band so tile size cannot create coverage holes.
   */
  private updateRing(
    centerWorldX: number,
    centerWorldZ: number,
    ring: MacroRing,
    wanted: Set<string>,
  ): void {
    const { tileSize } = ring;
    const minTx = Math.floor((centerWorldX - ring.outerRadius) / tileSize);
    const maxTx = Math.floor((centerWorldX + ring.outerRadius) / tileSize);
    const minTz = Math.floor((centerWorldZ - ring.outerRadius) / tileSize);
    const maxTz = Math.floor((centerWorldZ + ring.outerRadius) / tileSize);

    for (let tx = minTx; tx <= maxTx; tx++) {
      const minX = tx * tileSize;
      const maxX = minX + tileSize;
      for (let tz = minTz; tz <= maxTz; tz++) {
        const minZ = tz * tileSize;
        const maxZ = minZ + tileSize;

        if (!tileOverlapsRing(minX, maxX, minZ, maxZ, centerWorldX, centerWorldZ, ring)) continue;

        const key = ring.tileSize + ':' + ring.gridPoints + ':' + tx + ',' + tz;
        wanted.add(key);

        // A rebaking ring (the clipped near ring) rebuilds per anchor; a
        // bake-once ring keeps its geometry and is re-seated by syncAnchor.
        const buildTag = macroBuildTag(ring, key, frameAnchor.x, frameAnchor.z);
        if (this.meshes.has(key) && this.builtTags.has(buildTag)) continue;
        if (!this.source.isReady(minX, minZ, maxX, maxZ)) {
          this.source.requestArea(minX, minZ, maxX, maxZ);
          continue;
        }
        this.buildTile(buildTag, key, tx, tz, ring);
      }
    }
  }

  private buildTile(buildTag: string, key: string, tx: number, tz: number, ring: MacroRing): void {
    const existing = this.meshes.get(key);
    if (existing !== undefined) {
      existing.geometry.dispose();
      this.scene.remove(existing);
    }
    // Only a rebaking ring is clipped: its clip boundary follows the player and
    // therefore cannot be translated. A bake-once ring has no clip and relies on
    // grid-cell ownership (`exclusiveInner`) for an exact near/far partition, so
    // translation-only re-seating keeps it seam-free (see docs/08).
    const clipRadius = ring.rebakeOnRebase ? ring.innerRadius : undefined;
    const geometry = buildMacroTileGeometry(
      this.source,
      tx,
      tz,
      ring.tileSize,
      ring.gridPoints,
      frameAnchor.x,
      frameAnchor.z,
      clipRadius,
    );
    const mesh = new Mesh(geometry, this.material);
    mesh.frustumCulled = true;
    const base = captureMeshBase();
    this.meshes.set(key, mesh);
    this.tileBases.set(key, base);
    this.builtTags.add(buildTag);
    applyMeshBase(mesh, base);
    this.scene.add(mesh);
  }

  /**
   * Translate bake-once tiles onto the current render origin. Called once per
   * re-base; geometry is never regenerated for a re-base alone. Returns how many
   * tiles moved (diagnostics/tests).
   */
  syncAnchor(): number {
    let moved = 0;
    for (const [key, mesh] of this.meshes) {
      const base = this.tileBases.get(key);
      if (base !== undefined && applyMeshBase(mesh, base)) moved++;
    }
    return moved;
  }

  /** Number of resident macro tiles (diagnostics). */
  get tileCount(): number {
    return this.meshes.size;
  }

  dispose(): void {
    for (const [, mesh] of this.meshes) {
      mesh.geometry.dispose();
      this.scene.remove(mesh);
    }
    this.meshes.clear();
    this.builtTags.clear();
    this.tileBases.clear();
    (this.material as Material).dispose();
  }
}

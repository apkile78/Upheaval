/**
 * Macro terrain manager - caches anchor-relative LOD tile meshes around the
 * player and rebuilds them when the frame anchor re-bases or the world moves
 * into a new tile neighborhood.
 *
 * Real-time behavior: on each update, the manager computes the 7x7 macro
 * neighborhood around the player, skips tiles overlapping the loaded voxel
 * chunks (the near-field mesh already depicts them), and materializes tiles
 * whose underlying elevation tiles are resident, requesting the rest.
 * Anchor re-bases rebase tile offsets once (no per-frame vertex rewrite).
 *
 * Architecture: lives in /src/render/; imports Three.js and sim types only.
 */

import { Material, Mesh, MeshStandardMaterial, Scene } from 'three';
import type { EarthElevationSource } from '../types/world';
import { frameAnchor } from './frameAnchor';
import {
  buildMacroTileGeometry,
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
    const wanted = new Set<string>();
    this.updateRing(centerWorldX, centerWorldZ, MACRO_NEAR_RING, wanted);
    this.updateRing(centerWorldX, centerWorldZ, MACRO_FAR_RING, wanted);

    // Dispose tiles that left both neighborhoods.
    for (const [key, mesh] of this.meshes) {
      if (!wanted.has(key)) {
        mesh.geometry.dispose();
        this.scene.remove(mesh);
        this.meshes.delete(key);
        for (const tag of Array.from(this.builtTags)) {
          if (tag.startsWith(key + '@')) this.builtTags.delete(tag);
        }
      }
    }
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

        // Build once per anchor offset; geometry is baked anchor-relative.
        const anchorTag = key + '@' + frameAnchor.x + ',' + frameAnchor.z;
        if (this.meshes.has(key) && this.builtTags.has(anchorTag)) continue;
        if (!this.source.isReady(minX, minZ, maxX, maxZ)) {
          this.source.requestArea(minX, minZ, maxX, maxZ);
          continue;
        }
        this.buildTile(anchorTag, key, tx, tz, ring);
      }
    }
  }

  private buildTile(anchorTag: string, key: string, tx: number, tz: number, ring: MacroRing): void {
    const existing = this.meshes.get(key);
    if (existing !== undefined) {
      existing.geometry.dispose();
      this.scene.remove(existing);
    }
    const geometry = buildMacroTileGeometry(
      this.source,
      tx,
      tz,
      ring.tileSize,
      ring.gridPoints,
      frameAnchor.x,
      frameAnchor.z,
      ring.innerRadius,
    );
    const mesh = new Mesh(geometry, this.material);
    mesh.frustumCulled = true;
    this.meshes.set(key, mesh);
    this.builtTags.add(anchorTag);
    this.scene.add(mesh);
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
    (this.material as Material).dispose();
  }
}

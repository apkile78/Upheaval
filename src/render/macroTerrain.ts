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
import { buildMacroTileGeometry, MACRO_TILE_SIZE, MACRO_HALF_TILES } from './macroGeometry';

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
   * Update macro tiles around the player (world meters). nearHalfExtentTiles
   * is the voxel-chunk radius expressed in macro tiles (skip overlap region).
   */
  update(centerWorldX: number, centerWorldZ: number, voxelRadiusMeters: number): void {
    const centerTx = Math.floor(centerWorldX / MACRO_TILE_SIZE);
    const centerTz = Math.floor(centerWorldZ / MACRO_TILE_SIZE);

    const wanted = new Set<string>();
    for (let dx = -MACRO_HALF_TILES; dx <= MACRO_HALF_TILES; dx++) {
      for (let dz = -MACRO_HALF_TILES; dz <= MACRO_HALF_TILES; dz++) {
        const tx = centerTx + dx;
        const tz = centerTz + dz;
        const minX = tx * MACRO_TILE_SIZE;
        const maxX = minX + MACRO_TILE_SIZE;
        const minZ = tz * MACRO_TILE_SIZE;
        const maxZ = minZ + MACRO_TILE_SIZE;
        const tileCenterX = minX + MACRO_TILE_SIZE / 2;
        const tileCenterZ = minZ + MACRO_TILE_SIZE / 2;

        // Skip the near-field area already covered by the voxel chunk meshes.
        const dist = Math.sqrt(
          (tileCenterX - centerWorldX) * (tileCenterX - centerWorldX) +
            (tileCenterZ - centerWorldZ) * (tileCenterZ - centerWorldZ),
        );
        if (dist < voxelRadiusMeters + MACRO_TILE_SIZE) continue;

        const key = tx + ',' + tz;
        wanted.add(key);

        // Build once per anchor offset; geometry is baked anchor-relative.
        const anchorTag = key + '@' + frameAnchor.x + ',' + frameAnchor.z;
        if (this.meshes.has(key) && this.builtTags.has(anchorTag)) continue;
        if (!this.source.isReady(minX, minZ, maxX, maxZ)) {
          this.source.requestArea(minX, minZ, maxX, maxZ);
          continue;
        }
        this.buildTile(anchorTag, key, tx, tz);
      }
    }

    // Dispose tiles that left the neighborhood.
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

  private buildTile(anchorTag: string, key: string, tx: number, tz: number): void {
    const existing = this.meshes.get(key);
    if (existing !== undefined) {
      existing.geometry.dispose();
      this.scene.remove(existing);
    }
    const geometry = buildMacroTileGeometry(this.source, tx, tz);
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

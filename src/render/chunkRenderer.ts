/**
 * Terrain chunk renderer - creates/disposes Three.js meshes for world chunks.
 *
 * Meshes are diff-based: a chunk is only (re)built when it becomes active or
 * when its neighbor availability changes - never rebuilt every frame.
 *
 * Architecture: lives in /src/render/; imports Three.js.
 * Reads chunk data from simulation, renders to scene.
 */

import { Mesh, Fog, MeshStandardMaterial, Scene } from 'three';
import type { WorldChunk, ChunkCoordinate } from '../types/world';
import { NeighborHeightmaps, buildChunkGeometry } from './chunkGeometry';
import { frameAnchor } from './frameAnchor';

// ---------------------------------------------------------------------------
// Chunk Renderer
// ---------------------------------------------------------------------------

/** Count how many neighbor heightmaps are present in a bundle. */
function countNeighbors(n?: NeighborHeightmaps): number {
  if (!n) return 0;
  let count = 0;
  if (n.nw) count++;
  if (n.n) count++;
  if (n.ne) count++;
  if (n.w) count++;
  if (n.e) count++;
  if (n.sw) count++;
  if (n.s) count++;
  if (n.se) count++;
  return count;
}

/** Fog fade distance in meters (matches the sky background; hides LOD transitions). */
export const TERRAIN_FOG_FAR = 7500;

export class ChunkRenderer {
  private scene: Scene;
  private meshes = new Map<string, Mesh>();
  /** Neighbor count present when each mesh was last built (diff tracking). */
  private meshedNeighborCounts = new Map<string, number>();

  constructor(scene: Scene) {
    this.scene = scene;
    if (scene.fog === null) {
      scene.fog = new Fog(0x1a1a2e, 1500, TERRAIN_FOG_FAR);
    }
  }

  updateChunkMesh(chunk: WorldChunk, heightmap: Float32Array, neighbors?: NeighborHeightmaps): void {
    const key = this.chunkKey(chunk.coordinate);
    this.removeChunkMesh(key);
    const mesh = this.createChunkMesh(chunk, heightmap, neighbors);
    mesh.position.set(-frameAnchor.x, 0, -frameAnchor.z);
    this.meshes.set(key, mesh);
    this.scene.add(mesh);
    this.meshedNeighborCounts.set(key, countNeighbors(neighbors));
  }

  /**
   * Re-anchor every cached mesh to the current frame anchor. Geometry vertices
   * carry absolute world heights, so only the mesh origin needs re-seating on
   * a re-base (no rebuild). Call each frame after updateFrameAnchor.
   */
  syncAnchor(): void {
    for (const mesh of this.meshes.values()) {
      mesh.position.set(-frameAnchor.x, 0, -frameAnchor.z);
    }
  }

  removeChunkMesh(key: string): void {
    const mesh = this.meshes.get(key);
    if (mesh) {
      mesh.geometry.dispose();
      (mesh.material as { dispose(): void }).dispose();
      this.scene.remove(mesh);
      this.meshes.delete(key);
      this.meshedNeighborCounts.delete(key);
    }
  }

  /**
   * Diff-based chunk sync: only builds meshes for chunks that are new or
   * whose neighbor availability changed. Existing meshes are never rebuilt
   * per frame (heightmap data is deterministic per chunk coordinate).
   */
  updateAllChunks(chunks: WorldChunk[], heightmaps: Float32Array[], neighbors?: NeighborHeightmaps[]): void {
    const activeKeys = new Set<string>();
    for (const chunk of chunks) {
      activeKeys.add(this.chunkKey(chunk.coordinate));
    }

    // Dispose meshes for chunks that left the active set
    for (const [key, mesh] of this.meshes) {
      if (!activeKeys.has(key)) {
        mesh.geometry.dispose();
        (mesh.material as { dispose(): void }).dispose();
        this.scene.remove(mesh);
        this.meshes.delete(key);
        this.meshedNeighborCounts.delete(key);
      }
    }

    // Build meshes only for new/changed chunks
    for (let i = 0; i < chunks.length; i++) {
      const key = this.chunkKey(chunks[i].coordinate);
      const nCount = countNeighbors(neighbors?.[i]);
      const prevCount = this.meshedNeighborCounts.get(key);
      if (this.meshes.has(key) && prevCount === nCount) continue;
      this.updateChunkMesh(chunks[i], heightmaps[i], neighbors?.[i]);
    }
  }

  clear(): void {
    for (const [, mesh] of this.meshes) {
      mesh.geometry.dispose();
      (mesh.material as { dispose(): void }).dispose();
    }
    this.meshes.clear();
    this.meshedNeighborCounts.clear();
  }

  private chunkKey(coord: ChunkCoordinate): string {
    return `${coord.x},${coord.y},${coord.z}`;
  }

  private createChunkMesh(chunk: WorldChunk, heightmap: Float32Array, neighbors?: NeighborHeightmaps): Mesh {
    const geometry = buildChunkGeometry(chunk, heightmap, neighbors);
    const material = new MeshStandardMaterial({
      vertexColors: true,
      side: 0,
      flatShading: true,
      metalness: 0.1,
      roughness: 0.8,
    });
    return new Mesh(geometry, material);
  }
}

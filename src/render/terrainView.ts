/**
 * Terrain view helpers - bridges simulation chunk data to render meshes.
 *
 * Keeps main.ts thin: neighbor heightmap lookups and diff-based mesh syncing
 * live here, since they are purely a rendering concern over sim data.
 *
 * Architecture: lives in /src/render/; imports sim types only.
 */

import type { ChunkCoordinate } from '../types/world';
import type { ChunkManager } from '../sim/world/chunkManager';
import type { ChunkRenderer } from './chunkRenderer';

/** Get all 8 neighbor heightmaps for seamless chunk edges (null when absent). */
export function getNeighbors(
  chunkManager: ChunkManager,
  coord: { x: number; y: number; z: number },
): {
  nw: Float32Array | null; n: Float32Array | null; ne: Float32Array | null;
  w: Float32Array | null; e: Float32Array | null;
  sw: Float32Array | null; s: Float32Array | null; se: Float32Array | null;
} {
  return {
    nw: chunkManager.getNeighborHeightmap(coord, -1, -1) ?? null,
    n: chunkManager.getNeighborHeightmap(coord, 0, -1) ?? null,
    ne: chunkManager.getNeighborHeightmap(coord, 1, -1) ?? null,
    w: chunkManager.getNeighborHeightmap(coord, -1, 0) ?? null,
    e: chunkManager.getNeighborHeightmap(coord, 1, 0) ?? null,
    sw: chunkManager.getNeighborHeightmap(coord, -1, 1) ?? null,
    s: chunkManager.getNeighborHeightmap(coord, 0, 1) ?? null,
    se: chunkManager.getNeighborHeightmap(coord, 1, 1) ?? null,
  };
}

/** Create meshes for the currently active chunks (initial world build). */
export function buildInitialChunkMeshes(chunkManager: ChunkManager, chunkRenderer: ChunkRenderer): void {
  for (const chunk of chunkManager.getActiveChunks()) {
    const heightmap = chunkManager.getHeightmap(chunk.coordinate);
    if (heightmap === undefined) continue;
    chunkRenderer.updateChunkMesh(chunk, heightmap, getNeighbors(chunkManager, { ...chunk.coordinate, y: 0 }));
  }
}

/** Diff-based per-frame chunk mesh sync (only rebuilds new/changed chunks). */
export function syncChunkMeshes(chunkManager: ChunkManager, chunkRenderer: ChunkRenderer): void {
  const chunks = chunkManager.getActiveChunks();
  const maps: Float32Array[] = [];
  const neighs: ReturnType<typeof getNeighbors>[] = [];
  for (const chunk of chunks) {
    maps.push(chunkManager.getHeightmap(chunk.coordinate) ?? new Float32Array(0));
    neighs.push(getNeighbors(chunkManager, { ...chunk.coordinate, y: 0 }));
  }
  chunkRenderer.updateAllChunks(chunks, maps, neighs);
}

/** Chunk coordinate containing a world position (horizontal axes). */
export function chunkCoordAt(worldX: number, worldY: number, worldZ: number): ChunkCoordinate {
  return {
    x: Math.floor(worldX / 16),
    y: Math.floor(worldY / 16),
    z: Math.floor(worldZ / 16),
  };
}
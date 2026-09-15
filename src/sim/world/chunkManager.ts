/**
 * World chunk manager backed by real-Earth elevation data.
 *
 * Chunks materialize only once the elevation tiles covering them (plus a
 * bilinear margin) are resident in the source's LRU; areas that are still
 * loading are re-requested and materialize on a later tick.
 *
 * Architecture: /src/sim/ layer — pure TypeScript, zero rendering imports.
 */

import type { ChunkCoordinate, EarthElevationSource, TerrainTile, WorldChunk } from '../../types/world';
import { BiomeManager } from './biomeManager';
import { CELL_METERS } from './earth/earthConfig';

export const CHUNK_SIZE = 16;

/** Extra world-space margin around a chunk required for bilinear sampling. */
const SAMPLE_MARGIN = Math.ceil(CELL_METERS) + 2;

interface ChunkData {
  chunk: WorldChunk;
  heightmap: Float32Array;
}

export class ChunkManager {
  private activeChunks: Map<string, ChunkData>;
  private readonly elevationSource: EarthElevationSource;
  private readonly biomeManager: BiomeManager;

  constructor(source: EarthElevationSource, seed: number = 0) {
    this.activeChunks = new Map();
    this.elevationSource = source;
    this.biomeManager = new BiomeManager(source, seed);
  }

  /** Exposed for callers that need biome queries (HUD, interaction, tests). */
  get biomes(): BiomeManager {
    return this.biomeManager;
  }

  generateChunk(coord: ChunkCoordinate): ChunkData {
    const tiles: TerrainTile[][][] = [];
    const heightmap = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);

    for (let x = 0; x < CHUNK_SIZE; x++) {
      const column: TerrainTile[][] = [];
      const worldX = coord.x * CHUNK_SIZE + x;
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const worldZ = coord.z * CHUNK_SIZE + z;
        const surfaceHeight = this.biomeManager.getElevation(worldX, worldZ);
        heightmap[x * CHUNK_SIZE + z] = surfaceHeight;

        const slice: TerrainTile[] = [];
        for (let y = 0; y < CHUNK_SIZE; y++) {
          const worldY = coord.y * CHUNK_SIZE + y;
          const tile = this.generateTile(worldX, worldY, worldZ, surfaceHeight);
          slice.push(tile);
        }
        column.push(slice);
      }
      tiles.push(column);
    }

    const chunk = { coordinate: { ...coord }, tiles, seed: 0 };
    return { chunk, heightmap };
  }

  private generateTile(_worldX: number, worldY: number, _worldZ: number, surfaceHeight: number): TerrainTile {
    if (worldY > surfaceHeight) {
      return { terrainType: 'grass', elevation: -1 }; // Air
    }
    const type = this.biomeManager.getTileType(worldY, surfaceHeight);
    return { terrainType: type, elevation: surfaceHeight };
  }

  /** Sample the rendered triangle surface across chunk boundaries. */
  getHeightAt(worldX: number, worldZ: number): number {
    const cellX = Math.floor(worldX);
    const cellZ = Math.floor(worldZ);
    const tx = worldX - cellX;
    const tz = worldZ - cellZ;
    const h00 = this.getGridHeight(cellX, cellZ);
    const h10 = this.getGridHeight(cellX + 1, cellZ);
    const h01 = this.getGridHeight(cellX, cellZ + 1);
    const h11 = this.getGridHeight(cellX + 1, cellZ + 1);

    if (tx + tz <= 1) {
      return h00 + tx * (h10 - h00) + tz * (h01 - h00);
    }
    return (1 - tz) * h10 + (1 - tx) * h01 + (tx + tz - 1) * h11;
  }

  isHeightReady(worldX: number, worldZ: number): boolean {
    return this.elevationSource.isReady(worldX - 2, worldZ - 2, worldX + 2, worldZ + 2);
  }

  private getGridHeight(worldX: number, worldZ: number): number {
    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
    const chunkData = this.activeChunks.get(chunkX + ',0,' + chunkZ);
    if (chunkData === undefined) return this.biomeManager.getElevation(worldX, worldZ);

    const localX = worldX - chunkX * CHUNK_SIZE;
    const localZ = worldZ - chunkZ * CHUNK_SIZE;
    return chunkData.heightmap[localX * CHUNK_SIZE + localZ] ?? 0;
  }

  updateActiveChunks(centerCoord: ChunkCoordinate, radius: number): void {
    const newChunks = new Map<string, ChunkData>();
    const centerKey = this.chunkKey({ x: centerCoord.x, y: 0, z: centerCoord.z });

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const newCoord: ChunkCoordinate = {
          x: centerCoord.x + dx,
          y: 0,
          z: centerCoord.z + dz,
        };
        const key = this.chunkKey(newCoord);

        const existing = this.activeChunks.get(key);
        if (existing !== undefined) {
          newChunks.set(key, existing);
          continue;
        }

        const minX = newCoord.x * CHUNK_SIZE - SAMPLE_MARGIN;
        const maxX = (newCoord.x + 1) * CHUNK_SIZE + SAMPLE_MARGIN;
        const minZ = newCoord.z * CHUNK_SIZE - SAMPLE_MARGIN;
        const maxZ = (newCoord.z + 1) * CHUNK_SIZE + SAMPLE_MARGIN;
        if (!this.elevationSource.isReady(minX, minZ, maxX, maxZ)) {
          this.elevationSource.requestArea(minX, minZ, maxX, maxZ);
          continue; // tiles still loading; chunk materializes on a later tick
        }
        newChunks.set(key, this.generateChunk(newCoord));
      }
    }

    if (newChunks.has(centerKey)) this.activeChunks = newChunks;
  }

  clearActiveChunks(): void {
    this.activeChunks = new Map();
  }

  getActiveChunks(): WorldChunk[] {
    return Array.from(this.activeChunks.values()).map(cd => cd.chunk);
  }

  getChunk(coord: ChunkCoordinate): WorldChunk | undefined {
    return this.activeChunks.get(this.chunkKey(coord))?.chunk;
  }

  /** Get the heightmap buffer for a chunk (for render mesh generation). */
  getHeightmap(coord: ChunkCoordinate): Float32Array | undefined {
    return this.activeChunks.get(this.chunkKey(coord))?.heightmap;
  }

  /** Get a neighbor chunk heightmap for seamless edge matching. */
  getNeighborHeightmap(coord: ChunkCoordinate, dx: number, dz: number): Float32Array | undefined {
    return this.activeChunks.get((coord.x + dx) + ',' + coord.y + ',' + (coord.z + dz))?.heightmap;
  }

  private chunkKey(coord: ChunkCoordinate): string {
    return coord.x + ',' + coord.y + ',' + coord.z;
  }
}

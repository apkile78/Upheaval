/**
 * World chunk simulation manager.
 * Handles deterministic procedural chunk generation and active-chunk
 * lifecycle management around a simulation center point.
 *
 * Architecture: /src/sim/ layer is pure TypeScript, zero rendering imports.
 */

import type {
  ChunkCoordinate,
  TerrainTile,
  TileTerrainType,
  WorldChunk,
} from '../../types/world';

/** Number of tiles per axis in a chunk (chunk dimension). */
export const CHUNK_SIZE = 16;

/** Minimum surface height. */
const MIN_SURFACE_HEIGHT = 2;

/**
 * Manages active world chunks around a given coordinate.
 * Chunks are generated deterministically using a seeded noise function,
 * ensuring reproducible results across sessions.
 */
export class ChunkManager {
  private activeChunks: Map<string, WorldChunk>;
  private readonly baseSeed: number;

  constructor(baseSeed: number = 0) {
    this.activeChunks = new Map();
    this.baseSeed = baseSeed;
  }

  /**
   * Deterministically generate a chunk at the given coordinate using the seed.
   * Surface height and terrain types are derived from world-space coordinates
   * and the provided seed, ensuring reproducible results.
   */
  generateChunk(coord: ChunkCoordinate, seed: number): WorldChunk {
    const tiles: TerrainTile[][][] = [];

    for (let x = 0; x < CHUNK_SIZE; x++) {
      const column: TerrainTile[][] = [];
      for (let y = 0; y < CHUNK_SIZE; y++) {
        const slice: TerrainTile[] = [];
        for (let z = 0; z < CHUNK_SIZE; z++) {
          slice.push(this.generateTile(coord, x, y, z, seed));
        }
        column.push(slice);
      }
      tiles.push(column);
    }

    return {
      coordinate: { ...coord },
      tiles,
      seed,
    };
  }

  /** Generate a single terrain tile deterministically from world coordinates. */
  private generateTile(
    coord: ChunkCoordinate,
    lx: number,
    ly: number,
    lz: number,
    seed: number,
  ): TerrainTile {
    const worldX = coord.x * CHUNK_SIZE + lx;
    const worldY = coord.y * CHUNK_SIZE + ly;
    const worldZ = coord.z * CHUNK_SIZE + lz;

    const surfaceHeight = this.getHeight(worldX, worldY, seed);
    const terrainType = this.getTerrainType(
      worldX,
      worldY,
      worldZ,
      surfaceHeight,
      seed,
    );

    return {
      terrainType,
      elevation: surfaceHeight,
    };
  }

  /** Compute surface elevation at (x, y) using interpolated noise. */
  private getHeight(x: number, y: number, seed: number): number {
    const noise = this.noise2D(x, y, seed);
    return (
      Math.floor(noise * (CHUNK_SIZE - MIN_SURFACE_HEIGHT)) + MIN_SURFACE_HEIGHT
    );
  }

  /** Determine terrain type based on position relative to surface. */
  private getTerrainType(
    worldX: number,
    worldY: number,
    worldZ: number,
    surfaceHeight: number,
    seed: number,
  ): TileTerrainType {
    if (worldZ < surfaceHeight - 2) {
      return 'stone';
    }
    if (worldZ < surfaceHeight) {
      return 'dirt';
    }
    // Surface or above-ground — assign biome type
    return this.getBiomeType(worldX, worldY, seed);
  }


  /** Map elevation and moisture noise to a biome terrain type. */
  private getBiomeType(x: number, y: number, seed: number): TileTerrainType {
    const elevationNoise = this.noise2D(x, y, seed + 1);
    const moistureNoise = this.noise2D(x, y, seed + 2);

    if (elevationNoise < 0.2) {
      return 'water';
    }
    if (elevationNoise < 0.25) {
      return 'sand';
    }
    if (elevationNoise > 0.7) {
      return moistureNoise > 0.55 ? 'snow' : 'mountain';
    }
    if (moistureNoise > 0.65) {
      return 'forest';
    }
    return 'grass';
  }


  /**
   * Deterministic 2D value noise with bilinear interpolation.
   * Produces smooth, continuous values in [0, 1).
   */
  private noise2D(x: number, y: number, seed: number): number {
    const cellSize = 16;
    const fx = x / cellSize;
    const fy = y / cellSize;
    const gx = Math.floor(fx);
    const gy = Math.floor(fy);
    const tx = fx - gx;
    const ty = fy - gy;

    const h00 = this.hash2D(gx, gy, seed);
    const h10 = this.hash2D(gx + 1, gy, seed);
    const h01 = this.hash2D(gx, gy + 1, seed);
    const h11 = this.hash2D(gx + 1, gy + 1, seed);

    const h0 = h00 * (1 - tx) + h10 * tx;
    const h1 = h01 * (1 - tx) + h11 * tx;
    return h0 * (1 - ty) + h1 * ty;
  }



  /** Seeded integer hash returning a value in [0, 1). */
  private hash2D(x: number, y: number, seed: number): number {
    const h = ((x * 73856093) ^ (y * 19349663) ^ (seed * 13787189)) >>> 0;
    const h2 = (h ^ (h >> 16)) >>> 0;
    return (h2 % 10000) / 10000;
  }


  /**
   * Load new chunks within radius of the center coordinate and unload
   * chunks that have fallen outside the radius. Existing chunks are reused.
   */
  updateActiveChunks(centerCoord: ChunkCoordinate, radius: number): void {
    const newChunks = new Map<string, WorldChunk>();

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const newCoord: ChunkCoordinate = {
            x: centerCoord.x + dx,
            y: centerCoord.y + dy,
            z: centerCoord.z + dz,
          };
          const key = this.chunkKey(newCoord);

          const existing = this.activeChunks.get(key);
          if (existing !== undefined) {
            newChunks.set(key, existing);
          } else {
            newChunks.set(key, this.generateChunk(newCoord, this.baseSeed));
          }
        }
      }
    }

    this.activeChunks = newChunks;
  }

  /** Return all currently active chunks. */
  getActiveChunks(): WorldChunk[] {
    return Array.from(this.activeChunks.values());
  }

  /** Retrieve a single active chunk by coordinate, or undefined if not loaded. */
  getChunk(coord: ChunkCoordinate): WorldChunk | undefined {
    return this.activeChunks.get(this.chunkKey(coord));
  }

  /** Convert a chunk coordinate to a stable string key for Map lookups. */
  private chunkKey(coord: ChunkCoordinate): string {
    return coord.x + ',' + coord.y + ',' + coord.z;
  }
}

/** Singleton instance for default world generation. */
export const chunkManager: ChunkManager = new ChunkManager();
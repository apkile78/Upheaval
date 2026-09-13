/**
 * World chunk manager with East Coast terrain generation.
 *
 * Architecture: /src/sim/ layer — pure TypeScript, zero rendering imports.
 */

import type { ChunkCoordinate, TerrainTile, WorldChunk } from '../../types/world';
import { BiomeManager } from './biomeManager';
import { MacroHeightmap } from './macroHeightmap';
import { RiverGenerator } from './riverGenerator';
import { carveRiverTiles } from './riverCarve';
import { RegionMap, REGION_BIASES } from './regionMap';

export const CHUNK_SIZE = 16;

interface ChunkData {
  chunk: WorldChunk;
  heightmap: Float32Array;
}

export class ChunkManager {
  private activeChunks: Map<string, ChunkData>;
  private biomeManager: BiomeManager;
  private riverGenerator: RiverGenerator;

  constructor(baseSeed: number = 0) {
    this.activeChunks = new Map();
    this.biomeManager = new BiomeManager(baseSeed);

    // Macro-scale systems (Step 6.3/6.4): coarse sampler + deterministic
    // river tracing, both driven by the meandering coast factor (Step 6.2).
    const coastFactor = (wx: number, wz: number): number => this.biomeManager.getCoastFactor(wx, wz);
    const macro = new MacroHeightmap(baseSeed, coastFactor);
    this.riverGenerator = new RiverGenerator(baseSeed, macro, coastFactor);
    this.riverGenerator.generate();

    // Region classification (Step 6.5/6.6): biases chunk generation nudging
    // elevation/moisture output - never overriding the base noise - based on
    // the archetype at each location, alongside intersecting river data.
    const regionMap = new RegionMap(baseSeed, macro, coastFactor, this.riverGenerator);
    this.biomeManager.setRegionProvider((wx: number, wz: number) => REGION_BIASES[regionMap.getRegionAt(wx, wz)]);
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

    // River carving (Step 6.4): if any traced river path passes near this
    // chunk's bounds, carve its surface tiles to 'water'. Heightmap is left
    // untouched so terrain-follow physics and render meshes stay consistent.
    const pad = 128;
    const minX = coord.x * CHUNK_SIZE - pad;
    const maxX = (coord.x + 1) * CHUNK_SIZE + pad;
    const minZ = coord.z * CHUNK_SIZE - pad;
    const maxZ = (coord.z + 1) * CHUNK_SIZE + pad;
    const riverPoints = this.riverGenerator.getRiverPointsNear(minX, minZ, maxX, maxZ);
    if (riverPoints.length > 0) {
      carveRiverTiles(chunk, riverPoints);
    }

    return { chunk, heightmap };
  }

  private generateTile(_worldX: number, worldY: number, _worldZ: number, surfaceHeight: number): TerrainTile {
    if (worldY > surfaceHeight) {
      return { terrainType: 'grass', elevation: -1 }; // Air
    }
    const type = this.biomeManager.getTileType(worldY, surfaceHeight);
    return { terrainType: type, elevation: surfaceHeight };
  }

  /** Bilinear height lookup - smooth across chunk boundaries. */
  getHeightAt(worldX: number, worldZ: number): number {
    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
    const key = chunkX + ',' + 0 + ',' + chunkZ;
    const chunkData = this.activeChunks.get(key);

    if (!chunkData) return this.biomeManager.getElevation(worldX, worldZ);

    const localX = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    const ix = Math.floor(localX);
    const iz = Math.floor(localZ);
    const tx = localX - ix;
    const tz = localZ - iz;

    const ix1 = Math.min(ix + 1, CHUNK_SIZE - 1);
    const iz1 = Math.min(iz + 1, CHUNK_SIZE - 1);

    const h00 = chunkData.heightmap[ix * CHUNK_SIZE + iz] || 0;
    const h10 = chunkData.heightmap[ix1 * CHUNK_SIZE + iz] || 0;
    const h01 = chunkData.heightmap[ix * CHUNK_SIZE + iz1] || 0;
    const h11 = chunkData.heightmap[ix1 * CHUNK_SIZE + iz1] || 0;

    const h0 = h00 * (1 - tx) + h10 * tx;
    const h1 = h01 * (1 - tx) + h11 * tx;
    return h0 * (1 - tz) + h1 * tz;
  }

  updateActiveChunks(centerCoord: ChunkCoordinate, radius: number): void {
    const newChunks = new Map<string, ChunkData>();

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
        } else {
          newChunks.set(key, this.generateChunk(newCoord));
        }
      }
    }

    this.activeChunks = newChunks;
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

export const chunkManager: ChunkManager = new ChunkManager();

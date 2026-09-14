/**
 * Core type definitions for the world simulation layer.
 * Defines coordinate systems, terrain tiles, chunk structures, and the
 * real-Earth elevation source contract used by the simulation layer.
 */

/**
 * A 3D vector with double-precision floats for floating-origin coordinate systems.
 * Re-use vectors rather than allocating new ones inside hot loops.
 */
export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Integer grid coordinates identifying a single world chunk.
 * Used for chunk indexing, spatial hashing, and floating-origin offsets.
 */
export interface ChunkCoordinate {
  x: number;
  y: number;
  z: number;
}

/**
 * All possible terrain types for a terrain tile.
 * Aligns with procedural biome generation and texture-atlas lookups.
 */
export type TileTerrainType =
  | 'grass'
  | 'dirt'
  | 'stone'
  | 'water'
  | 'sand'
  | 'forest'
  | 'mountain'
  | 'road'
  | 'building'
  | 'swamp'
  | 'snow'
  | 'metal';

/**
 * A single tile within a chunk 3D tile matrix.
 * Contains terrain type and absolute elevation for heightmap integration.
 */
export interface TerrainTile {
  terrainType: TileTerrainType;
  elevation: number;
}

/**
 * A fixed-size chunk of the world containing a 3D tile matrix.
 * The third axis represents vertical layers (surface through subterranean depths).
 * Each chunk is seeded for deterministic procedural generation.
 */
export interface WorldChunk {
  coordinate: ChunkCoordinate;
  tiles: TerrainTile[][][];
  seed: number;
}

/**
 * Real-Earth elevation source contract (1 game unit = 1 meter, sea level = 0).
 * Backed by tiled NOAA ETOPO 2022 data; tiles load asynchronously and are
 * cached in an LRU. All coordinates are world units (equirectangular meters).
 */
export interface EarthElevationSource {
  /** Surface elevation in meters (bilinear; negative = below sea level). */
  sampleHeight(worldX: number, worldZ: number): number;
  /** True when all tiles needed to sample the given world-space box are resident. */
  isReady(minX: number, minZ: number, maxX: number, maxZ: number): boolean;
  /** Kick off async loads for all tiles covering the given box (idempotent). */
  requestArea(minX: number, minZ: number, maxX: number, maxZ: number): void;
  /** Resolves once every tile requested so far has arrived (or failed). */
  waitForArea(): Promise<void>;
  /** Number of tiles currently resident in the LRU cache. */
  cachedTileCount(): number;
}

/** Runtime metadata for the Earth elevation asset set (meta.json schema). */
export interface EarthElevMeta {
  gridCols: number;
  gridRows: number;
  cellArcSec: number;
  tilePx: number;
  tilesX: number;
  tilesY: number;
  elevOffset: number;
  minElev: number;
  maxElev: number;
  source: string;
}


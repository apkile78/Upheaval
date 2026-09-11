/**
 * Core type definitions for the world simulation layer.
 * Defines coordinate systems, terrain tiles, and chunk structures
 * used by the simulation layer for procedural world generation.
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

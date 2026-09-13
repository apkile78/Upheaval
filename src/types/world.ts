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

/**
 * Function returning the coast factor for a world coordinate:
 * 0 = ocean/east, 1 = far inland/west. Implemented by
 * BiomeManager.getCoastFactor (meandering coastline, Step 6.2) and consumed
 * by macro-scale systems (rivers, regions).
 */
export type CoastFactorFn = (worldX: number, worldZ: number) => number;

/**
 * Seed-generated continent profile information.
 * Phase 1 adds a deterministic landmask that isolates continental interiors
 * from the ocean while leaving the existing coastline meander machinery intact.
 */
export interface ClimateField {
  direction: number;
  strength: number;
  humidity: number;
  rainShadow: number;
}

export interface ContinentSpec {
  id: string;
  centerX: number;
  centerZ: number;
  radiusX: number;
  radiusZ: number;
  strength: number;
}

export interface ContinentProfile {
  seed: number;
  continents: ContinentSpec[];
  climate: ClimateField;
  coastBias: number;
}

export interface BasinInfo {
  id: BasinId;
  continentId: string;
  centerX: number;
  centerZ: number;
  headwaterX: number;
  headwaterZ: number;
  outletX: number;
  outletZ: number;
  outletType: OutletType;
  width: number;
  baseLevel: number;
  dominantBiome: 'temperate_rainforest' | 'arid_plateau' | 'prairie' | 'swamp' | 'coastal_plain';
}

export type BasinId = string;
export type OutletType = 'ocean' | 'endorheic' | 'lake';

/**
 * A traced river path in world space. Points are ordered from source
 * (highland) to mouth (coastline); width is the full corridor width in
 * world units. Produced by RiverGenerator and consumed for tile carving.
 */
export interface RiverPath {
  points: Vector3D[];
  width: number;
}

/**
 * Procedural region archetypes (Step 6.5). Each chunk location is classified
 * into exactly one archetype; the associated biases nudge - never override -
 * the base elevation / moisture / vegetation noise output.
 */
export type RegionArchetype =
  | 'coastal_bay'
  | 'river_valley'
  | 'upland_plain'
  | 'ridge_highland'
  | 'coastal_plain';

/**
 * Per-archetype generation biases.
 * - elevationBias: multiplicative nudge on biome elevation (added to 1).
 * - moistureBias:  additive nudge on moisture (clamped to [0, 1]).
 * - vegetationBias: reserved for vegetation-density systems (Step 6.7+).
 */
export interface RegionBiases {
  elevationBias: number;
  moistureBias: number;
  vegetationBias: number;
}

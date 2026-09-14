/**
 * Earth terrain configuration — 1:1 real-world scale.
 *
 * 1 game unit = 1 meter, sea level = 0. The world is an equirectangular
 * projection of the real Earth: x grows eastward from the antimeridian,
 * z grows southward from the North Pole. Elevation data comes from NOAA
 * ETOPO 2022 (60 arc-second / 1 arc-minute global relief, public domain),
 * pre-tiled into PNG assets by scripts/convert-earth-dem.mjs.
 *
 * Architecture: /src/sim/ layer - pure TypeScript, zero rendering imports.
 */

/** Meters per degree of latitude/longitude on the equirectangular map. */
export const METERS_PER_DEGREE = 111320;

/** Sea level in world units (meters). */
export const SEA_LEVEL = 0;

/** Default spawn point (real-world latitude/longitude, on land). */
export const EARTH_SPAWN_LAT = 51.5074; // London
export const EARTH_SPAWN_LON = -0.1278;

/** Global elevation grid dimensions (1 arc-minute cells). */
export const GRID_COLS = 21600; // 360 deg / 1 arcmin
export const GRID_ROWS = 10800; // 180 deg / 1 arcmin

/** Tile layout: the global grid is split into tilePx x tilePx PNG tiles. */
export const TILE_PX = 2160;
export const TILES_X = 10;
export const TILES_Y = 5;

/**
 * Elevation storage offset: PNG bytes carry (elevation + ELEV_OFFSET) as an
 * unsigned 16-bit value split across the R (high) and G (low) channels.
 * Range: -11000 m .. +54535 m comfortably covers Earth (-11034 .. +8849).
 */
export const ELEV_OFFSET = 11000;

/** Maximum tiles resident in the elevation LRU cache (9.3 MB each). */
export const MAX_RESIDENT_TILES = 10;

/** Base URL (vite base is './') for the elevation asset set. */
export const ASSET_META_URL = 'assets/earth/meta.json';

/** Tile asset URL for a tile row/col index. */
export function tileAssetUrl(row: number, col: number): string {
  return `assets/earth/tiles/r${row}_c${col}.png`;
}

/** Cell size in meters (both axes; cells are square at the equator). */
export const CELL_METERS = METERS_PER_DEGREE / 60; // 1 arc-minute ~ 1855.33 m

/** World extents in meters (equirectangular map). */
export const WORLD_WIDTH_METERS = 360 * METERS_PER_DEGREE;
export const WORLD_HEIGHT_METERS = 180 * METERS_PER_DEGREE;

/** Spawn world coordinates (computed once from the configured lat/lon). */
export const EARTH_SPAWN: { x: number; z: number } = {
  x: (EARTH_SPAWN_LON + 180) * METERS_PER_DEGREE,
  z: (90 - EARTH_SPAWN_LAT) * METERS_PER_DEGREE,
};

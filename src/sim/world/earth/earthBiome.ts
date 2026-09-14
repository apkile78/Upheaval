/**
 * Real-Earth biome classification.
 *
 * Terrain type is derived from real latitude and real elevation (meters),
 * shaped by a small deterministic moisture field. This is a coarse climate
 * approximation (latitude bands + tree line + polar caps), not a full
 * climate model — see docs/02 for the v1 scope.
 *
 * Architecture: /src/sim/ layer - pure TypeScript, zero rendering imports.
 */

import type { TileTerrainType } from '../../../types/world';

/** Latitude bands (absolute degrees) used by the classifier. */
export const POLAR_ICE_LAT = 72; // permanent ice caps (Greenland interior etc.)
export const TUNDRA_LAT = 66; // treeless polar fringe
export const DESERT_LAT_MIN = 15; // subtropical high-pressure belt
export const DESERT_LAT_MAX = 35;
export const TEMPERATE_HUMID_MIN = 40; // westerlies belt

/** Elevation bands (meters) used by the classifier. */
export const BEACH_MAX_M = 3;
export const TREE_LINE_TROPICAL_M = 4600; // ~ snow line, tropical latitudes
export const TREE_LINE_POLAR_M = 800; // tree line drops toward the poles
export const ALPINE_STONE_M = 2800;

/**
 * Latitude-shaped base moisture in [0, 1]: wet at the equator and in the
 * westerlies, dry in the subtropical highs. Callers add their own noise.
 */
export function latitudeMoisture(lat: number): number {
  const abs = Math.abs(lat);
  if (abs < 10) return 0.85; // ITCZ
  if (abs <= DESERT_LAT_MAX) {
    // Interpolate wet ITCZ -> dry subtropics across 10..25 deg.
    if (abs < 25) return 0.85 - ((abs - 10) / 15) * 0.65;
    return 0.2;
  }
  if (abs < TEMPERATE_HUMID_MIN) return 0.2 + ((abs - DESERT_LAT_MAX) / 5) * 0.4;
  return 0.65; // temperate/cold belts stay humid enough for vegetation
}

/** Combine a moisture noise sample with the latitude climatology. */
export function blendMoisture(lat: number, noise01: number): number {
  const base = latitudeMoisture(lat);
  return Math.max(0, Math.min(1, base * 0.7 + noise01 * 0.3));
}

/** Classify a surface tile from real latitude, elevation, and moisture. */
export function classifyEarthBiome(lat: number, elevation: number, moisture: number): TileTerrainType {
  const abs = Math.abs(lat);
  if (elevation <= 0) return 'water';
  if (abs >= POLAR_ICE_LAT) return 'snow';
  if (elevation >= TREE_LINE_TROPICAL_M) return 'snow';
  const treeLine = TREE_LINE_POLAR_M + ((TUNDRA_LAT - Math.min(abs, TUNDRA_LAT)) / TUNDRA_LAT) * (TREE_LINE_TROPICAL_M - TREE_LINE_POLAR_M);
  if (elevation >= ALPINE_STONE_M && elevation >= treeLine) return 'stone';
  if (abs >= TUNDRA_LAT) return moisture > 0.55 ? 'dirt' : 'snow';
  if (elevation >= ALPINE_STONE_M) return 'mountain';
  if (elevation >= treeLine) return 'stone';

  if (abs >= DESERT_LAT_MIN && abs <= DESERT_LAT_MAX && moisture < 0.38) return 'sand';
  if (abs >= DESERT_LAT_MIN && abs <= DESERT_LAT_MAX && moisture < 0.55) return 'dirt';

  if (elevation <= BEACH_MAX_M) return 'sand';
  if (elevation <= BEACH_MAX_M + 5 && moisture > 0.8) return 'swamp';

  if (moisture > 0.55) return 'forest';
  if (moisture > 0.4) return 'grass';
  return 'dirt';
}

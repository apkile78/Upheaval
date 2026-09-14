/**
 * Equirectangular Earth projection - world meters <-> latitude/longitude.
 *
 * Pure functions with no state. 1 game unit = 1 meter (see earthConfig).
 *
 * Architecture: /src/sim/ layer - pure TypeScript, zero rendering imports.
 */

import { METERS_PER_DEGREE } from './earthConfig';

export interface LatLon {
  lat: number;
  lon: number;
}

/** World X (meters east of the antimeridian) and Z (meters south of the pole). */
export interface WorldXZ {
  x: number;
  z: number;
}

/** Latitude/longitude -> world meters. Longitude may be any real value. */
export function latLonToWorld(lat: number, lon: number): WorldXZ {
  return {
    x: (lon + 180) * METERS_PER_DEGREE,
    z: (90 - lat) * METERS_PER_DEGREE,
  };
}

/** World meters -> latitude/longitude. Longitude wrapped to [-180, 180). */
export function worldToLatLon(worldX: number, worldZ: number): LatLon {
  return {
    lat: 90 - worldZ / METERS_PER_DEGREE,
    lon: wrapLongitude(worldX / METERS_PER_DEGREE - 180),
  };
}

/** Wrap an arbitrary longitude into the canonical [-180, 180) range. */
export function wrapLongitude(lon: number): number {
  let l = lon % 360;
  if (l >= 180) l -= 360;
  if (l < -180) l += 360;
  return l;
}

/** Clamp a latitude into the valid [-90, 90] range. */
export function clampLatitude(lat: number): number {
  return Math.max(-90, Math.min(90, lat));
}

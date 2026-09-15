/**
 * Equirectangular Earth projection - world meters <-> latitude/longitude.
 *
 * Pure functions with no state. 1 game unit = 1 meter (see earthConfig).
 *
 * Architecture: /src/sim/ layer - pure TypeScript, zero rendering imports.
 */

import { METERS_PER_DEGREE } from './earthConfig';

const DEG_TO_RAD = Math.PI / 180;

/** Clamp for `metersPerUnitX` (cos 85 deg) at extreme latitudes. */
export const MIN_EAST_SCALE = 0.0871557;

/**
 * True ground metres per world unit along the X (east-west) axis.
 *
 * The world X axis is an equirectangular longitude axis, so one unit covers
 * `cos(latitude)` true ground metres. Real east-west movement of `d` metres at
 * latitude `lat` therefore needs `d / metersPerUnitX(lat)` world units.
 *
 * The factor is clamped at `MIN_EAST_SCALE` so polar movement cannot divide by
 * zero or explode the world-space step (see docs/08 for the sim/render scale
 * contract).
 */
export function metersPerUnitX(lat: number): number {
  const cosLat = Math.cos(clampLatitude(lat) * DEG_TO_RAD);
  return Math.max(MIN_EAST_SCALE, cosLat);
}

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

/** Latitude (degrees) at a world Z coordinate. Allocation-free latitude lookup. */
export function latitudeAt(worldZ: number): number {
  return 90 - worldZ / METERS_PER_DEGREE;
}

/** World meters -> latitude/longitude. Longitude wrapped to [-180, 180). */
export function worldToLatLon(worldX: number, worldZ: number): LatLon {
  return {
    lat: latitudeAt(worldZ),
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

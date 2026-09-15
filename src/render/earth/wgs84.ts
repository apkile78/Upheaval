export interface GeodeticCoordinate {
  lat: number;
  lon: number;
  height: number;
}

export interface EcefCoordinate {
  x: number;
  y: number;
  z: number;
}

export interface EnuVector {
  east: number;
  north: number;
  up: number;
}

export const WGS84_A = 6378137;
export const WGS84_INV_F = 298.257223563;
export const WGS84_F = 1 / WGS84_INV_F;
export const WGS84_B = WGS84_A * (1 - WGS84_F);
export const WGS84_E2 = WGS84_F * (2 - WGS84_F);
export const WGS84_EP2 = (WGS84_A * WGS84_A - WGS84_B * WGS84_B) / (WGS84_B * WGS84_B);
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export function geodeticToEcef(coordinate: GeodeticCoordinate): EcefCoordinate {
  const lat = coordinate.lat * DEG_TO_RAD;
  const lon = coordinate.lon * DEG_TO_RAD;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const radius = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const distance = radius + coordinate.height;

  return {
    x: distance * cosLat * Math.cos(lon),
    y: distance * cosLat * Math.sin(lon),
    z: (radius * (1 - WGS84_E2) + coordinate.height) * sinLat,
  };
}

export function ecefToGeodetic(coordinate: EcefCoordinate): GeodeticCoordinate {
  const distance = Math.hypot(coordinate.x, coordinate.y);
  if (distance < 1e-9) {
    return {
      lat: coordinate.z < 0 ? -90 : 90,
      lon: 0,
      height: Math.abs(coordinate.z) - WGS84_B,
    };
  }

  const theta = Math.atan2(coordinate.z * WGS84_A, distance * WGS84_B);
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);
  const latitude = Math.atan2(
    coordinate.z + WGS84_EP2 * WGS84_B * sinTheta ** 3,
    distance - WGS84_E2 * WGS84_A * cosTheta ** 3,
  );
  const longitude = Math.atan2(coordinate.y, coordinate.x);
  const sinLatitude = Math.sin(latitude);
  const radius = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLatitude * sinLatitude);
  const height = distance / Math.cos(latitude) - radius;

  return {
    lat: latitude * RAD_TO_DEG,
    lon: longitude * RAD_TO_DEG,
    height,
  };
}

export function enuBasis(origin: GeodeticCoordinate): {
  east: EcefCoordinate;
  north: EcefCoordinate;
  up: EcefCoordinate;
} {
  const lat = origin.lat * DEG_TO_RAD;
  const lon = origin.lon * DEG_TO_RAD;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);

  return {
    east: { x: -sinLon, y: cosLon, z: 0 },
    north: { x: -sinLat * cosLon, y: -sinLat * sinLon, z: cosLat },
    up: { x: cosLat * cosLon, y: cosLat * sinLon, z: sinLat },
  };
}

export function ecefDeltaToEnu(
  delta: EcefCoordinate,
  origin: GeodeticCoordinate,
): EnuVector {
  const basis = enuBasis(origin);
  return {
    east: dot(delta, basis.east),
    north: dot(delta, basis.north),
    up: dot(delta, basis.up),
  };
}

export function enuToEcefDelta(
  local: EnuVector,
  origin: GeodeticCoordinate,
): EcefCoordinate {
  const basis = enuBasis(origin);
  return {
    x: local.east * basis.east.x + local.north * basis.north.x + local.up * basis.up.x,
    y: local.east * basis.east.y + local.north * basis.north.y + local.up * basis.up.y,
    z: local.east * basis.east.z + local.north * basis.north.z + local.up * basis.up.z,
  };
}

export function geodeticToEnu(
  coordinate: GeodeticCoordinate,
  origin: GeodeticCoordinate,
): EnuVector {
  const point = geodeticToEcef(coordinate);
  const originEcef = geodeticToEcef(origin);
  return ecefDeltaToEnu({
    x: point.x - originEcef.x,
    y: point.y - originEcef.y,
    z: point.z - originEcef.z,
  }, origin);
}

function dot(left: EcefCoordinate, right: EcefCoordinate): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

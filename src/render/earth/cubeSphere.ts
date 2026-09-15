import {
  ecefToGeodetic,
  geodeticToEcef,
  type EcefCoordinate,
  type GeodeticCoordinate,
  WGS84_A,
  WGS84_B,
} from './wgs84';

export type CubeFace = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

export interface CubeSpherePoint {
  face: CubeFace;
  u: number;
  v: number;
  position: EcefCoordinate;
  geodetic: GeodeticCoordinate;
}

export function faceUvToEcef(
  face: CubeFace,
  u: number,
  v: number,
  height = 0,
): EcefCoordinate {
  const direction = normalize(faceUvToCube(face, u, v));
  const base = {
    x: direction.x * wgs84SurfaceRadius(direction),
    y: direction.y * wgs84SurfaceRadius(direction),
    z: direction.z * wgs84SurfaceRadius(direction),
  };
  const geodetic = ecefToGeodetic(base);
  return geodeticToEcef({ ...geodetic, height });
}

export function faceUvToGeodetic(
  face: CubeFace,
  u: number,
  v: number,
  height = 0,
): GeodeticCoordinate {
  return ecefToGeodetic(faceUvToEcef(face, u, v, height));
}

export function geodeticToCubeSphere(
  coordinate: GeodeticCoordinate,
): { face: CubeFace; u: number; v: number } {
  const ecef = geodeticToEcef({ ...coordinate, height: 0 });
  const direction = normalize({ x: ecef.x, y: ecef.y, z: ecef.z });
  const ax = Math.abs(direction.x);
  const ay = Math.abs(direction.y);
  const az = Math.abs(direction.z);

  if (ax >= ay && ax >= az) {
    return direction.x >= 0
      ? { face: '+x', u: direction.z / ax, v: direction.y / ax }
      : { face: '-x', u: -direction.z / ax, v: direction.y / ax };
  }
  if (ay >= az) {
    return direction.y >= 0
      ? { face: '+y', u: direction.x / ay, v: direction.z / ay }
      : { face: '-y', u: -direction.x / ay, v: direction.z / ay };
  }
  return direction.z >= 0
    ? { face: '+z', u: direction.x / az, v: direction.y / az }
    : { face: '-z', u: direction.x / az, v: direction.y / az };
}

export function cubeSphereTileId(face: CubeFace, level: number, x: number, y: number): string {
  return face + '/' + level + '/' + x + '/' + y;
}

function faceUvToCube(face: CubeFace, u: number, v: number): EcefCoordinate {
  switch (face) {
    case '+x': return { x: 1, y: v, z: u };
    case '-x': return { x: -1, y: v, z: -u };
    case '+y': return { x: u, y: 1, z: v };
    case '-y': return { x: -u, y: -1, z: v };
    case '+z': return { x: u, y: v, z: 1 };
    case '-z': return { x: -u, y: v, z: -1 };
  }
}

function normalize(value: EcefCoordinate): EcefCoordinate {
  const length = Math.hypot(value.x, value.y, value.z);
  return { x: value.x / length, y: value.y / length, z: value.z / length };
}

export function wgs84SurfaceRadius(direction: EcefCoordinate): number {
  const unit = normalize(direction);
  const denominator = Math.sqrt(
    (unit.x * unit.x + unit.y * unit.y) / (WGS84_A * WGS84_A) +
    (unit.z * unit.z) / (WGS84_B * WGS84_B),
  );
  return 1 / denominator;
}

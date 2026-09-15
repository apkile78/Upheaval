import {
  cubeSphereTileId,
  faceUvToEcef,
  faceUvToGeodetic,
  geodeticToCubeSphere,
  wgs84SurfaceRadius,
} from '../src/render/earth/cubeSphere';
import { WGS84_A, WGS84_B } from '../src/render/earth/wgs84';

let failures = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) console.log('PASS: ' + name);
  else {
    failures++;
    console.error('FAIL: ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

function close(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

function main(): void {
  const faces = ['+x', '-x', '+y', '-y', '+z', '-z'] as const;
  for (const face of faces) {
    const point = faceUvToEcef(face, 0, 0);
    const length = Math.hypot(point.x, point.y, point.z);
    check(face + ' face maps to WGS84 surface', length >= WGS84_B && length <= WGS84_A);
    const edge = faceUvToGeodetic(face, 1, 0);
    check(face + ' edge has finite geodetic coordinates', Number.isFinite(edge.lat) && Number.isFinite(edge.lon));
  }

  const equator = faceUvToEcef('+x', 0, 0);
  check('equatorial cube direction reaches semi-major radius', close(equator.x, WGS84_A, 1e-6));
  const pole = faceUvToEcef('+z', 0, 0);
  check('polar cube direction reaches semi-minor radius', close(pole.z, WGS84_B, 1e-6));

  const anchors = [
    { lat: 51.5074, lon: -0.1278, height: 35 },
    { lat: 27.9881, lon: 86.925, height: 8050 },
    { lat: 0, lon: 179.999, height: 0 },
    { lat: -89.999, lon: -179.999, height: 0 },
  ];
  for (const anchor of anchors) {
    const tile = geodeticToCubeSphere(anchor);
    const roundTrip = faceUvToGeodetic(tile.face, tile.u, tile.v, anchor.height);
    check(
      'geodetic cube round trip ' + anchor.lat + ',' + anchor.lon,
      close(roundTrip.lat, anchor.lat, 1e-8) && close(roundTrip.lon, anchor.lon, 1e-8),
      roundTrip.lat + ',' + roundTrip.lon,
    );
  }

  check('tile IDs are stable', cubeSphereTileId('+x', 4, 7, 9) === '+x/4/7/9');
  check('surface radius is bounded', wgs84SurfaceRadius({ x: 1, y: 0, z: 0 }) === WGS84_A);

  if (failures > 0) throw new Error(failures + ' test(s) failed');
  console.log('All cube-sphere tests passed.');
}

main();

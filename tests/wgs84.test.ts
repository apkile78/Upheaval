import {
  ecefDeltaToEnu,
  ecefToGeodetic,
  enuToEcefDelta,
  geodeticToEcef,
  geodeticToEnu,
  WGS84_A,
  WGS84_B,
} from '../src/render/earth/wgs84';

let failures = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log('PASS: ' + name);
  } else {
    failures++;
    console.error('FAIL: ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

function close(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

function main(): void {
  const equator = geodeticToEcef({ lat: 0, lon: 0, height: 0 });
  check('WGS84 equator radius', close(equator.x, WGS84_A, 1e-6));
  check('WGS84 equator y is zero', close(equator.y, 0, 1e-9));
  check('WGS84 equator z is zero', close(equator.z, 0, 1e-9));

  const northPole = geodeticToEcef({ lat: 90, lon: 0, height: 0 });
  check('WGS84 pole radius', close(northPole.z, WGS84_B, 1e-6));

  const samples = [
    { lat: 51.5074, lon: -0.1278, height: 35 },
    { lat: 27.9881, lon: 86.925, height: 8050 },
    { lat: -33.9249, lon: 18.4241, height: 12 },
    { lat: 0, lon: 179.999, height: -4000 },
    { lat: -89.999, lon: -179.999, height: 100 },
  ];
  let roundTrips = true;
  for (const sample of samples) {
    const result = ecefToGeodetic(geodeticToEcef(sample));
    if (
      !close(result.lat, sample.lat, 1e-9) ||
      !close(result.lon, sample.lon, 1e-9) ||
      !close(result.height, sample.height, 1e-4)
    ) {
      roundTrips = false;
    }
  }
  check('ECEF geodetic round trips', roundTrips);

  const origin = { lat: 51.5074, lon: -0.1278, height: 35 };
  const east = geodeticToEcef({ lat: origin.lat, lon: origin.lon + 0.00001, height: origin.height });
  const originEcef = geodeticToEcef(origin);
  const eastLocal = ecefDeltaToEnu({
    x: east.x - originEcef.x,
    y: east.y - originEcef.y,
    z: east.z - originEcef.z,
  }, origin);
  check('longitude offset points east', eastLocal.east > 0 && Math.abs(eastLocal.north) < 0.01);

  const local = { east: 12, north: -7, up: 3 };
  const recovered = ecefDeltaToEnu(enuToEcefDelta(local, origin), origin);
  check(
    'ENU conversion preserves local meters',
    close(recovered.east, local.east, 1e-9) &&
      close(recovered.north, local.north, 1e-9) &&
      close(recovered.up, local.up, 1e-9),
  );
  check('geodetic ENU matches ECEF ENU', (() => {
    const point = { lat: origin.lat + 0.00001, lon: origin.lon, height: origin.height + 4 };
    const direct = geodeticToEnu(point, origin);
    const ecefPoint = geodeticToEcef(point);
    return close(direct.north, ecefDeltaToEnu({
      x: ecefPoint.x - originEcef.x,
      y: ecefPoint.y - originEcef.y,
      z: ecefPoint.z - originEcef.z,
    }, origin).north, 1e-9);
  })());

  if (failures > 0) throw new Error(failures + ' test(s) failed');
  console.log('All WGS84 tests passed.');
}

main();

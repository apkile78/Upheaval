/**
 * Earth projection tests - world meters <-> latitude/longitude.
 *
 * Plain TypeScript, no test-runner dependency. Run via scripts/run-tests.mjs.
 */

import { latLonToWorld, worldToLatLon, wrapLongitude, clampLatitude } from '../src/sim/world/earth/earthProjection';
import { METERS_PER_DEGREE, EARTH_SPAWN } from '../src/sim/world/earth/earthConfig';

let failures = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log('PASS: ' + name);
  } else {
    failures++;
    console.error('FAIL: ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

// 1. Known anchor mappings (1 game unit = 1 meter, equirectangular).
const equatorOrigin = latLonToWorld(0, 0);
check('lat 0 / lon 0 maps to half-width x', Math.abs(equatorOrigin.x - 180 * METERS_PER_DEGREE) < 1e-6);
check('lat 0 / lon 0 maps to quarter-height z', Math.abs(equatorOrigin.z - 90 * METERS_PER_DEGREE) < 1e-6);

const northPole = latLonToWorld(90, 0);
check('north pole sits at z = 0', Math.abs(northPole.z) < 1e-6);

const southPole = latLonToWorld(-90, 0);
check('south pole sits at z = full height', Math.abs(southPole.z - 180 * METERS_PER_DEGREE) < 1e-6);

// 2. Round trips across representative lat/lon pairs.
const samples: [number, number][] = [
  [51.5074, -0.1278],  // London
  [27.9881, 86.925],   // Everest
  [-33.9249, 18.4241], // Cape Town
  [35.6762, 139.6503], // Tokyo
  [0, 179.999],        // near antimeridian
  [-89.999, -179.999], // near south pole / antimeridian
];
let roundTripOk = true;
for (const [lat, lon] of samples) {
  const w = latLonToWorld(lat, lon);
  const back = worldToLatLon(w.x, w.z);
  if (Math.abs(back.lat - lat) > 1e-9 || Math.abs(back.lon - lon) > 1e-9) {
    roundTripOk = false;
    check('round trip ' + lat + ',' + lon, false, 'got ' + back.lat + ',' + back.lon);
  }
}
check('lat/lon round trips are exact to 1e-9', roundTripOk);

// 3. Longitude wrapping.
check('wrap 190 -> -170', Math.abs(wrapLongitude(190) - -170) < 1e-9);
check('wrap -190 -> 170', Math.abs(wrapLongitude(-190) - 170) < 1e-9);
check('wrap 180 -> -180', Math.abs(wrapLongitude(180) - -180) < 1e-9);
check('wrap 540 -> -180', Math.abs(wrapLongitude(540) - -180) < 1e-9);
check('wrap 360 -> 0', Math.abs(wrapLongitude(360)) < 1e-9);

// 4. Latitude clamping.
check('clamp 95 -> 90', clampLatitude(95) === 90);
check('clamp -95 -> -90', clampLatitude(-95) === -90);
check('clamp 10 -> 10', clampLatitude(10) === 10);

// 5. Antipode walking eastward across the antimeridian stays continuous.
const a = worldToLatLon(latLonToWorld(10, 179.9999).x + 30, latLonToWorld(10, 179.9999).z);
check('crossing the antimeridian wraps longitude', a.lon < -179.99);

// 6. Spawn is on the Northern Hemisphere land side (positive z below pole,
//    right of the antimeridian) and matches the projection of its lat/lon.
const spawnWorld = latLonToWorld(51.5074, -0.1278);
check('spawn config matches projection', Math.abs(spawnWorld.x - EARTH_SPAWN.x) < 1e-6 && Math.abs(spawnWorld.z - EARTH_SPAWN.z) < 1e-6);
check('spawn sits on the Greenwich meridian (within 1 degree)', Math.abs(EARTH_SPAWN.x - 180 * METERS_PER_DEGREE) < METERS_PER_DEGREE);
check('spawn is north of the equator (z < 90deg)', EARTH_SPAWN.z < 90 * METERS_PER_DEGREE);

if (failures > 0) {
  throw new Error(failures + ' test(s) failed');
}
console.log('All earthProjection tests passed.');

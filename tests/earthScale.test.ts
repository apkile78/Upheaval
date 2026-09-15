/**
 * Sim <-> render scale contract tests.
 *
 * The sim's X axis is an equirectangular longitude axis, while the renderer
 * works in true-metre ENU. These tests lock the conversion that keeps one
 * movement step of `d` true metres equal to `d` rendered metres at any
 * latitude (see docs/08_earth_coordinates_and_render_origin.md).
 *
 * Plain TypeScript, no test-runner dependency. Run via scripts/run-tests.mjs.
 */

import {
  latitudeAt,
  latLonToWorld,
  metersPerUnitX,
  MIN_EAST_SCALE,
  worldToLatLon,
} from '../src/sim/world/earth/earthProjection';
import { createLocalEarthFrame, worldToLocalEnu } from '../src/render/earth/localFrame';
import type { LocalEarthFrame } from '../src/render/earth/localFrame';

let failures = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log('PASS: ' + name);
  } else {
    failures++;
    console.error('FAIL: ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

/** True ground metres between two sim positions, measured through the ENU frame. */
function groundMeters(
  frame: LocalEarthFrame,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): number {
  const from = worldToLocalEnu(x0, z0, 0, frame);
  const to = worldToLocalEnu(x1, z1, 0, frame);
  return Math.hypot(to.east - from.east, to.north - from.north);
}

/** Player speed / timestep mirrored from playerController (m/s, seconds). */
const SPEED = 8;
const DT = 1 / 60;
const STEP_METERS = SPEED * DT;

/**
 * One movement step exactly as playerController applies it: a unit direction in
 * true metres, with the east component converted through `metersPerUnitX`.
 */
function scaledStep(
  lat: number,
  eastDirection: number,
  northDirection: number,
): { lat: number; meters: number; naiveMeters: number } {
  const start = latLonToWorld(lat, 0);
  const frame = createLocalEarthFrame(start.x, start.z, 0);
  const len = Math.hypot(eastDirection, northDirection);
  const eastUnits = 1 / metersPerUnitX(latitudeAt(start.z));

  const x = start.x + (eastDirection / len) * STEP_METERS * eastUnits;
  const z = start.z + (northDirection / len) * STEP_METERS;
  const naiveX = start.x + (eastDirection / len) * STEP_METERS;

  return {
    lat,
    meters: groundMeters(frame, start.x, start.z, x, z),
    naiveMeters: groundMeters(frame, start.x, start.z, naiveX, z),
  };
}

function main(): void {
  // 1. The east-west factor itself.
  check('equator unit is one true metre', Math.abs(metersPerUnitX(0) - 1) < 1e-12, String(metersPerUnitX(0)));
  check('60 deg halves east-west metres per unit', Math.abs(metersPerUnitX(60) - 0.5) < 1e-12, String(metersPerUnitX(60)));
  check('factor is symmetric across the equator', metersPerUnitX(-60) === metersPerUnitX(60));
  check('latitudes beyond the poles are clamped', metersPerUnitX(-95) === metersPerUnitX(90));
  check('extreme latitude clamps to MIN_EAST_SCALE', metersPerUnitX(89.999) === MIN_EAST_SCALE, String(metersPerUnitX(89.999)));

  // 2. latitudeAt must agree with the full projection.
  let latitudeAgrees = true;
  for (const lat of [0, 24.5, 51.5074, 80, -33.9]) {
    const world = latLonToWorld(lat, 12);
    if (Math.abs(latitudeAt(world.z) - worldToLatLon(world.x, world.z).lat) > 1e-9) latitudeAgrees = false;
    if (Math.abs(latitudeAt(world.z) - lat) > 1e-9) latitudeAgrees = false;
  }
  check('latitudeAt matches worldToLatLon', latitudeAgrees);

  // 3. A step of SPEED*dt true metres stays that long in render space at every
  //    latitude, in every direction (this is the sim/render scale contract).
  let eastOk = true;
  let northOk = true;
  let diagonalOk = true;
  let naiveIsWrongAt60 = false;
  for (const lat of [0, 24.5, 45, 60, 75, 85]) {
    const east = scaledStep(lat, 1, 0);
    const north = scaledStep(lat, 0, 1);
    const diagonal = scaledStep(lat, 0.7071067811865476, 0.7071067811865476);
    const tolerance = STEP_METERS * 0.01;

    if (Math.abs(east.meters - STEP_METERS) > tolerance) {
      eastOk = false;
      check('east step stays true at ' + lat + ' deg', false, east.meters + ' m');
    }
    if (Math.abs(north.meters - STEP_METERS) > tolerance) {
      northOk = false;
      check('north step stays true at ' + lat + ' deg', false, north.meters + ' m');
    }
    if (Math.abs(diagonal.meters - STEP_METERS) > tolerance) {
      diagonalOk = false;
      check('diagonal step stays true at ' + lat + ' deg', false, diagonal.meters + ' m');
    }
    if (lat === 60 && Math.abs(east.naiveMeters - STEP_METERS) > STEP_METERS * 0.1) {
      naiveIsWrongAt60 = true;
    }
  }
  check('east-west steps stay true-scale at every latitude', eastOk);
  check('north-south steps stay true-scale at every latitude', northOk);
  check('diagonal steps stay true-scale at every latitude', diagonalOk);

  // 4. Regression guard: the unscaled east step really is wrong at 60 deg, so
  //    removing the conversion cannot silently pass this suite again.
  check('unscaled east step would be wrong at 60 deg', naiveIsWrongAt60);

  // 5. Anisotropy is gone: east and north cover the same ground distance.
  let isotropic = true;
  for (const lat of [0, 51.5074, 75]) {
    const east = scaledStep(lat, 1, 0).meters;
    const north = scaledStep(lat, 0, 1).meters;
    if (Math.abs(east - north) > STEP_METERS * 0.01) isotropic = false;
  }
  check('east and north steps agree in true metres', isotropic);

  if (failures > 0) {
    throw new Error(failures + ' test(s) failed');
  }
  console.log('All sim/render scale tests passed.');
}

main();
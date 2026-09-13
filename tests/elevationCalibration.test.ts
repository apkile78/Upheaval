/**
 * Elevation scale calibration: mountains must reach stone/snow bands.
 *
 * Plain TypeScript, no test-runner dependency. Run via:
 *   npx tsc tests/elevationCalibration.test.ts --outDir /tmp/calcheck \
 *     --module commonjs --target ES2022 --rootDir . --strict && \
 *   node /tmp/calcheck/tests/elevationCalibration.test.js
 */

import { BiomeManager } from '../src/sim/world/biomeManager';
import {
  MAX_MOUNTAIN_ELEVATION,
  ELEVATION_SCALE,
  RIDGE_COAST_STEEPNESS,
  BASE_TERRAIN_WEIGHT,
  RIDGE_TERRAIN_WEIGHT,
  DETAIL_TERRAIN_WEIGHT,
  RIDGE_ELEVATION_EXPONENT,
  RIDGE_INLAND_START_X,
} from '../src/sim/world/noise';

let failures = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log('PASS: ' + name);
  } else {
    failures++;
    console.error('FAIL: ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

const bm = new BiomeManager(42);

// 1. Tuning constants exist with calibrated values.
check('MAX_MOUNTAIN_ELEVATION exported (=2200 ceiling)', MAX_MOUNTAIN_ELEVATION === 2200);
check('ELEVATION_SCALE calibrated (=2000)', ELEVATION_SCALE === 2000);
check('ridge coast falloff steeper than base (RIDGE_COAST_STEEPNESS=2)', RIDGE_COAST_STEEPNESS === 2.0);
check('combine weights favour ridge crests over base (rw>bw)',
  RIDGE_TERRAIN_WEIGHT > BASE_TERRAIN_WEIGHT && DETAIL_TERRAIN_WEIGHT < BASE_TERRAIN_WEIGHT,
  'bw=' + BASE_TERRAIN_WEIGHT + ' rw=' + RIDGE_TERRAIN_WEIGHT + ' dw=' + DETAIL_TERRAIN_WEIGHT);
check('ridge power curve steep (exponent>=8)', RIDGE_ELEVATION_EXPONENT >= 8);
check('inland gate starts past foothills (x>=500)', RIDGE_INLAND_START_X >= 500);

// 2. Deep-inland grid: stone/snow reachable, clamp engages, cap respected.
const samples: number[] = [];
for (let x = 600; x <= 4000; x += 60) {
  for (let z = -3000; z <= 3000; z += 60) {
    samples.push(bm.getElevation(x, z));
  }
}
samples.sort((a, b) => a - b);
const q = (p: number): number => samples[Math.floor(p * (samples.length - 1))];
const stone = samples.filter((e) => e >= 1200).length;
const clamped = samples.filter((e) => e >= MAX_MOUNTAIN_ELEVATION).length;
check('stone/snow bands reachable inland (>1200 somewhere)', q(1) > 1200, 'max=' + q(1).toFixed(0));
check('MAX_MOUNTAIN_ELEVATION clamp engages at genuine peaks', clamped > 0, 'clamped=' + clamped);
check('cap never exceeded', q(1) <= MAX_MOUNTAIN_ELEVATION, 'max=' + q(1).toFixed(0));

// 3. Coastal falloff preserved: no mountains near coast, foothills below snow.
let coastViol = 0;
for (let z = -4000; z <= 4000; z += 25) {
  for (let x = -100; x <= 150; x += 10) {
    if (bm.getElevation(x, z) > 800) coastViol++;
  }
}
check('no mountains near coast (<=150 stays <800)', coastViol === 0, 'violations=' + coastViol);

let footPeak = -Infinity;
for (let z = -2000; z <= 2000; z += 20) {
  for (let x = 220; x <= 450; x += 10) {
    const e = bm.getElevation(x, z);
    if (e > footPeak) footPeak = e;
  }
}
check('foothill band peaks below snow', footPeak < 1200, 'footPeak=' + footPeak.toFixed(0));

// 4. Typical terrain still low: inland median stays in grass/forest bands.
check('typical inland terrain stays low (median < 400)', q(0.5) < 400, 'p50=' + q(0.5).toFixed(0));

// 5. Ocean stays ocean.
let w = 0, n = 0;
for (let z = -4000; z <= 4000; z += 80) {
  for (let x = -600; x <= -60; x += 10) {
    if (bm.getElevation(x, z) < 0) w++;
    n++;
  }
}
check('open ocean stays submerged (>90% water)', w / n > 0.9, (100 * w / n).toFixed(1) + '%');

// 6. Determinism of the recalibrated pipeline.
const twin = new BiomeManager(42);
let det = true;
for (let x = -500; x <= 3000; x += 433) {
  for (let z = -3000; z <= 3000; z += 457) {
    if (bm.getElevation(x, z) !== twin.getElevation(x, z)) det = false;
  }
}
check('deterministic for identical seeds', det);

if (failures > 0) {
  throw new Error(failures + ' test(s) failed');
}
console.log('All elevation calibration tests passed.');

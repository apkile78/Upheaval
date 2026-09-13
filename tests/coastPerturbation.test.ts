/**
 * Step 6.1 - Coastline Perturbation Noise tests.
 *
 * Plain TypeScript, no test-runner dependency. Run via:
 *   npx tsc tests/coastPerturbation.test.ts --outDir /tmp/coast_test \
 *     --module commonjs --target ES2022 --rootDir . --strict && \
 *   node /tmp/coast_test/tests/coastPerturbation.test.js
 */

import { CoastPerturbationNoise } from '../src/sim/world/noise';

let failures = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log('PASS: ' + name);
  } else {
    failures++;
    console.error('FAIL: ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

const base = new CoastPerturbationNoise(42);

// 1. Determinism: identical seeds must produce identical output everywhere.
const twin = new CoastPerturbationNoise(42);
let deterministic = true;
for (let x = -8000; x <= 8000; x += 977) {
  for (let z = -8000; z <= 8000; z += 1313) {
    if (base.getOffset(x, z) !== twin.getOffset(x, z)) deterministic = false;
  }
}
check('deterministic for identical seeds', deterministic);

// 2. Seed independence: a different seed must yield a different field.
const other = new CoastPerturbationNoise(43);
let differs = false;
for (let x = -8000; x <= 8000; x += 977) {
  if (base.getOffset(x, 0) !== other.getOffset(x, 0)) { differs = true; break; }
}
check('independent across seeds', differs);

// 3. Bounded output: approximately [-1, 1] (generous envelope check).
let bounded = true;
let min = Infinity;
let max = -Infinity;
for (let x = -20000; x <= 20000; x += 511) {
  for (let z = -20000; z <= 20000; z += 511) {
    const v = base.getOffset(x, z);
    if (!(v > -1.5 && v < 1.5)) bounded = false;
    if (v < min) min = v;
    if (v > max) max = v;
  }
}
check('output bounded', bounded, 'min=' + min.toFixed(3) + ' max=' + max.toFixed(3));

// 4. Smoothness: gentle meanders - tiny spatial steps must yield tiny deltas.
let maxStepDelta = 0;
let sumStepDelta = 0;
let stepCount = 0;
for (let z = -12000; z <= 12000; z += 10) {
  const d = Math.abs(base.getOffset(0, z + 10) - base.getOffset(0, z));
  if (d > maxStepDelta) maxStepDelta = d;
  sumStepDelta += d;
  stepCount++;
}
check(
  'smooth over 10-unit steps (no jaggedness)',
  maxStepDelta < 0.05,
  'maxDelta=' + maxStepDelta.toFixed(4),
);
// Per world unit: measured ~0.0013 for a ~1250-unit-wavelength meander.
check(
  'low average gradient per world unit',
  sumStepDelta / stepCount / 10 < 0.002,
  'avgPerUnit=' + (sumStepDelta / stepCount / 10).toFixed(5),
);

// 5. Meaningful variation: over a ~4000-unit span the offset must actually
// meander (range well above zero) so bays/peninsulas emerge.
let spanMin = Infinity;
let spanMax = -Infinity;
for (let z = 0; z <= 4000; z += 20) {
  const v = base.getOffset(0, z);
  if (v < spanMin) spanMin = v;
  if (v > spanMax) spanMax = v;
}
check(
  'meanders over large spans',
  spanMax - spanMin > 0.4,
  'range=' + (spanMax - spanMin).toFixed(3),
);

// 6. 2D behaviour: varies along BOTH axes (not a pure function of Z alone).
let xVariation = false;
const ref = base.getOffset(0, 1234);
for (let x = 100; x <= 8000; x += 137) {
  if (Math.abs(base.getOffset(x, 1234) - ref) > 0.05) { xVariation = true; break; }
}
check('varies along both world axes', xVariation);

if (failures > 0) {
  throw new Error(failures + ' test(s) failed');
}
console.log('All coastline perturbation tests passed.');

/**
 * Step 6.2 - Meandering coastline integration tests.
 *
 * Plain TypeScript, no test-runner dependency. Run via:
 *   npx tsc tests/biomeManager.test.ts --outDir /tmp/biome_test \
 *     --module commonjs --target ES2022 --rootDir . --strict && \
 *   node /tmp/biome_test/tests/biomeManager.test.js
 */

import { BiomeManager } from '../src/sim/world/biomeManager';

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

// 1. Determinism: same seed -> identical elevations.
const twin = new BiomeManager(42);
let deterministic = true;
for (let x = -2000; x <= 3000; x += 733) {
  for (let z = -4000; z <= 4000; z += 901) {
    if (bm.getElevation(x, z) !== twin.getElevation(x, z)) deterministic = false;
  }
}
check('deterministic for identical seeds', deterministic);

// 2. Meandering coast: coast factor along Z must vary where the meander
// displaces the boundary (mid-gradient zone), unlike the old straight coast.
const CF_STEP = 20;
let maxCfDelta = 0;
for (let z = -8000; z <= 8000; z += CF_STEP) {
  const cf = bm.getCoastFactor(150, z);
  const cfNext = bm.getCoastFactor(150, z + CF_STEP);
  const d = Math.abs(cfNext - cf);
  if (d > maxCfDelta) maxCfDelta = d;
}
const maxCfDeltaPerUnit = maxCfDelta / CF_STEP;
// Straight coast would be constant along Z; require real variation.
let cfMin = Infinity;
let cfMax = -Infinity;
for (let z = -8000; z <= 8000; z += 40) {
  const cf = bm.getCoastFactor(150, z);
  if (cf < cfMin) cfMin = cf;
  if (cf > cfMax) cfMax = cf;
}
check(
  'coastline meanders along Z (not a straight vertical coast)',
  cfMax - cfMin > 0.2,
  'range=' + (cfMax - cfMin).toFixed(3) + ' maxStep=' + maxCfDelta.toFixed(4),
);
// Per world unit of Z: <=0.001 means the boundary shifts at most ~1 X-unit
// per ~4 Z-units at full meander amplitude - gentle bays, no jagged edges.
check(
  'coast factor still smooth along Z (gentle bays, no jagged edges)',
  maxCfDeltaPerUnit < 0.001,
  'maxPerUnit=' + maxCfDeltaPerUnit.toFixed(5),
);

// 3. Bounds preserved: coast factor stays within [0.05, 1].
let bounded = true;
for (let x = -500; x <= 1500; x += 53) {
  for (let z = -5000; z <= 5000; z += 61) {
    const cf = bm.getCoastFactor(x, z);
    if (!(cf >= 0.05 && cf <= 1)) bounded = false;
  }
}
check('coast factor bounded in [0.05, 1]', bounded);

// 4. Gradient preserved: mean elevation far inland (X=700) must exceed the
// mean near the coast (X=100) across a Z sweep.
let sumInland = 0;
let sumCoast = 0;
let n = 0;
for (let z = -8000; z <= 8000; z += 200) {
  sumInland += bm.getElevation(700, z);
  sumCoast += bm.getElevation(100, z);
  n++;
}
check(
  'west-to-east elevation gradient preserved',
  sumInland / n > sumCoast / n * 2,
  'inland=' + (sumInland / n).toFixed(1) + ' coast=' + (sumCoast / n).toFixed(1),
);

// 5. Elevation responds to the meander: at a fixed X in the coastal band,
// elevation must vary along Z by a non-trivial amount.
let eMin = Infinity;
let eMax = -Infinity;
for (let z = -8000; z <= 8000; z += 40) {
  const e = bm.getElevation(120, z);
  if (e < eMin) eMin = e;
  if (e > eMax) eMax = e;
}
check(
  'elevation varies along Z in the coastal band (bays/peninsulas)',
  eMax - eMin > 5,
  'range=' + (eMax - eMin).toFixed(1),
);

if (failures > 0) {
  throw new Error(failures + ' test(s) failed');
}
console.log('All biome manager coastline tests passed.');

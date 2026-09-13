/**
 * Phase 1 continent model verification.
 *
 * Runs as a plain TypeScript script, mirroring the existing test style.
 */

import { createContinentModel } from '../src/sim/world/continentModel';

let failures = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log('PASS: ' + name);
  } else {
    failures++;
    console.error('FAIL: ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

const seedA = createContinentModel(42);
const seedB = createContinentModel(42);
const seedC = createContinentModel(43);

check(
  'same seed yields identical continent profile',
  JSON.stringify(seedA.profile) === JSON.stringify(seedB.profile),
);

check(
  'different seeds produce different continent geometry',
  JSON.stringify(seedA.profile) !== JSON.stringify(seedC.profile),
);

let interiorLand = true;
for (const continent of seedA.profile.continents) {
  const x = continent.centerX + continent.radiusX * 0.15;
  const z = continent.centerZ + continent.radiusZ * 0.15;
  if (seedA.landmask(x, z) < 0.8) {
    interiorLand = false;
  }
}
check('seeded continent interiors stay deep-land in the landmask', interiorLand);

let oceanEdge = true;
for (const [x, z] of [
  [-5000, -5000],
  [5000, 5000],
  [5000, -5000],
  [-5000, 5000],
]) {
  if (seedA.landmask(x, z) > 0.05) {
    oceanEdge = false;
  }
}
check('far-sea samples stay oceanic', oceanEdge);

const coastal = seedA.coastalBand(0, 0);
check('coastal band exists and is bounded', coastal >= 0 && coastal <= 1, 'coastal=' + coastal.toFixed(3));

if (failures > 0) {
  throw new Error(failures + ' test(s) failed');
}

console.log('All continent model tests passed.');

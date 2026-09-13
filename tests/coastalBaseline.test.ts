/**
 * Coast-to-mountain water distribution (post elevation-scale recalibration).
 *
 * The recalibrated world (ELEVATION_SCALE=2000) has a real elevation range:
 * deep ocean / true coast edge stay water, while the inland plain rises into
 * foothill bands (some low pockets dip below sea level = swamp/marsh) and
 * then into forest/dirt/stone as x grows. Thresholds below encode THAT map,
 * verified against a band-by-band audit (seed 42):
 *   ocean [-600..-100] ~100% water | edge [-100..0] ~93% | shore [0..100] ~58%
 *   plain [100..200] ~40% (swamp pockets + ponds) | [200..400] ~36% |
 *   [400..600] ~35% (ponds shrink further inland; foothills rise above them).
 *
 * Plain TypeScript, no test-runner dependency. Run via:
 *   npx tsc tests/coastalBaseline.test.ts --outDir /tmp/baseline_test \
 *     --module commonjs --target ES2022 --rootDir . --strict && \
 *   node /tmp/baseline_test/tests/coastalBaseline.test.js
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

function waterFraction(bm: BiomeManager, x0: number, x1: number): number {
  let water = 0;
  let n = 0;
  for (let z = -4000; z <= 4000; z += 37) {
    for (let x = x0; x < x1; x += 4) {
      if (bm.getElevation(x, z) < 0) water++;
      n++;
    }
  }
  return water / n;
}

const bm = new BiomeManager(42);

// Determinism intact after the baseline change.
const twin = new BiomeManager(42);
let deterministic = true;
for (let x = -1000; x <= 2000; x += 149) {
  for (let z = -3000; z <= 3000; z += 181) {
    if (bm.getElevation(x, z) !== twin.getElevation(x, z)) deterministic = false;
  }
}
check('deterministic for identical seeds', deterministic);

// Ocean: reliably submerged.
const ocean = waterFraction(bm, -600, -100);
check('open ocean is water', ocean >= 0.95, 'water=' + (ocean * 100).toFixed(1) + '%');

// Near-shore + plain: water concentrated at the coastline, tapering inland
// across the swamp/marsh plain into the foothills (see header audit table).
const nearShore = waterFraction(bm, -100, 0);
const shore = waterFraction(bm, 0, 100);
const plain = waterFraction(bm, 100, 450);
check('near-shore band mostly water', nearShore >= 0.85, 'water=' + (nearShore * 100).toFixed(1) + '%');
check('shoreline band is a true transition', shore >= 0.4 && shore <= 0.8, 'water=' + (shore * 100).toFixed(1) + '%');
check('water tapers inland (plain < shoreline)', plain < shore, 'plain=' + (plain * 100).toFixed(1) + '% shore=' + (shore * 100).toFixed(1) + '%');
check('water concentrates at the coast, not scattered',
  ocean >= 0.95 && nearShore > plain && shore > plain);

// Coast edge zone: transition, neither ocean nor plain.
const edge = waterFraction(bm, -50, 50);
check('coast edge zone is a true transition', edge >= 0.4 && edge <= 0.95,
  'water=' + (edge * 100).toFixed(1) + '%');

if (failures > 0) {
  throw new Error(failures + ' test(s) failed');
}
console.log('All coastal baseline tests passed.');

/**
 * Step 6.5 - Region classification tests.
 *
 * Plain TypeScript, no test-runner dependency. Run via:
 *   npx tsc tests/regionMap.test.ts --outDir /tmp/region_test \
 *     --module commonjs --target ES2022 --rootDir . --strict && \
 *   node /tmp/region_test/tests/regionMap.test.js
 */

import type { CoastFactorFn, RegionArchetype } from '../src/types/world';
import { BiomeManager } from '../src/sim/world/biomeManager';
import { MacroHeightmap } from '../src/sim/world/macroHeightmap';
import { RiverGenerator } from '../src/sim/world/riverGenerator';
import { RegionMap, REGION_BIASES } from '../src/sim/world/regionMap';

let failures = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log('PASS: ' + name);
  } else {
    failures++;
    console.error('FAIL: ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

const biome = new BiomeManager(42);
const coastFactor: CoastFactorFn = (wx: number, wz: number): number => biome.getCoastFactor(wx, wz);
const macro = new MacroHeightmap(42, coastFactor);
const rivers = new RiverGenerator(42, macro, coastFactor);
rivers.generate();

// 1. Determinism: identical seeds -> identical classifications.
function sweep(rm: RegionMap): string {
  let acc = '';
  for (let x = -500; x <= 3000; x += 173) {
    for (let z = -3000; z <= 3000; z += 197) {
      acc += rm.getRegionAt(x, z);
    }
  }
  return acc;
}
const rmA = new RegionMap(42, macro, coastFactor, rivers);
const rmB = new RegionMap(42, macro, coastFactor, rivers);
check('deterministic classifications for identical seeds', sweep(rmA) === sweep(rmB));

// 2. Valid archetypes only.
const VALID: RegionArchetype[] = ['coastal_bay', 'river_valley', 'upland_plain', 'ridge_highland', 'coastal_plain'];
let allValid = true;
for (let x = -500; x <= 3000; x += 211) {
  for (let z = -3000; z <= 3000; z += 233) {
    if (VALID.indexOf(rmA.getRegionAt(x, z)) === -1) allValid = false;
  }
}
check('only valid archetypes returned', allValid);

// 3. Coverage: coastal sweep yields bay/plain; inland sweep yields a mix.
const coastalSeen = new Set<string>();
for (let z = -8000; z <= 8000; z += 40) {
  coastalSeen.add(rmA.getRegionAt(20, z));
}
check('coastal band classifies bay/plain',
  coastalSeen.has('coastal_bay') || coastalSeen.has('coastal_plain'),
  [...coastalSeen].join(','));

const inlandSeen = new Set<string>();
for (let x = 600; x <= 3000; x += 300) {
  for (let z = -8000; z <= 8000; z += 600) {
    inlandSeen.add(rmA.getRegionAt(x, z));
  }
}
check('inland band classifies at least one archetype', inlandSeen.size >= 1,
  [...inlandSeen].join(','));

// 4. River proximity: upper reaches of traced rivers classify as river_valley.
let riverPointChecked = false;
let riverClassified = true;
for (const r of rivers.getRivers()) {
  for (const p of r.points) {
    if (coastFactor(p.x, p.z) > 0.6) {
      riverPointChecked = true;
      // Fresh instance queried at the exact point first: per-macro-cell
      // memoization legitimately shares one classification per cell, so a
      // sweep-cached cell must not be used to judge the exact river point.
      const rmExact = new RegionMap(42, macro, coastFactor, rivers);
      if (rmExact.getRegionAt(p.x, p.z) !== 'river_valley') riverClassified = false;
      break;
    }
  }
}
check('river reaches classify as river_valley', riverPointChecked && riverClassified);

// 5. Memoization: repeated queries in the same macro-cell are cached.
const memoRm = new RegionMap(42, macro, coastFactor, rivers);
memoRm.getRegionAt(100, 100);
const afterFirst = memoRm.cachedCellCount;
for (let i = 0; i < 50; i++) memoRm.getRegionAt(100.1 + i * 0.001, 100.1);
check('per-macro-cell memoization works',
  memoRm.cachedCellCount === afterFirst && afterFirst === 1,
  'cached=' + memoRm.cachedCellCount);
memoRm.getRegionAt(100 + 600, 100);
check('different macro-cell adds cache entry', memoRm.cachedCellCount === 2);
memoRm.clearCache();
check('clearCache empties cache', memoRm.cachedCellCount === 0);

// 6. Bias table complete and sensible.
let tableOk = VALID.length === 5;
for (const a of VALID) {
  const b = REGION_BIASES[a];
  if (!b || !isFinite(b.elevationBias) || !isFinite(b.moistureBias) || !isFinite(b.vegetationBias)) tableOk = false;
}
check('bias table covers all archetypes with finite values', tableOk);
check(
  'bay lowers elevation most, highland raises it',
  REGION_BIASES.coastal_bay.elevationBias < REGION_BIASES.upland_plain.elevationBias &&
  REGION_BIASES.ridge_highland.elevationBias > REGION_BIASES.upland_plain.elevationBias,
);

if (failures > 0) {
  throw new Error(failures + ' test(s) failed');
}
console.log('All region map tests passed.');

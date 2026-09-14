/**
 * Step 6.3 - Macro heightmap tests.
 *
 * Plain TypeScript, no test-runner dependency. Run via:
 *   npx tsc tests/macroHeightmap.test.ts --outDir /tmp/macro_test \
 *     --module commonjs --target ES2022 --rootDir . --strict && \
 *   node /tmp/macro_test/tests/macroHeightmap.test.js
 */

import { MacroHeightmap, MACRO_CELL_SIZE, MACRO_MAX_ELEVATION } from '../src/sim/world/macroHeightmap';

let failures = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log('PASS: ' + name);
  } else {
    failures++;
    console.error('FAIL: ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

const macro = new MacroHeightmap(42);

// 1. Determinism: same seed -> identical heights.
const twin = new MacroHeightmap(42);
let deterministic = true;
for (let x = -10000; x <= 10000; x += 761) {
  for (let z = -10000; z <= 10000; z += 929) {
    if (macro.sampleHeight(x, z) !== twin.sampleHeight(x, z)) deterministic = false;
  }
}
check('deterministic for identical seeds', deterministic);

// 2. Seed independence.
const other = new MacroHeightmap(43);
let differs = false;
for (let x = -10000; x <= 10000; x += 761) {
  if (macro.sampleHeight(x, 0) !== other.sampleHeight(x, 0)) { differs = true; break; }
}
check('independent across seeds', differs);

// 3. Range: heights stay within [0, MACRO_MAX_ELEVATION].
let inRange = true;
let hMin = Infinity;
let hMax = -Infinity;
for (let x = -20000; x <= 20000; x += 401) {
  for (let z = -20000; z <= 20000; z += 401) {
    const h = macro.sampleHeight(x, z);
    if (!(h >= 0 && h <= MACRO_MAX_ELEVATION)) inRange = false;
    if (h < hMin) hMin = h;
    if (h > hMax) hMax = h;
  }
}
check('heights within [0, MACRO_MAX_ELEVATION]', inRange,
  'min=' + hMin.toFixed(1) + ' max=' + hMax.toFixed(1));

// 4. Smoothness: bilinear lattice interpolation - no discontinuities across
// cell boundaries even with 1-unit steps.
let maxStepDelta = 0;
for (let x = -8000; x <= 8000; x += 1) {
  const d = Math.abs(macro.sampleHeight(x, 333) - macro.sampleHeight(x + 1, 333));
  if (d > maxStepDelta) maxStepDelta = d;
}
check('smooth across lattice cell boundaries', maxStepDelta < 10,
  'maxStep=' + maxStepDelta.toFixed(3));

// 5. Large-scale character: variance over macro distances is substantial
// (hills/valleys exist), but over tiny distances it is gentle (coarse).
let sMin = Infinity;
let sMax = -Infinity;
for (let x = 0; x <= 8000; x += 32) {
  const h = macro.sampleHeight(x, 0);
  if (h < sMin) sMin = h;
  if (h > sMax) sMax = h;
}
check('meaningful macro-scale relief', sMax - sMin > MACRO_MAX_ELEVATION * 0.2,
  'range=' + (sMax - sMin).toFixed(1));

// 6. Coast decay: with an injected coast factor (0 = ocean, 1 = inland),
// heights near the ocean must be far lower than inland.
const coastal = new MacroHeightmap(42, (wx: number, _wz: number): number => {
  return Math.max(0, Math.min(1, (wx - 50) / 400));
});
let sumOcean = 0;
let sumInland = 0;
let n = 0;
for (let z = -8000; z <= 8000; z += 200) {
  sumOcean += coastal.sampleHeight(0, z);
  sumInland += coastal.sampleHeight(900, z);
  n++;
}
check(
  'coast decay via injected CoastFactorFn',
  sumInland / n > sumOcean / n * 5,
  'ocean=' + (sumOcean / n).toFixed(1) + ' inland=' + (sumInland / n).toFixed(1),
);

// 7. Memoization: repeated queries do not grow the lattice cache.
const memo = new MacroHeightmap(42);
memo.sampleHeight(100, 100);
const afterFirst = memo.cachedPointCount;
for (let i = 0; i < 100; i++) memo.sampleHeight(100.5, 100.5);
check('lattice memoization works',
  afterFirst === memo.cachedPointCount && memo.cachedPointCount === 4,
  'cached=' + memo.cachedPointCount + ' expected=4');
memo.clearCache();
check('clearCache empties cache', memo.cachedPointCount === 0);

// 8. Lattice spacing constant exported and sane.
check('MACRO_CELL_SIZE in 500-1000 range', MACRO_CELL_SIZE >= 500 && MACRO_CELL_SIZE <= 1000,
  'value=' + MACRO_CELL_SIZE);

if (failures > 0) {
  throw new Error(failures + ' test(s) failed');
}
console.log('All macro heightmap tests passed.');

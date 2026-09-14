/**
 * Ridge noise massif profile tests (anti-mohawk).
 *
 * Plain TypeScript, no test-runner dependency. Run via:
 *   npx tsc tests/ridgeProfile.test.ts --outDir /tmp/ridge_test \
 *     --module commonjs --target ES2022 --rootDir . --strict && \
 *   node /tmp/ridge_test/tests/ridgeProfile.test.js
 */

import { SimplexNoise, ridged, RIDGE_MASSIF_EXPONENT, RIDGE_CRAG_EXPONENT, RIDGE_MASSIF_WEIGHT } from '../src/sim/world/noise';
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

const noise = new SimplexNoise(42);
// Same effective base frequency as BiomeManager (0.005 * 0.25).
const FREQ = 0.00125;

// 1. Determinism + range.
const a = ridged(noise, 0.5, 0.5, 4, 2.0, 0.5);
const b = ridged(new SimplexNoise(42), 0.5, 0.5, 4, 2.0, 0.5);
check('deterministic for identical seeds', a === b);
let inRange = true;
for (let x = -5000; x <= 5000; x += 17) {
  for (let y = -5000; y <= 5000; y += 19) {
    const v = ridged(noise, x * FREQ, y * FREQ, 4, 2.0, 0.5);
    if (!(v >= 0 && v <= 1)) inRange = false;
  }
}
check('output within [0, 1]', inRange);

// 2. Cross-section through a crest: broad massif, not a thin spike.
// Sample a long line, find the strongest peak, measure widths.
const STEP = 8;
const N = 1000; // 8000 units of cross-section
const vals: number[] = [];
for (let i = 0; i < N; i++) vals.push(ridged(noise, 600 * FREQ, (-4000 + i * STEP) * FREQ, 4, 2.0, 0.5));
let peak = 0;
let peakIdx = 0;
for (let i = 0; i < N; i++) if (vals[i] > peak) { peak = vals[i]; peakIdx = i; }

// Width of the region at >= 50% of peak, contiguous around the peak.
let lo = peakIdx;
let hi = peakIdx;
while (lo > 0 && vals[lo - 1] >= peak * 0.5) lo--;
while (hi < N - 1 && vals[hi + 1] >= peak * 0.5) hi++;
const halfWidthUnits = (hi - lo) * STEP;
check('crest has a broad half-height width (no razor ridge)', halfWidthUnits >= 150,
  'halfWidth=' + halfWidthUnits + 'u peak=' + peak.toFixed(3));

// Foothill shoulders: at +/-150u beyond the half-height edges the ridge is
// still elevated (a razor spike would collapse to ~0; measured ~24% here).
const shoulderL = lo >= 150 / STEP ? vals[lo - Math.floor(150 / STEP)] : vals[0];
const shoulderR = hi <= N - 1 - 150 / STEP ? vals[hi + Math.floor(150 / STEP)] : vals[N - 1];
check('foothill shoulders present (>=20% of peak at +/-150u)',
  shoulderL >= peak * 0.2 && shoulderR >= peak * 0.2,
  'L=' + shoulderL.toFixed(3) + ' R=' + shoulderR.toFixed(3) + ' peak=' + peak.toFixed(3));

// 3. Smoothed envelope: box-average the biome elevation cross-section
// (x=600, mountain zone) over 512-unit windows to remove crag roughness,
// then NORMALIZE each step by the local-relief scale of the recalibrated
// world (typical inland relief ~1200wku): a narrow-spike profile produces
// single-window jumps near the full relief, a massif profile keeps every
// window step to a fraction of it.
const bm = new BiomeManager(42);
const raw: number[] = [];
for (let z = -4000; z <= 4000; z += 8) raw.push(bm.getElevation(600, z));
const win = 64; // 512 units
const env: number[] = [];
for (let i = 0; i + win <= raw.length; i += win) {
  let s = 0;
  for (let j = i; j < i + win; j++) s += raw[j];
  env.push(s / win);
}
let maxEnvStep = 0;
for (let i = 1; i < env.length; i++) maxEnvStep = Math.max(maxEnvStep, Math.abs(env[i] - env[i - 1]));
const RELIEF = 1200;
check('envelope rises gradually vs relief scale (no narrow-spike profile)', maxEnvStep <= RELIEF * 0.35,
  'maxEnvelopeStep(512u)=' + maxEnvStep.toFixed(1) + ' (relief scale=' + RELIEF + ')');

// 4. Foothill occupancy in the biome cross-section: a massif keeps a large
// share of samples between 30% and 80% of the local max (spikes do not).
const max = Math.max(...raw);
let mid = 0;
for (const v of raw) if (v > max * 0.3 && v < max * 0.8) mid++;
check('foothill band occupies the cross-section', mid / raw.length >= 0.3,
  'band=' + ((100 * mid) / raw.length).toFixed(1) + '%');

// 5. Rounded summits: the ridge field must not collapse to a point at the
// top. Two measures across the whole transect:
// (a) summit slope: the value drop from the peak to its nearest neighbours
//     is a small fraction of the peak (a spire drops steeply on both sides).
// (b) near-peak plateau: samples within the crest at >= 90% of peak form a
//     measurable share (crag sub-peaks cap this; calibrated floor 8%).
const nL = vals[Math.max(0, peakIdx - 1)];
const nR = vals[Math.min(N - 1, peakIdx + 1)];
const summitDrop = Math.max(peak - nL, peak - nR) / peak;
check('summit slope is rounded (no spire tip)', summitDrop <= 0.15,
  'drop=' + (100 * summitDrop).toFixed(1) + '% per 8u');
let crestSamples = 0;
let topSamples = 0;
for (let i = lo; i <= hi; i++) {
  crestSamples++;
  if (vals[i] >= peak * 0.9) topSamples++;
}
const topOccupancy = topSamples / Math.max(1, crestSamples);
check('near-peak plateau present within the crest', topOccupancy >= 0.08,
  'topOccupancy=' + (100 * topOccupancy).toFixed(1) + '%');

// 6. Tuning constants exposed as named exports with rounded-peak values.
check(
  'ridge shaping constants exported and tuned for rounded peaks',
  RIDGE_MASSIF_EXPONENT === 2.0 && RIDGE_CRAG_EXPONENT < 2 && RIDGE_CRAG_EXPONENT >= 1.3 && RIDGE_MASSIF_WEIGHT >= 1,
  'massif=' + RIDGE_MASSIF_EXPONENT + ' crag=' + RIDGE_CRAG_EXPONENT + ' weight=' + RIDGE_MASSIF_WEIGHT,
);

if (failures > 0) {
  throw new Error(failures + ' test(s) failed');
}
console.log('All ridge profile tests passed.');

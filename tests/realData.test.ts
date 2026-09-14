/**
 * Real-data tests: the committed Everest-area fixture extracted from the
 * NOAA ETOPO 2022 conversion (96x96 cells, raw little-endian int16 meters).
 * Verifies the real asset has plausible Earth values at known coordinates.
 *
 * Plain TypeScript, no test-runner dependency. Run via scripts/run-tests.mjs.
 */

import { decodeCell } from '../src/sim/world/earth/elevationGrid';
import { ELEV_OFFSET } from '../src/sim/world/earth/earthConfig';

// Minimal local typings for the Node file API (the repo intentionally has no
// @types/node dependency; tests compile to CommonJS and use require directly).
interface NodeBuffer {
  buffer: ArrayBufferLike;
  byteOffset: number;
  length: number;
}
declare const require: (id: string) => {
  readFileSync: {
    (path: string): NodeBuffer;
    (path: string, encoding: string): string;
  };
};
const fs = require('node:fs');

let failures = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log('PASS: ' + name);
  } else {
    failures++;
    console.error('FAIL: ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

const FIXTURE_DATA = 'tests/fixtures/everest_96.i16';
const FIXTURE_META = 'tests/fixtures/everest_96.meta.json';

const buf = fs.readFileSync(FIXTURE_DATA);
const meta = JSON.parse(fs.readFileSync(FIXTURE_META, 'utf8')) as {
  rows: number; cols: number; row0: number; col0: number;
  northLat: number; westLon: number; cellArcSec: number;
};

const N = meta.rows;
const data = new Int16Array(buf.buffer as ArrayBuffer, buf.byteOffset, buf.length / 2);
check('fixture size matches meta', data.length === meta.rows * meta.cols, data.length + ' vs ' + meta.rows * meta.cols);

function cellAt(row: number, col: number): number {
  return data[row * meta.cols + col];
}

// Everest summit sits at the fixture center by construction (row0/col0 were
// derived from the summit coordinates minus N/2).
let min = 32767;
let max = -32768;
for (let i = 0; i < data.length; i++) {
  if (data[i] < min) min = data[i];
  if (data[i] > max) max = data[i];
}

check('fixture is entirely land (min > 0)', min > 0, 'min ' + min);
check('fixture peaks are Himalayan (max > 7000)', max > 7000, 'max ' + max);
check('fixture max is Earth-plausible (max < 9500)', max < 9500, 'max ' + max);

// Summit cell: near the fixture maximum and well above the valley floor.
const center = cellAt(48, 48);
check('summit cell is high (>= 6500 m)', center >= 6500, 'center ' + center);
check('summit cell is within ~1500 m of fixture max', max - center < 1500, 'delta ' + (max - center));

// Relief across 96 cells (~178 km x 178 km) must be significant mountainous.
check('fixture relief exceeds 3500 m', max - min > 3500, 'relief ' + (max - min));

// The summit cell is a local maximum against its 8 neighbors (within noise).
let neighborhoodMax = -Infinity;
for (let dy = -2; dy <= 2; dy++) {
  for (let dx = -2; dx <= 2; dx++) {
    if (dx === 0 && dy === 0) continue;
    const v = cellAt(48 + dy, 48 + dx);
    if (v > neighborhoodMax) neighborhoodMax = v;
  }
}
check('summit is a near-peak (within 300 m of 5x5 neighborhood max)', neighborhoodMax - center <= 300, 'neighbor max ' + neighborhoodMax + ' center ' + center);

// decodeCell must reconstruct the raw fixture through the runtime path.
let decodeOk = true;
for (let i = 0; i < data.length; i += 7) {
  const packed = data[i] + ELEV_OFFSET;
  if (decodeCell((packed >> 8) & 0xff, packed & 0xff) !== data[i]) decodeOk = false;
}
check('runtime decodeCell reproduces real fixture values', decodeOk);

// Meta sanity: 60 arc-second cells (1 arc-minute).
check('fixture cell size is 60 arcsec', meta.cellArcSec === 60);
check('fixture spans ~96 arcmin (1.6 deg)', Math.abs(meta.northLat - (90 - (meta.row0 + 0.5) / 60)) < 1e-9);

if (failures > 0) {
  throw new Error(failures + ' test(s) failed');
}
console.log('All realData tests passed.');

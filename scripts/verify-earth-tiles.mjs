/**
 * Verify the shipped Earth elevation tile assets (public/assets/earth/).
 *
 * Reads meta.json + every tile PNG, reconstructs the elevation grid, and
 * checks real-world anchor points via bilinear sampling. This validates the
 * actual artifacts the browser loads (not intermediate conversion state).
 *
 * Usage: node scripts/verify-earth-tiles.mjs
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPngRgb } from './dem/pngio.mjs';

const OUT = 'public/assets/earth';
const meta = JSON.parse(readFileSync(join(OUT, 'meta.json'), 'utf8'));

/** Anchor points: [name, lat, lon, min, max] with 1-arc-min smoothing in mind. */
const ANCHORS = [
  ['Mount Everest summit', 27.9881, 86.925, 7000, 9000],
  ['K2 summit', 35.8825, 76.5133, 6800, 9000],
  ['Dead Sea surface', 31.5, 35.47, -450, -300],
  ['Challenger Deep', 11.3733, 142.5917, -11000, -9500],
  ['Sahara (Aïr massif)', 23.4, 12.5, 200, 900],
  ['London', 51.5074, -0.1278, 0, 200],
  ['Greenland ice summit', 72.5796, -38.4592, 2400, 3400],
  ['Central Pacific abyssal', -10, -150, -6000, -4000],
  ['Amazon lowland', -3.5, -62, 0, 200],
  ['Tibetan plateau', 32, 88, 4000, 5500],
  ['Mariana arc island', 15.2, 145.75, 0, 500],
  ['North Sea', 56, 3, -200, 0],
];

const cache = new Map();

function tileAt(row, col) {
  const key = row * meta.tilesX + col;
  let tile = cache.get(key);
  if (tile === undefined) {
    const png = readPngRgb(join(OUT, 'tiles', `r${row}_c${col}.png`));
    if (png.width !== meta.tilePx || png.height !== meta.tilePx) {
      throw new Error(`tile r${row}_c${col} has wrong size ${png.width}x${png.height}`);
    }
    const values = new Int16Array(meta.tilePx * meta.tilePx);
    for (let i = 0; i < values.length; i++) {
      values[i] = ((png.rgb[i * 3] << 8) | png.rgb[i * 3 + 1]) - meta.elevOffset;
    }
    cache.set(key, values);
    tile = values;
  }
  return tile;
}

function cell(gx, gy) {
  const cx = ((gx % meta.gridCols) + meta.gridCols) % meta.gridCols;
  const row = Math.floor(gy / meta.tilePx);
  const col = Math.floor(cx / meta.tilePx);
  return tileAt(row, col)[(gy % meta.tilePx) * meta.tilePx + (cx % meta.tilePx)];
}

function sample(lat, lon) {
  const fx = ((lon + 180) / 360) * meta.gridCols - 0.5;
  const fy = ((90 - lat) / 180) * meta.gridRows - 0.5;
  const gx0 = Math.floor(fx);
  const gy0 = Math.max(0, Math.min(meta.gridRows - 2, Math.floor(fy)));
  const tx = fx - gx0;
  const ty = fy - gy0;
  const v00 = cell(gx0, gy0);
  const v10 = cell(gx0 + 1, gy0);
  const v01 = cell(gx0, gy0 + 1);
  const v11 = cell(gx0 + 1, gy0 + 1);
  return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
}

let failures = 0;
for (const [name, lat, lon, min, max] of ANCHORS) {
  const h = sample(lat, lon);
  const pass = h >= min && h <= max;
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${h.toFixed(0)} m (expected ${min}..${max})`);
}

// Global extremes sanity from the metadata (written during conversion).
console.log(`meta: grid ${meta.gridCols}x${meta.gridRows} @ ${meta.cellArcSec}" -> range ${meta.minElev}..${meta.maxElev} m`);
if (meta.minElev > -10000 || meta.minElev < -12000) {
  console.error('FAIL global minimum elevation outside plausible Earth range');
  failures++;
}
if (meta.maxElev < 8000 || meta.maxElev > 9500) {
  console.error('FAIL global maximum elevation outside plausible Earth range');
  failures++;
}

if (failures > 0) {
  console.error(`\n${failures} verification failure(s)`);
  process.exit(1);
}
console.log('\nAll tile assets verified.');
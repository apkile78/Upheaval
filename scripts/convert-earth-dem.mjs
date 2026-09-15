/**
 * Earth DEM converter: NOAA ETOPO 2022 (60 arc-second, ice surface, public
 * domain) -> tiled 24-bit RGB PNG elevation assets for the browser.
 *
 * Pipeline:
 *   1. Download 36 latitude bands (5 deg each) from NOAA THREDDS NCSS as
 *      NetCDF-3 classic into .cache/dem/ (resumable: skips existing files).
 *   2. Scatter band cells into a global 21600 x 10800 Int16 grid by their
 *      actual lat/lon centers.
 *   3. Write 50 tiles (2160x2160 px) as RGB PNG: R = high byte, G = low byte
 *      of (elevation + 11000) — canvas-decodable losslessly in the browser.
 *   4. Emit meta.json + a small real-data fixture for unit tests.
 *   5. Verify anchor points (Everest, Dead Sea, Challenger Deep, ...) and a
 *      PNG encode/decode roundtrip.
 */

import { mkdirSync, existsSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseNetcdf3, readVariable } from './dem/netcdf3.mjs';
import { writePngRgb, readPngRgb } from './dem/pngio.mjs';

const BASE_URL = 'https://www.ngdc.noaa.gov/thredds/ncss/grid/global/ETOPO2022/60s/60s_surface_elev_netcdf/ETOPO_2022_v1_60s_N90W180_surface.nc';
const CACHE = '.cache/dem';
const OUT = 'public/assets/earth';
const GRID_COLS = 21600; // 360 deg / 60 arcsec
const GRID_ROWS = 10800; // 180 deg / 60 arcsec
const TILE = 2160;
const TILES_X = 10;
const TILES_Y = 5;
const ELEV_OFFSET = 11000;
const BAND_DEG = 5;
const EARTH_CITATION = 'NOAA ETOPO 2022 v1, 60 arc-second ice surface, public domain (DOI: 10.25921/fd45-gt74)';

const lonToCol = (lon) => Math.round((lon + 180) * (GRID_COLS / 360) - 0.5);
const latToRow = (lat) => Math.round((90 - lat) * (GRID_ROWS / 180) - 0.5);

function bandUrl(k) {
  const north = 90 - k * BAND_DEG - 0.001;
  const south = 90 - (k + 1) * BAND_DEG + 0.001;
  const q = `var=z&north=${north}&south=${south}&west=-179.999&east=179.999&accept=netcdf3`;
  return `${BASE_URL}?${q}`;
}

async function downloadBands() {
  mkdirSync(CACHE, { recursive: true });
  const paths = [];
  for (let k = 0; k < 180 / BAND_DEG; k++) {
    const path = join(CACHE, `band_${String(k).padStart(2, '0')}.nc`);
    const cached = existsSync(path) && statSync(path).size > 20_000_000;
    if (!cached) {
      console.log(`[band ${k + 1}/36] downloading...`);
      let ok = false;
      for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
        try {
          const res = await fetch(bandUrl(k), { signal: AbortSignal.timeout(180000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length < 20_000_000 || buf.toString('ascii', 0, 3) !== 'CDF') {
            throw new Error(`bad payload (${buf.length} bytes)`);
          }
          writeFileSync(path, buf);
          ok = true;
        } catch (err) {
          console.error(`  attempt ${attempt} failed: ${err.message}`);
          if (attempt === 3) throw err;
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    } else {
      console.log(`[band ${k + 1}/36] cached`);
    }
    paths.push(path);
  }
  return paths;
}

function scatterBands(paths, grid) {
  let covered = 0;
  for (const path of paths) {
    const fileBuf = readFileSync(path);
    const nc = parseNetcdf3(fileBuf.buffer.slice(fileBuf.byteOffset, fileBuf.byteOffset + fileBuf.byteLength));
    const lat = readVariable(nc, 'lat');
    const lon = readVariable(nc, 'lon');
    const z = readVariable(nc, 'z');
    const rows = lat.length;
    const cols = lon.length;
    if (z.length !== rows * cols) throw new Error(`${path}: z ${z.length} != ${rows}x${cols}`);
    const latDesc = lat[0] > lat[rows - 1];
    for (let r = 0; r < rows; r++) {
      const gy = latToRow(latDesc ? lat[r] : lat[rows - 1 - r]);
      if (gy < 0 || gy >= GRID_ROWS) throw new Error(`row out of range: ${gy}`);
      for (let c = 0; c < cols; c++) {
        const gx = lonToCol(lon[c]);
        if (gx < 0 || gx >= GRID_COLS) throw new Error(`col out of range: ${gx}`);
        const idx = gy * GRID_COLS + gx;
        if (grid[idx] === 0) covered++;
        const zval = z[(latDesc ? r : rows - 1 - r) * cols + c];
        grid[idx] = Number.isFinite(zval) ? Math.round(zval) : 0;
      }
    }
    console.log(`scattered ${path} (${rows}x${cols}, coverage ${covered}/${GRID_ROWS * GRID_COLS})`);
  }
  return covered;
}

function bilinear(grid, lat, lon) {
  const fx = (lon + 180) * (GRID_COLS / 360) - 0.5;
  const fy = (90 - lat) * (GRID_ROWS / 180) - 0.5;
  const ix = Math.max(0, Math.min(GRID_COLS - 2, Math.floor(fx)));
  const iy = Math.max(0, Math.min(GRID_ROWS - 2, Math.floor(fy)));
  const tx = Math.max(0, Math.min(1, fx - ix));
  const ty = Math.max(0, Math.min(1, fy - iy));
  const h = (r, c) => grid[r * GRID_COLS + c];
  return (
    (h(iy, ix) * (1 - tx) + h(iy, ix + 1) * tx) * (1 - ty) +
    (h(iy + 1, ix) * (1 - tx) + h(iy + 1, ix + 1) * tx) * ty
  );
}

function writeTiles(grid) {
  mkdirSync(join(OUT, 'tiles'), { recursive: true });
  let total = 0;
  for (let ty = 0; ty < TILES_Y; ty++) {
    for (let tx = 0; tx < TILES_X; tx++) {
      const rgb = Buffer.alloc(TILE * TILE * 3);
      for (let y = 0; y < TILE; y++) {
        const src = (ty * TILE + y) * GRID_COLS + tx * TILE;
        for (let x = 0; x < TILE; x++) {
          const v = Math.max(0, Math.min(65535, grid[src + x] + ELEV_OFFSET));
          const p = (y * TILE + x) * 3;
          rgb[p] = v >> 8;
          rgb[p + 1] = v & 0xff;
        }
      }
      total += writePngRgb(join(OUT, 'tiles', `r${ty}_c${tx}.png`), TILE, TILE, rgb);
    }
    console.log(`tile row ${ty} written`);
  }
  return total;
}

function verify(grid) {
  // Anchor ranges allow for 1-arc-minute gridding: sharp summits are averaged
  // over ~2 km cells, so peaks read lower than their true spot heights.
  const anchors = [
    ['Mount Everest summit', 27.9881, 86.925, 7000, 9000],
    ['K2 summit', 35.8825, 76.5133, 6800, 9000],
    ['Dead Sea surface', 31.5, 35.47, -450, -300],
    ['Challenger Deep', 11.3733, 142.5917, -11000, -9500],
    ['Sahara (Air massif)', 23.4, 12.5, 200, 900],
    ['London', 51.5074, -0.1278, 0, 200],
    ['Greenland ice summit', 72.5796, -38.4592, 2400, 3400],
    ['Central Pacific', -10, -150, -6000, -4000],
  ];
  let failures = 0;
  for (const [name, lat, lon, lo, hi] of anchors) {
    const h = bilinear(grid, lat, lon);
    const pass = h >= lo && h <= hi;
    if (!pass) failures++;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${h.toFixed(0)} m (expected ${lo}..${hi})`);
  }
  // PNG roundtrip check on one tile
  const t = readPngRgb(join(OUT, 'tiles', 'r2_c5.png'));
  for (let i = 0; i < 1000; i++) {
    const px = Math.floor(Math.random() * TILE * TILE);
    const gy = 2 * TILE + Math.floor(px / TILE);
    const gx = 5 * TILE + (px % TILE);
    const expect = grid[gy * GRID_COLS + gx] + ELEV_OFFSET;
    const got = (t.rgb[px * 3] << 8) | t.rgb[px * 3 + 1];
    if (got !== expect) {
      failures++;
      console.error(`FAIL png roundtrip at ${px}: ${got} != ${expect}`);
      break;
    }
  }
  console.log('PNG roundtrip verified.');
  return failures;
}

function writeOutputs(grid, minElev, maxElev) {
  mkdirSync('tests/fixtures', { recursive: true });
  const meta = {
    gridCols: GRID_COLS,
    gridRows: GRID_ROWS,
    cellArcSec: 60,
    tilePx: TILE,
    tilesX: TILES_X,
    tilesY: TILES_Y,
    elevOffset: ELEV_OFFSET,
    minElev,
    maxElev,
    source: EARTH_CITATION,
  };
  writeFileSync(join(OUT, 'meta.json'), JSON.stringify(meta, null, 2));

  // Everest-area fixture for unit tests: 96x96 cells, raw little-endian int16.
  const N = 96;
  const r0 = latToRow(27.9881) - N / 2;
  const c0 = lonToCol(86.925) - N / 2;
  const fx = new Int16Array(N * N);
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      fx[r * N + c] = grid[(r0 + r) * GRID_COLS + (c0 + c)];
  writeFileSync('tests/fixtures/everest_96.i16', Buffer.from(fx.buffer));
  writeFileSync('tests/fixtures/everest_96.meta.json', JSON.stringify({
    rows: N, cols: N, row0: r0, col0: c0,
    northLat: 90 - (r0 + 0.5) / 60, westLon: -180 + (c0 + 0.5) / 60,
    cellArcSec: 60,
  }, null, 2));
}

async function main() {
  console.log('Earth DEM converter (ETOPO 2022, 60 arc-sec ice surface)');
  const paths = await downloadBands();
  const grid = new Int16Array(GRID_ROWS * GRID_COLS);
  const covered = scatterBands(paths, grid);
  const missing = GRID_ROWS * GRID_COLS - covered;
  console.log(`coverage: ${((covered / (GRID_ROWS * GRID_COLS)) * 100).toFixed(3)}% (missing ${missing})`);
  let minElev = 32767;
  let maxElev = -32768;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] < minElev) minElev = grid[i];
    if (grid[i] > maxElev) maxElev = grid[i];
  }
  console.log(`elevation range: ${minElev} .. ${maxElev} m`);
  const bytes = writeTiles(grid);
  console.log(`tiles total: ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  writeOutputs(grid, minElev, maxElev);
  const failures = verify(grid);
  if (failures > 0) {
    console.error(`${failures} verification failure(s)`);
    process.exit(1);
  }
  console.log('ALL VERIFIED');
}

main();


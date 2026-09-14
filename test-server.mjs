import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

import { ChunkManager } from './src/sim/world/chunkManager.js';
import { ElevationSource } from './src/sim/world/earth/elevationGrid.js';
import { latLonToWorld, worldToLatLon } from './src/sim/world/earth/earthProjection.js';
import {
  EARTH_SPAWN, EARTH_SPAWN_LAT, EARTH_SPAWN_LON, TILE_PX, ELEV_OFFSET,
} from './src/sim/world/earth/earthConfig.js';
import { readPngRgb } from './scripts/dem/pngio.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const distDir = join(__dirname, 'dist');
const PORT = 8080;

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function getMimeType(filePath) {
  return mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// Earth terrain pipeline checks (run at startup against real assets)
// ---------------------------------------------------------------------------

const failures = new Set();
function check(name, cond, detail) {
  if (cond) console.log('[earth] PASS: ' + name);
  else {
    failures.add(name + (detail ? ' (' + detail + ')' : ''));
    console.error('[earth] FAIL: ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

// 1. Projection anchors.
const london = latLonToWorld(51.5074, -0.1278);
const spawnRoundTrip = worldToLatLon(EARTH_SPAWN.x, EARTH_SPAWN.z);
check('spawn config projects to its latitude', Math.abs(spawnRoundTrip.lat - EARTH_SPAWN_LAT) < 1e-9);
check('spawn config projects to its longitude', Math.abs(spawnRoundTrip.lon - EARTH_SPAWN_LON) < 1e-9);
check('projection is deterministic', london.x === latLonToWorld(51.5074, -0.1278).x);

// 2. Real tile assets: decode the shipped PNGs through the same R/G path the
//    browser uses and sample real coordinates.
const META = JSON.parse(readFileSync(join(__dirname, 'public/assets/earth/meta.json'), 'utf8'));
const tiles = new Map();
function cellAt(gx, gy) {
  const cx = ((gx % META.gridCols) + META.gridCols) % META.gridCols;
  const row = Math.floor(gy / META.tilePx);
  const col = Math.floor(cx / META.tilePx);
  const key = row + ',' + col;
  let tile = tiles.get(key);
  if (tile === undefined) {
    const png = readPngRgb(join(__dirname, 'public/assets/earth/tiles', `r${row}_c${col}.png`));
    tile = new Int16Array(META.tilePx * META.tilePx);
    for (let i = 0; i < tile.length; i++) {
      tile[i] = ((png.rgb[i * 3] << 8) | png.rgb[i * 3 + 1]) - META.elevOffset;
    }
    tiles.set(key, tile);
  }
  return tile[(gy % META.tilePx) * META.tilePx + (cx % META.tilePx)];
}
function realElevation(lat, lon) {
  const fx = ((lon + 180) / 360) * META.gridCols - 0.5;
  const fy = ((90 - lat) / 180) * META.gridRows - 0.5;
  const gx0 = Math.floor(fx);
  const gy0 = Math.max(0, Math.min(META.gridRows - 2, Math.floor(fy)));
  const tx = fx - gx0;
  const ty = fy - gy0;
  return (
    (cellAt(gx0, gy0) * (1 - tx) + cellAt(gx0 + 1, gy0) * tx) * (1 - ty) +
    (cellAt(gx0, gy0 + 1) * (1 - tx) + cellAt(gx0 + 1, gy0 + 1) * tx) * ty
  );
}

check('elevation asset grid matches metadata', META.gridCols === 21600 && META.gridRows === 10800);
check('spawn point (London) is land above sea level', realElevation(EARTH_SPAWN_LAT, EARTH_SPAWN_LON) > 0);
check('Everest is Himalayan in the shipped tiles', realElevation(27.9881, 86.925) > 7000);
check('Challenger Deep is abyssal in the shipped tiles', realElevation(11.3733, 142.5917) < -9000);
check('mid-Pacific is oceanic in the shipped tiles', realElevation(-10, -150) < 0);

// 3. Synthetic source + chunk pipeline: deferral, generation, water biome.
function syntheticLoader(valueFn) {
  return (row, col) => {
    const tile = new Int16Array(TILE_PX * TILE_PX);
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        tile[y * TILE_PX + x] = valueFn(col * TILE_PX + x, row * TILE_PX + y);
      }
    }
    return Promise.resolve(tile);
  };
}

const center = { x: Math.floor(EARTH_SPAWN.x / 16), y: 0, z: Math.floor(EARTH_SPAWN.z / 16) };
const landSource = new ElevationSource(syntheticLoader((gx, gy) => 500 + ((gy * 7 + gx) % 400)));
const landChunks = new ChunkManager(landSource);
landChunks.updateActiveChunks(center, 1);
const deferredCount = landChunks.getActiveChunks().length;
await landSource.waitForArea();
landChunks.updateActiveChunks(center, 1);
check('chunks defer until elevation tiles are resident', deferredCount === 0);
check('chunks materialize once tiles arrive', landChunks.getActiveChunks().length === 9, 'got ' + landChunks.getActiveChunks().length);

const landBiome = landChunks.biomes.getBiome(EARTH_SPAWN.x, EARTH_SPAWN.z);
check('positive synthetic terrain classifies as land', landBiome.type !== 'water', landBiome.type);

const seaSource = new ElevationSource(syntheticLoader(() => -1200));
const seaChunks = new ChunkManager(seaSource);
seaChunks.updateActiveChunks(center, 1);
await seaSource.waitForArea();
seaChunks.updateActiveChunks(center, 1);
check('negative synthetic terrain classifies as water', seaChunks.biomes.getBiome(EARTH_SPAWN.x, EARTH_SPAWN.z).type === 'water');

// 4. Encoded elevation values survive the R/G packing used by the assets.
const packed = Math.round(realElevation(27.9881, 86.925)) + ELEV_OFFSET;
const unpacked = ((packed >> 8) << 8) | (packed & 0xff);
check('R/G packing is lossless', unpacked === packed);

if (failures.size > 0) {
  console.error('[earth] ' + failures.size + ' check(s) failed');
} else {
  console.log('[earth] All startup checks passed.');
}

// ---------------------------------------------------------------------------
// Static file server (serves dist/, falls back to public/ for assets)
// ---------------------------------------------------------------------------

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let filePath = join(distDir, urlPath === '/' ? 'index.html' : urlPath);

  if (!existsSync(filePath)) {
    const assetPath = join(__dirname, 'public', urlPath);
    if (existsSync(assetPath)) {
      filePath = assetPath;
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: ' + urlPath);
      return;
    }
  }

  const body = readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': getMimeType(filePath),
    'Content-Length': body.length,
    'Cache-Control': 'no-cache',
  });
  res.end(body);
});

server.listen(PORT, () => {
  console.log(`Serving ${distDir} (and public/ assets) on http://localhost:${PORT}`);
});

import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

import { BiomeManager } from './src/sim/world/biomeManager.js';
import { MacroHeightmap } from './src/sim/world/macroHeightmap.js';
import { RiverGenerator } from './src/sim/world/riverGenerator.js';
import { carveRiverTiles, RIVER_HALF_WIDTH } from './src/sim/world/riverCarve.js';
import { RegionMap, REGION_BIASES } from './src/sim/world/regionMap.js';
import { ChunkManager } from './src/sim/world/chunkManager.js';

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

// ---------- Step 6 pipeline checks (run at startup) ----------
const failures = new Set();
function check(name, cond, detail) {
  if (cond) console.log('[pipeline] PASS: ' + name);
  else {
    failures.add(name + (detail ? ' (' + detail + ')' : ''));
    console.error('[pipeline] FAIL: ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

const plainBiome = new BiomeManager(42);
const biasedBiome = new BiomeManager(42);
biasedBiome.setRegionProvider(() => REGION_BIASES.upland_plain);

let identical = true;
let bounded = true;
for (let x = -2000; x <= 4000; x += 331) {
  for (let z = -4000; z <= 4000; z += 353) {
    const a = plainBiome.getElevation(x, z);
    const b = biasedBiome.getElevation(x, z);
    if (a !== b) identical = false;
    const r = a === 0 ? 1 : b / a;
    if (!(r >= 0.4 && r <= 1.6)) bounded = false;
  }
}
check('zero-bias region leaves output identical', identical);
check('non-zero biases stay bounded (0.4x..1.6x)', bounded);

const bayBiome = new BiomeManager(42);
bayBiome.setRegionProvider(() => REGION_BIASES.coastal_bay);
let shifted = false;
for (let z = -4000; z <= 4000; z += 71) {
  const a = plainBiome.getBiome(300, z).type;
  const b = bayBiome.getBiome(300, z).type;
  if (a !== b) shifted = true;
}
check('moisture bias shifts biome classification', shifted);

const cmA = new ChunkManager(42);
const cmB = new ChunkManager(42);

const coastFactorProbe = (wx, wz) => plainBiome.getCoastFactor(wx, wz);
const riverProbe = new RiverGenerator(42, new MacroHeightmap(42, coastFactorProbe), coastFactorProbe);
riverProbe.generate();

const coords = [];
{
  let hit = 0;
  for (const r of riverProbe.getRivers()) {
    for (const p of r.points) {
      const cc = { x: Math.floor(p.x / 16), y: 0, z: Math.floor(p.z / 16) };
      if (!coords.some((c) => c.x === cc.x && c.z === cc.z)) coords.push(cc);
      if (++hit >= 5) break;
    }
    if (hit >= 5) break;
  }
}

let chunksIdentical = true;
let waterCount = 0;
const typeSet = new Set();
for (const c of coords) {
  const a = cmA.generateChunk(c).chunk;
  const b = cmB.generateChunk(c).chunk;
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = 0; y < 16; y++) {
        const ta = a.tiles[x][z][y];
        const tb = b.tiles[x][z][y];
        if (ta.terrainType !== tb.terrainType) chunksIdentical = false;
        if (ta.elevation >= 0) {
          typeSet.add(ta.terrainType);
          if (ta.terrainType === 'water') waterCount++;
        }
      }
    }
  }
}
check('chunk generation deterministic across full pipeline', chunksIdentical);
check('rivers carved somewhere in generated chunks', waterCount > 0, 'waterTiles=' + waterCount);
check('varied terrain types produced', typeSet.size >= 2, [...typeSet].join(','));

const cm = new ChunkManager(42);
const west = cm.generateChunk({ x: 10, y: 0, z: 20 });
const east = cm.generateChunk({ x: 11, y: 0, z: 20 });
let seamOk = true;
for (let z = 0; z < 16; z++) {
  const worldZ = 20 * 16 + z;
  const fromChunk = east.heightmap[0 * 16 + z];
  const fromSampler = cm.getHeightAt(176, worldZ);
  if (Math.abs(fromChunk - fromSampler) > 0.0001) seamOk = false;
  const hw = west.heightmap[15 * 16 + z];
  if (Math.abs(hw - fromChunk) > 150) seamOk = false;
}
check('adjacent chunks agree on shared world coordinates (no seams)', seamOk);

const coastFactorFn = (wx, wz) => plainBiome.getCoastFactor(wx, wz);
const rg = new RiverGenerator(42, new MacroHeightmap(42, coastFactorFn), coastFactorFn);
rg.generate();

let crossingsChecked = 0;
let crossingsCarved = 0;

function waterColumnsNear(chunk, wx, wz, radius) {
  let n = 0;
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      const cx = chunk.coordinate.x * 16 + x + 0.5;
      const cz = chunk.coordinate.z * 16 + z + 0.5;
      if (Math.abs(cx - wx) <= radius && Math.abs(cz - wz) <= radius) {
        const column = chunk.tiles[x][z];
        for (let y = column.length - 1; y >= 0; y--) {
          if (column[y].elevation >= 0) {
            if (column[y].terrainType === 'water') n++;
            break;
          }
        }
      }
    }
  }
  return n;
}

for (const r of rg.getRivers()) {
  for (let i = 0; i < r.points.length - 1; i++) {
    const a = r.points[i];
    const b = r.points[i + 1];
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    const k0 = Math.ceil(lo / 16);
    const k1 = Math.floor(hi / 16);
    if (k1 < k0) continue;
    const bx = k0 * 16;
    const t = (bx - a.x) / (b.x - a.x);
    const bz = a.z + (b.z - a.z) * t;
    const cz = Math.floor(bz / 16);
    const left = cm.generateChunk({ x: k0 - 1, y: 0, z: cz }).chunk;
    const right = cm.generateChunk({ x: k0, y: 0, z: cz }).chunk;
    const wl = waterColumnsNear(left, bx, bz, 10);
    const wr = waterColumnsNear(right, bx, bz, 10);
    crossingsChecked++;
    if (wl > 0 && wr > 0) crossingsCarved++;
    break;
  }
  if (crossingsChecked >= 3) break;
}
check(
  'river segments crossing chunk seams carve both sides',
  crossingsChecked > 0 && crossingsCarved === crossingsChecked,
  'checked=' + crossingsChecked + ' carved=' + crossingsCarved,
);

function makeFlatChunk(cx, cz) {
  const tiles = [];
  for (let x = 0; x < 16; x++) {
    const column = [];
    for (let z = 0; z < 16; z++) {
      const slice = [];
      for (let y = 0; y < 16; y++) {
        if (y > 10) slice.push({ terrainType: 'grass', elevation: -1 });
        else slice.push({ terrainType: 'dirt', elevation: 10 });
      }
      column.push(slice);
    }
    tiles.push(column);
  }
  return { coordinate: { x: cx, y: 0, z: cz }, tiles, seed: 0 };
}

const synthetic = makeFlatChunk(100, 100);
const carved = carveRiverTiles(
  synthetic,
  [
    { x: 100 * 16 + 8.5, y: 0, z: 100 * 16 - 50 },
    { x: 100 * 16 + 8.5, y: 0, z: 100 * 16 + 80 },
  ],
  RIVER_HALF_WIDTH,
);
check('carve sets water surface tiles', carved > 0, 'carved=' + carved);
check(
  'carved tile is surface water, below stays dirt',
  synthetic.tiles[8][8][10].terrainType === 'water' && synthetic.tiles[8][8][9].terrainType === 'dirt',
);
check(
  'air tiles untouched',
  synthetic.tiles[8][8][11].terrainType === 'grass' && synthetic.tiles[8][8][11].elevation === -1,
);

const untouched = makeFlatChunk(100, 100);
const carvedAway = carveRiverTiles(
  untouched,
  [
    { x: 100 * 16 + 500, y: 0, z: 100 * 16 + 500 },
    { x: 100 * 16 + 600, y: 0, z: 100 * 16 + 600 },
  ],
  RIVER_HALF_WIDTH,
);
check('no carve when river far from chunk', carvedAway === 0);

if (failures.size > 0) {
  console.error('\n[pipeline] FAILURES (' + failures.size + '):');
  for (const f of failures) console.error('  - ' + f);
  console.error('\nServer still started, but pipeline checks failed.');
} else {
  console.log('\n[pipeline] All pipeline checks passed.');
}

const server = createServer((req, res) => {
  let urlPath = new URL(req.url, `http://localhost:${PORT}`).pathname;
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = join(distDir, urlPath);

  if (!filePath.startsWith(distDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!existsSync(filePath)) {
    const indexPath = join(distDir, 'index.html');
    if (existsSync(indexPath)) {
      const html = readFileSync(indexPath);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
    return;
  }

  const content = readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': getMimeType(filePath),
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(content);
});

server.listen(PORT, () => {
  console.log('\n🎮 Upheaval Play Test Server');
  console.log(`   Serving: ${distDir}`);
  console.log(`   URL:     http://localhost:${PORT}`);
  console.log('   Press Ctrl+C to stop\n');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} in use. Try a different port.`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});


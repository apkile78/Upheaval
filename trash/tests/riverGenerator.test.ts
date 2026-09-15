/**
 * Step 6.4 - River generation + carving tests.
 *
 * Plain TypeScript, no test-runner dependency. Run via:
 *   npx tsc tests/riverGenerator.test.ts --outDir /tmp/river_test \
 *     --module commonjs --target ES2022 --rootDir . --strict && \
 *   node /tmp/river_test/tests/riverGenerator.test.js
 */

import type { CoastFactorFn, RiverPath, WorldChunk, TerrainTile } from '../src/types/world';
import { MacroHeightmap } from '../src/sim/world/macroHeightmap';
import { RiverGenerator } from '../src/sim/world/riverGenerator';
import { carveRiverTiles } from '../src/sim/world/riverCarve';
import { BiomeManager } from '../src/sim/world/biomeManager';
import { ChunkManager } from '../src/sim/world/chunkManager';

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

// 1. Determinism: identical seeds -> identical river sets.
function buildRivers(): RiverPath[] {
  const rg = new RiverGenerator(42, macro, coastFactor);
  rg.generate();
  return rg.getRivers();
}
const riversA = buildRivers();
const riversB = buildRivers();
check('rivers traced', riversA.length >= 6, 'count=' + riversA.length);
check(
  'deterministic for identical seeds',
  JSON.stringify(riversA) === JSON.stringify(riversB),
);

// 2. Structure: every river has source inland/high and mouth at the coast.
let allReachCoast = true;
let allStartInland = true;
for (const r of riversA) {
  const first = r.points[0];
  const last = r.points[r.points.length - 1];
  if (coastFactor(first.x, first.z) < 0.5) allStartInland = false;
  if (coastFactor(last.x, last.z) >= 0.25) allReachCoast = false;
}
check('all river sources start well inland', allStartInland);
check('all rivers reach the coastline', allReachCoast);

// 3. Descent character: overall drop from source to mouth, allowing small
// plateau-escape fluctuations along the way.
let overallDescends = true;
for (const r of riversA) {
  if (r.points[r.points.length - 1].y > r.points[0].y - 100) overallDescends = false;
}
check('paths descend overall (source high, mouth low)', overallDescends);

// 4. Spatial query: points near a box that contains a river point are found.
const rg = new RiverGenerator(42, macro, coastFactor);
rg.generate();
const somePoint = riversA[0].points[Math.floor(riversA[0].points.length / 2)];
const near = rg.getRiverPointsNear(somePoint.x - 10, somePoint.z - 10, somePoint.x + 10, somePoint.z + 10);
check('getRiverPointsNear finds points in range', near.length > 0);
const far = rg.getRiverPointsNear(somePoint.x + 100000, somePoint.z + 100000, somePoint.x + 100200, somePoint.z + 100200);
check('getRiverPointsNear empty far away', far.length === 0);

// 5. carveRiverTiles: synthetic flat chunk, river through the middle.
function makeFlatChunk(cx: number, cz: number): WorldChunk {
  const tiles: TerrainTile[][][] = [];
  for (let x = 0; x < 16; x++) {
    const column: TerrainTile[][] = [];
    for (let z = 0; z < 16; z++) {
      const slice: TerrainTile[] = [];
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
const carved = carveRiverTiles(synthetic, [
  { x: 100 * 16 + 8.5, y: 0, z: 100 * 16 - 50 },
  { x: 100 * 16 + 8.5, y: 0, z: 100 * 16 + 80 },
]);
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
const carvedAway = carveRiverTiles(untouched, [
  { x: 100 * 16 + 500, y: 0, z: 100 * 16 + 500 },
  { x: 100 * 16 + 600, y: 0, z: 100 * 16 + 600 },
]);
check('no carve when river far from chunk', carvedAway === 0);

// 6. ChunkManager integration: chunks along the traced rivers carve water.
const cm = new ChunkManager(42);
function countWater(chunk: WorldChunk): number {
  let n = 0;
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = 0; y < 16; y++) {
        const t = chunk.tiles[x][z][y];
        if (t.elevation >= 0 && t.terrainType === 'water') n++;
      }
    }
  }
  return n;
}
let waterTiles = 0;
let chunkCoords: string[] = [];
for (const r of riversA) {
  for (const p of r.points) {
    const ccx = Math.floor(p.x / 16);
    const ccz = Math.floor(p.z / 16);
    const key = ccx + ',' + ccz;
    if (chunkCoords.indexOf(key) !== -1) continue;
    chunkCoords.push(key);
    if (chunkCoords.length > 12) break;
    waterTiles += countWater(cm.generateChunk({ x: ccx, y: 0, z: ccz }).chunk);
  }
  if (chunkCoords.length > 12) break;
}
check('chunk generation carves river water tiles', waterTiles > 0, 'waterTiles=' + waterTiles);

// 7. ChunkManager determinism: regenerated chunks are identical.
const cm2 = new ChunkManager(42);
let identical = true;
for (const key of chunkCoords) {
  const ccx = parseInt(key.split(',')[0], 10);
  const ccz = parseInt(key.split(',')[1], 10);
  const a = cm.generateChunk({ x: ccx, y: 0, z: ccz }).chunk;
  const b = cm2.generateChunk({ x: ccx, y: 0, z: ccz }).chunk;
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = 0; y < 16; y++) {
        if (a.tiles[x][z][y].terrainType !== b.tiles[x][z][y].terrainType) identical = false;
      }
    }
  }
}
check('chunk generation deterministic with rivers', identical);

if (failures > 0) {
  throw new Error(failures + ' test(s) failed');
}
console.log('All river generation tests passed.');

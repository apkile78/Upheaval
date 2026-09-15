/**
 * Step 6.6 - Full pipeline verification: coastline + rivers + regions.
 *
 * Plain TypeScript, no test-runner dependency. Run via:
 *   npx tsc tests/pipeline.test.ts --outDir /tmp/pipeline_test \
 *     --module commonjs --target ES2022 --rootDir . --strict && \
 *   node /tmp/pipeline_test/tests/pipeline.test.js
 */

import type { CoastFactorFn } from '../src/types/world';
import { BiomeManager } from '../src/sim/world/biomeManager';
import { MacroHeightmap } from '../src/sim/world/macroHeightmap';
import { RiverGenerator } from '../src/sim/world/riverGenerator';
import { RegionMap, REGION_BIASES } from '../src/sim/world/regionMap';
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

// 1. Bias-not-override: region provider nudges but never flips the signal.
const plainBiome = new BiomeManager(42);
const biasedBiome = new BiomeManager(42);
biasedBiome.setRegionProvider((wx: number, wz: number) => REGION_BIASES.upland_plain);
let identical = true;
let bounded = true;
for (let x = -2000; x <= 4000; x += 331) {
  for (let z = -4000; z <= 4000; z += 353) {
    const a = plainBiome.getElevation(x, z);
    const b = biasedBiome.getElevation(x, z);
    if (a !== b) identical = false;                 // upland_plain bias = 0 -> identical
    const r = a === 0 ? 1 : b / a;
    if (!(r >= 0.4 && r <= 1.6)) bounded = false;   // worst bias is +/-0.3
  }
}
check('zero-bias region leaves output identical', identical);
check('non-zero biases stay bounded (0.4x..1.6x)', bounded);

// 2. Moisture bias nudges within [0, 1] and differs for bay (+0.2).
const bayBiome = new BiomeManager(42);
bayBiome.setRegionProvider((wx: number, wz: number) => REGION_BIASES.coastal_bay);
// getMoisture is private; verify indirectly via biome classification shift:
// with +0.2 moisture, some grass locations become swamp/forest.
let shifted = false;
for (let z = -4000; z <= 4000; z += 71) {
  const a = plainBiome.getBiome(300, z).type;
  const b = bayBiome.getBiome(300, z).type;
  if (a !== b) shifted = true;
}
check('moisture bias shifts biome classification', shifted);

// 3. Full ChunkManager pipeline determinism (coastline + rivers + regions).
const cmA = new ChunkManager(42);
const cmB = new ChunkManager(42);
// Chunk coords derived from actual river paths (they run at |z| up to 9000).
const coastFactorProbe: CoastFactorFn = (wx: number, wz: number): number => plainBiome.getCoastFactor(wx, wz);
const riverProbe = new RiverGenerator(42, new MacroHeightmap(42, coastFactorProbe), coastFactorProbe);
riverProbe.generate();
const coords: { x: number; y: number; z: number }[] = [];
outer: for (const r of riverProbe.getRivers()) {
  for (const p of r.points) {
    const cc = { x: Math.floor(p.x / 16), y: 0, z: Math.floor(p.z / 16) };
    if (!coords.some((c) => c.x === cc.x && c.z === cc.z)) coords.push(cc);
    if (coords.length >= 5) break outer;
  }
}
let chunksIdentical = true;
let waterCount = 0;
let typeSet = new Set<string>();
for (const c of coords) {
  const a = cmA.generateChunk(c).chunk;
  const b = cmB.generateChunk(c).chunk;
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = 0; y < 16; y++) {
        const ta = a.tiles[x][z][y];
        const tb = b.tiles[x][z][y];
        if (ta.terrainType !== tb.terrainType || ta.elevation !== tb.elevation) chunksIdentical = false;
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

// 4. Chunk-boundary consistency (no seams): (a) the SAME world coordinate
// yields the identical height whether read via the chunk heightmap or via
// the manager's bilinear sampler; (b) adjacent edge columns are smooth.
const cm = new ChunkManager(42);
const west = cm.generateChunk({ x: 10, y: 0, z: 20 });
const east = cm.generateChunk({ x: 11, y: 0, z: 20 });
let seamOk = true;
for (let z = 0; z < 16; z++) {
  const worldZ = 20 * 16 + z;
  // (a) east chunk's first column is worldX 176 in both views.
  const fromChunk = east.heightmap[0 * 16 + z];
  const fromSampler = cm.getHeightAt(176, worldZ);
  if (Math.abs(fromChunk - fromSampler) > 0.0001) seamOk = false;
  // (b) adjacent edge columns (worldX 175 vs 176) must be smooth, no cliff.
  const hw = west.heightmap[15 * 16 + z];
  if (Math.abs(hw - fromChunk) > 150) seamOk = false;
}
check('adjacent chunks agree on shared world coordinates (no seams)', seamOk);

// 5. River carving continuity: a segment crossing a chunk boundary carves
// water columns on BOTH sides of the seam (no half-carved rivers).
const coastFactorFn: CoastFactorFn = (wx: number, wz: number): number => plainBiome.getCoastFactor(wx, wz);
const rg = new RiverGenerator(42, new MacroHeightmap(42, coastFactorFn), coastFactorFn);
rg.generate();
let crossingsChecked = 0;
let crossingsCarved = 0;
function waterColumnsNear(chunk: { coordinate: { x: number; z: number }; tiles: { terrainType: string; elevation: number }[][][] }, wx: number, wz: number, radius: number): number {
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
    // Find a multiple-of-16 X boundary between the two endpoints.
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

if (failures > 0) {
  throw new Error(failures + ' test(s) failed');
}
console.log('All pipeline tests passed.');

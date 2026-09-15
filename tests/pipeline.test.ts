/**
 * End-to-end pipeline tests: Earth elevation source -> ChunkManager.
 *
 * Plain TypeScript, no test-runner dependency. Run via scripts/run-tests.mjs.
 */

import { ChunkManager, CHUNK_SIZE } from '../src/sim/world/chunkManager';
import { ElevationSource, TileLoader } from '../src/sim/world/earth/elevationGrid';
import { latLonToWorld } from '../src/sim/world/earth/earthProjection';
import { CELL_METERS, EARTH_SPAWN, GRID_COLS, TILE_PX } from '../src/sim/world/earth/earthConfig';
import type { WorldChunk } from '../src/types/world';

let failures = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log('PASS: ' + name);
  } else {
    failures++;
    console.error('FAIL: ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

/** Deterministic relief ramp (int16-safe, mixes positive and negative). */
function gridValue(gx: number, gy: number): number {
  return ((gy * 97 + (gx % 501) * 3) % 30000) - 15000;
}

function makeLoader(valueFn: (gx: number, gy: number) => number): TileLoader {
  return (row: number, col: number): Promise<Int16Array> => {
    const tile = new Int16Array(TILE_PX * TILE_PX);
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        tile[y * TILE_PX + x] = valueFn(col * TILE_PX + x, row * TILE_PX + y);
      }
    }
    return Promise.resolve(tile);
  };
}

async function main(): Promise<void> {
  const spawnCellX = Math.floor(EARTH_SPAWN.x / CELL_METERS);
  const spawnCellZ = Math.floor(EARTH_SPAWN.z / CELL_METERS);

  // 1. Deferral: chunks do not materialize while tiles are still loading.
  const rampSource = new ElevationSource(makeLoader(gridValue));
  const ramp = new ChunkManager(rampSource);
  const center = { x: Math.floor(EARTH_SPAWN.x / 16), y: 0, z: Math.floor(EARTH_SPAWN.z / 16) };
  ramp.updateActiveChunks(center, 2);
  check('no chunks generated before tiles are resident', ramp.getActiveChunks().length === 0);
  await rampSource.waitForArea();
  ramp.updateActiveChunks(center, 2);
  check('all chunks generated after tiles load', ramp.getActiveChunks().length === 25, 'got ' + ramp.getActiveChunks().length);

  // 2. Determinism across managers.
  const rampSource2 = new ElevationSource(makeLoader(gridValue));
  await rampSource2.waitForArea(); // nothing requested yet; resolves immediately
  const ramp2 = new ChunkManager(rampSource2);
  ramp2.updateActiveChunks(center, 2);
  await rampSource2.waitForArea();
  ramp2.updateActiveChunks(center, 2);
  let deterministic = true;
  const chunkA = ramp.getChunk(center)!;
  const chunkB = ramp2.getChunk(center)!;
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let y = 0; y < CHUNK_SIZE; y++) {
        const ta = chunkA.tiles[x][z][y];
        const tb = chunkB.tiles[x][z][y];
        if (ta.terrainType !== tb.terrainType || ta.elevation !== tb.elevation) deterministic = false;
      }
    }
  }
  check('chunk generation is deterministic', deterministic);

  // 3. Chunk-boundary consistency: adjacent chunks agree on shared columns
  //    and heights are smooth across the seam.
  const westHm = ramp.getHeightmap({ x: center.x - 1, y: 0, z: center.z })!;
  const eastHm = ramp.getHeightmap(center)!;
  let seamOk = true;
  for (let z = 0; z < CHUNK_SIZE; z++) {
    const worldZ = center.z * CHUNK_SIZE + z;
    const fromEast = eastHm[0 * CHUNK_SIZE + z];
    const fromSampler = ramp.getHeightAt(center.x * CHUNK_SIZE, worldZ);
    if (Math.abs(fromEast - fromSampler) > 0.0001) seamOk = false;
    if (Math.abs(westHm[15 * CHUNK_SIZE + z] - fromEast) > CELL_METERS * 4) seamOk = false;
  }
  check('adjacent chunks agree at the seam (no cliffs)', seamOk);

  // 4. getHeightAt matches bilinear sampling of the source.
  const probe = latLonToWorld(51.5074, -0.1278);
  const fromSource = rampSource.sampleHeight(probe.x, probe.z);
  const fromChunk = ramp.getHeightAt(probe.x, probe.z);
  check(
    'getHeightAt agrees with source sampling near spawn',
    Math.abs(fromSource - fromChunk) < CELL_METERS * 2,
    'source ' + fromSource.toFixed(1) + ' chunk ' + fromChunk.toFixed(1),
  );

  // 5. Ocean world: everything below sea level classifies as water.
  const oceanSource = new ElevationSource(makeLoader(() => -800));
  const ocean = new ChunkManager(oceanSource);
  ocean.updateActiveChunks(center, 1);
  await oceanSource.waitForArea();
  ocean.updateActiveChunks(center, 1);
  const oceanHeightmap = ocean.getHeightmap(center)!;
  let allDepth = true;
  for (let i = 0; i < oceanHeightmap.length; i++) {
    if (oceanHeightmap[i] !== -800) allDepth = false;
  }
  check('deep-ocean world carries real bathymetry depth', allDepth);
  check(
    'ocean surface classifies as water biome',
    ocean.biomes.getBiome(probe.x, probe.z).type === 'water',
  );
  check(
    'spawn ramp world is not classified as ocean',
    ramp.biomes.getBiome(probe.x, probe.z).type !== 'water' || gridValue(spawnCellX, spawnCellZ) <= 0,
  );

  // 6. The spawn coordinate sits on land in the real Earth projection sense:
  //    with the ramp source (not real data) we only assert the pipeline can
  //    classify the spawn chunk without error and produces finite heights.
  const spawnChunk = ramp.getChunk(center)!;
  let finite = true;
  const hm = ramp.getHeightmap(center)!;
  for (let i = 0; i < hm.length; i++) {
    if (!Number.isFinite(hm[i])) finite = false;
  }
  check('spawn chunk heightmap is finite', finite, 'sample ' + spawnChunk.tiles[0][0][0].elevation);

  // 7. Grid cell sanity for the loader helper used above.
  check('loader helper covers full grid columns', GRID_COLS === TILE_PX * 10);

  if (failures > 0) {
    throw new Error(failures + ' test(s) failed');
  }
  console.log('All pipeline tests passed.');
}

void main();

/**
 * Elevation source tests - tile loading, bilinear sampling, LRU behavior.
 * Uses a synthetic deterministic grid so no network or PNG assets are needed.
 *
 * Plain TypeScript, no test-runner dependency. Run via scripts/run-tests.mjs.
 */

import { ElevationSource, TileLoader, decodeCell } from '../src/sim/world/earth/elevationGrid';
import { CELL_METERS, GRID_COLS, TILE_PX, ELEV_OFFSET } from '../src/sim/world/earth/earthConfig';

let failures = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log('PASS: ' + name);
  } else {
    failures++;
    console.error('FAIL: ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

/** Deterministic grid value at a global cell index (int16-safe, signed). */
function gridValue(gx: number, gy: number): number {
  return ((gy * 97 + (gx % 501) * 3) % 30000) - 15000;
}

/** Loader producing tiles whose cells match gridValue over the global grid. */
function makeLoader(): TileLoader {
  return (row: number, col: number): Promise<Int16Array> => {
    const tile = new Int16Array(TILE_PX * TILE_PX);
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        tile[y * TILE_PX + x] = gridValue(col * TILE_PX + x, row * TILE_PX + y);
      }
    }
    return Promise.resolve(tile);
  };
}

/** World coordinates of a global cell center. */
function cellCenter(gx: number, gy: number): { x: number; z: number } {
  return { x: (gx + 0.5) * CELL_METERS, z: (gy + 0.5) * CELL_METERS };
}

async function main(): Promise<void> {
  const source = new ElevationSource(makeLoader());

  // 1. Before loading: not ready, sampler falls back to 0 (sea level).
  const c = cellCenter(100, 100);
  check('not ready before request', !source.isReady(c.x - 5, c.z - 5, c.x + 5, c.z + 5));
  check('fallback sample is 0 without tiles', source.sampleHeight(c.x, c.z) === 0);
  check('no tiles cached initially', source.cachedTileCount() === 0);

  // 2. Request + wait makes the area ready and sampling exact at cell centers.
  source.requestArea(c.x - 5, c.z - 5, c.x + 5, c.z + 5);
  await source.waitForArea();
  check('area ready after wait', source.isReady(c.x - 5, c.z - 5, c.x + 5, c.z + 5));
  let exact = true;
  const probeCells: [number, number][] = [[100, 100], [101, 100], [100, 101], [215, 216], [300, 400]];
  for (const [gx, gy] of probeCells) {
    const p = cellCenter(gx, gy);
    const got = source.sampleHeight(p.x, p.z);
    if (Math.abs(got - gridValue(gx, gy)) > 1e-6) {
      exact = false;
      check('cell center value ' + gx + ',' + gy, false, 'got ' + got + ' want ' + gridValue(gx, gy));
    }
  }
  check('cell centers sample exactly', exact);

  // 3. Bilinear midpoint between two horizontally adjacent cell centers.
  const p0 = cellCenter(100, 100);
  const midX = p0.x + CELL_METERS * 0.5;
  const expected = 0.5 * (gridValue(100, 100) + gridValue(101, 100));
  check(
    'bilinear midpoint averages neighbors',
    Math.abs(source.sampleHeight(midX, p0.z) - expected) < 1e-6,
    'got ' + source.sampleHeight(midX, p0.z) + ' want ' + expected,
  );

  // 4. Longitude wrap: halfway between the last and first columns of a row.
  const wrapPoint = { x: GRID_COLS * CELL_METERS, z: p0.z };
  source.requestArea(wrapPoint.x - 5, wrapPoint.z - 5, wrapPoint.x + 5, wrapPoint.z + 5);
  await source.waitForArea();
  const wrapped = 0.5 * (gridValue(GRID_COLS - 1, 100) + gridValue(0, 100));
  check(
    'sampling wraps across the antimeridian',
    Math.abs(source.sampleHeight(wrapPoint.x, wrapPoint.z) - wrapped) < 1e-6,
    'got ' + source.sampleHeight(wrapPoint.x, wrapPoint.z) + ' want ' + wrapped,
  );

  // 5. LRU eviction: maxTiles = 1 keeps only the most recent tile.
  const tiny = new ElevationSource(makeLoader(), 1);
  const inA = cellCenter(10, 10);
  const inB = cellCenter(TILE_PX + 10, 10);
  tiny.requestArea(inA.x - 1, inA.z - 1, inA.x + 1, inA.z + 1);
  await tiny.waitForArea();
  check('tile A resident', tiny.isReady(inA.x - 1, inA.z - 1, inA.x + 1, inA.z + 1));
  tiny.requestArea(inB.x - 1, inB.z - 1, inB.x + 1, inB.z + 1);
  await tiny.waitForArea();
  check('LRU cache respects maxTiles', tiny.cachedTileCount() === 1, 'count ' + tiny.cachedTileCount());
  check('tile A evicted after loading tile B', !tiny.isReady(inA.x - 1, inA.z - 1, inA.x + 1, inA.z + 1));
  check('tile B resident after eviction', tiny.isReady(inB.x - 1, inB.z - 1, inB.x + 1, inB.z + 1));

  // 6. Areas crossing a DEM tile boundary must load both source tiles.
  const boundary = new ElevationSource(makeLoader());
  const boundaryX = TILE_PX * CELL_METERS;
  boundary.requestArea(boundaryX - 5, c.z - 5, boundaryX + 5, c.z + 5);
  await boundary.waitForArea();
  check('tile-boundary area is ready only after both tiles load', boundary.isReady(
    boundaryX - 5, c.z - 5, boundaryX + 5, c.z + 5,
  ));
  check('tile-boundary request loads both neighboring tiles', boundary.cachedTileCount() === 2, 'count ' + boundary.cachedTileCount());

  // 7. Missing-tile sampling falls back to sea level rather than garbage.
  check('fallback outside resident tiles is 0', tiny.sampleHeight(inA.x, inA.z) === 0);

  // 8. PNG channel decode roundtrip across the full elevation range.
  let decodeOk = true;
  for (let v = -10900; v <= 8800; v += 977) {
    const packed = v + ELEV_OFFSET;
    if (decodeCell((packed >> 8) & 0xff, packed & 0xff) !== v) decodeOk = false;
  }
  check('decodeCell inverts the R/G packing', decodeOk);

  if (failures > 0) {
    throw new Error(failures + ' test(s) failed');
  }
  console.log('All elevationGrid tests passed.');
}

void main();

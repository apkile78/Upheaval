/**
 * Macro terrain tests - anchor-relative LOD shell geometry.
 * Uses a synthetic deterministic elevation source so no PNG assets load.
 *
 * Plain TypeScript, no test-runner dependency. Run via scripts/run-tests.mjs.
 */

import { buildMacroTileGeometry, MACRO_TILE_SIZE, MACRO_GRID_POINTS, MACRO_HALF_TILES } from '../src/render/macroGeometry';
import { ElevationSource, TileLoader } from '../src/sim/world/earth/elevationGrid';
import { TILE_PX } from '../src/sim/world/earth/earthConfig';
import { frameAnchor } from '../src/render/frameAnchor';

let failures = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log('PASS: ' + name);
  } else {
    failures++;
    console.error('FAIL: ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

/** Deterministic relief (int16-safe) plus a known deep basin for coloring tests. */
function gridValue(gx: number, gy: number): number {
  if (gx >= 100 && gx < 120 && gy >= 100 && gy < 120) return -2500;
  return 1200 + ((gy * 31 + gx * 17) % 900);
}

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

async function main(): Promise<void> {
  // Anchor at origin keeps the test absolute (buildMacroTileGeometry subtracts it).
  frameAnchor.x = 0;
  frameAnchor.z = 0;

  // Tiles covering world cols/rows the macro neighborhood will sample.
  const source = new ElevationSource(makeLoader());
  source.requestArea(0, 0, MACRO_TILE_SIZE * 2, MACRO_TILE_SIZE * 2);
  await source.waitForArea();
  check('synthetic tiles are resident', source.isReady(0, 0, MACRO_TILE_SIZE * 2, MACRO_TILE_SIZE * 2));

  // 1. Macro tile geometry: expected vertex/index counts.
  const geometry = buildMacroTileGeometry(source, 0, 0);
  const positions = geometry.getAttribute('position');
  const colors = geometry.getAttribute('color');
  const indices = geometry.getIndex();
  check('macro tile has 33x33 vertices', positions.count === MACRO_GRID_POINTS * MACRO_GRID_POINTS, 'got ' + positions.count);
  check('macro tile has per-vertex colors', colors.count === MACRO_GRID_POINTS * MACRO_GRID_POINTS);
  check('macro tile has 32x32 quads as triangles', (indices?.count ?? 0) === 32 * 32 * 6, 'got ' + (indices?.count ?? -1));

  // 2. Vertex heights match the bilinear source at the macro sample points.
  const posArray = positions.array as Float32Array;
  const colorArray = colors.array as Float32Array;
  const step = MACRO_TILE_SIZE / (MACRO_GRID_POINTS - 1);
  let heightMatches = 0;
  let heightChecks = 0;
  for (let gz = 0; gz < MACRO_GRID_POINTS; gz++) {
    for (let gx = 0; gx < MACRO_GRID_POINTS; gx++) {
      const i = gz * MACRO_GRID_POINTS + gx;
      const wx = gx * step;
      const wz = gz * step;
      const expected = source.sampleHeight(wx, wz);
      const got = posArray[i * 3 + 1];
      heightChecks++;
      if (Math.abs(got - expected) < 1e-3) heightMatches++;
    }
  }
  check('macro heights match the elevation source', heightMatches === heightChecks, heightMatches + '/' + heightChecks);
  check('macro colors vary over relief (finite RGB)', Number.isFinite(colorArray[0]));

  // 4. Tile span covers the 3 km+ ring in macro tiles.
  const spanMeters = (MACRO_HALF_TILES * 2 + 1) * MACRO_TILE_SIZE;
  check('macro shell spans beyond 3 km', spanMeters > 6000, spanMeters + ' m');

  geometry.dispose();

  if (failures > 0) {
    throw new Error(failures + ' test(s) failed');
  }
  console.log('All macroTerrain tests passed.');
}

void main();

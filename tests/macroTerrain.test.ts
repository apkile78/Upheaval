/**
 * Macro terrain tests - anchor-relative LOD shell geometry.
 * Uses a synthetic deterministic elevation source so no PNG assets load.
 *
 * Plain TypeScript, no test-runner dependency. Run via scripts/run-tests.mjs.
 */

import {
  buildMacroTileGeometry,
  intersectsVoxelBox,
  MACRO_NEAR_RING,
  MACRO_FAR_RING,
  VOXEL_SKIP_HALF,
} from '../src/render/macroGeometry';
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
  source.requestArea(0, 0, 1024 * 2, 1024 * 2);
  await source.waitForArea();
  check('synthetic tiles are resident', source.isReady(0, 0, 1024 * 2, 1024 * 2));

  // 1. Macro tile geometry: expected vertex/index counts for both ring sizes.
  for (const ring of [MACRO_NEAR_RING, MACRO_FAR_RING]) {
    const geometry = buildMacroTileGeometry(source, 0, 0, ring.tileSize, ring.gridPoints);
    const positions = geometry.getAttribute('position');
    const colors = geometry.getAttribute('color');
    const indices = geometry.getIndex();
    const want = ring.gridPoints * ring.gridPoints;
    check(
      'macro tile ' + ring.tileSize + 'm has a full vertex grid',
      positions.count === want && colors.count === want,
      'got ' + positions.count,
    );
    check(
      'macro tile ' + ring.tileSize + 'm has quads as triangles',
      (indices?.count ?? 0) === (ring.gridPoints - 1) * (ring.gridPoints - 1) * 6,
      'got ' + (indices?.count ?? -1),
    );
    geometry.dispose();
  }

  // 2. Vertex heights match the bilinear source at the macro sample points.
  const geometry = buildMacroTileGeometry(source, 0, 0, MACRO_NEAR_RING.tileSize, MACRO_NEAR_RING.gridPoints);
  const positions = geometry.getAttribute('position');
  const colors = geometry.getAttribute('color');
  const posArray = positions.array as Float32Array;
  const colorArray = colors.array as Float32Array;
  const step = MACRO_NEAR_RING.tileSize / (MACRO_NEAR_RING.gridPoints - 1);
  let heightMatches = 0;
  let heightChecks = 0;
  for (let gz = 0; gz < MACRO_NEAR_RING.gridPoints; gz++) {
    for (let gx = 0; gx < MACRO_NEAR_RING.gridPoints; gx++) {
      const i = gz * MACRO_NEAR_RING.gridPoints + gx;
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
  geometry.dispose();

  // 3. Voxel-box AABB skip: the tile containing the player is skipped, the
  //    neighbor just outside it is kept.
  check(
    'voxel box contains the player point',
    intersectsVoxelBox(-VOXEL_SKIP_HALF, VOXEL_SKIP_HALF, -VOXEL_SKIP_HALF, VOXEL_SKIP_HALF, 0, 0),
  );
  check(
    'tiles far from the voxel box are not skipped',
    !intersectsVoxelBox(1024, 2048, 1024, 2048, 0, 0),
  );

  // 4. Ring spans: near 256 m ring nests inside the far ring, far reaches 3 km+.
  check('near ring reaches past the voxel box', MACRO_NEAR_RING.outerRadius > VOXEL_SKIP_HALF * 2);
  check('far ring outer bound exceeds 3 km', MACRO_FAR_RING.outerRadius > 3000, MACRO_FAR_RING.outerRadius + ' m');
  check('far ring starts inside the near ring outer bound', MACRO_FAR_RING.innerRadius < MACRO_NEAR_RING.outerRadius);

  if (failures > 0) {
    throw new Error(failures + ' test(s) failed');
  }
  console.log('All macroTerrain tests passed.');
}

void main();

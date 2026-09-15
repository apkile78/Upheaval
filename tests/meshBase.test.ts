/**
 * Floating-origin mesh re-seat tests.
 *
 * Geometry is baked once, relative to the render origin that was active when it
 * was built, and only translated on later re-bases. These tests verify the
 * translation is correct in both geometry spaces (bootstrap anchor space and
 * runtime ENU space) and measure the residual error of the no-rebake approach.
 *
 * Plain TypeScript, no test-runner dependency. Run via scripts/run-tests.mjs.
 */

import { applyMeshBase, captureMeshBase, type MeshOrigin } from '../src/render/meshBase';
import { ANCHOR_SNAP, frameAnchor, updateFrameAnchor } from '../src/render/frameAnchor';
import {
  currentLocalEarthFrame,
  updateLocalEarthFrame,
  worldToLocalEnu,
} from '../src/render/earth/localFrame';
import { latLonToWorld } from '../src/sim/world/earth/earthProjection';

let failures = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log('PASS: ' + name);
  } else {
    failures++;
    console.error('FAIL: ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

function makeMesh(): MeshOrigin {
  return { position: { x: 0, y: 0, z: 0 } };
}

function main(): void {
  const start = latLonToWorld(51.5074, -0.1278);

  // ---- Bootstrap: geometry is baked in anchor space before the frame exists.
  updateFrameAnchor(start.x, start.z);
  const bootstrapBase = captureMeshBase();
  check('bootstrap base has no local frame', bootstrapBase.frame === null);

  const bootstrapMesh = makeMesh();
  check('an already-seated mesh needs no write', applyMeshBase(bootstrapMesh, bootstrapBase) === false);
  check(
    'an already-seated mesh stays at the render origin',
    bootstrapMesh.position.x === 0 && bootstrapMesh.position.y === 0 && bootstrapMesh.position.z === 0,
  );

  // A re-base two snap steps east and north must translate by the anchor delta.
  const movedX = start.x + 2 * ANCHOR_SNAP;
  const movedZ = start.z - 2 * ANCHOR_SNAP;
  updateFrameAnchor(movedX, movedZ);
  check('anchor-space mesh is re-seated on re-base', applyMeshBase(bootstrapMesh, bootstrapBase) === true);
  check(
    'anchor-space offset equals the anchor delta',
    bootstrapMesh.position.x === -2 * ANCHOR_SNAP &&
      bootstrapMesh.position.y === 0 &&
      bootstrapMesh.position.z === 2 * ANCHOR_SNAP,
    bootstrapMesh.position.x + ',' + bootstrapMesh.position.y + ',' + bootstrapMesh.position.z,
  );

  // ---- Runtime: geometry is baked in ENU space relative to the local frame.
  updateLocalEarthFrame(movedX, movedZ, 0);
  const frameAtBake = currentLocalEarthFrame;
  check('runtime base records the local frame', frameAtBake !== null && captureMeshBase().frame === frameAtBake);
  if (frameAtBake === null) {
    throw new Error('local Earth frame was not created');
  }

  // Bake a few vertices the way chunkGeometry/macroGeometry do.
  const points: { x: number; z: number; height: number }[] = [
    { x: movedX + 40, z: movedZ - 40, height: 12 },
    { x: movedX - 150, z: movedZ + 60, height: -30 },
    { x: movedX + 900, z: movedZ - 1500, height: 240 },
  ];
  const baked = points.map((p) => worldToLocalEnu(p.x, p.z, p.height, frameAtBake));

  const mesh = makeMesh();
  const runtimeBase = captureMeshBase();
  check('no re-seat while the origin is stable', applyMeshBase(mesh, runtimeBase) === false);

  // Re-base one snap step east and north, exactly as main.ts does, then re-seat.
  const nextX = movedX + ANCHOR_SNAP;
  const nextZ = movedZ - ANCHOR_SNAP;
  updateFrameAnchor(nextX, nextZ);
  updateLocalEarthFrame(nextX, nextZ, 0);
  const frameAfterRebase = currentLocalEarthFrame;
  check('re-base moves the bake-once mesh', applyMeshBase(mesh, runtimeBase) === true);
  if (frameAfterRebase === null || frameAfterRebase === frameAtBake) {
    throw new Error('local Earth frame did not re-base');
  }

  // A re-seated bake-once vertex must land where a fresh bake would put it. The
  // residual is the ENU basis rotation between the two origins (|P| * dTheta, with
  // dTheta = ANCHOR_SNAP / earth radius), so it is sub-millimetre near the player
  // and centimetre-scale across a macro tile. That is what makes translation-only
  // re-basing safe at the 64 m anchor step.
  let nearWorst = 0;
  let farWorst = 0;
  for (let i = 0; i < points.length; i++) {
    const expected = worldToLocalEnu(points[i].x, points[i].z, points[i].height, frameAfterRebase);
    const renderedX = baked[i].east + mesh.position.x;
    const renderedY = baked[i].up + mesh.position.y;
    const renderedZ = -baked[i].north + mesh.position.z;
    const error = Math.hypot(renderedX - expected.east, renderedY - expected.up, renderedZ + expected.north);
    const distance = Math.hypot(points[i].x - movedX, points[i].z - movedZ);
    if (distance < 100) nearWorst = Math.max(nearWorst, error);
    else farWorst = Math.max(farWorst, error);
  }
  check(
    'near-field re-seat error stays sub-millimetre',
    nearWorst > 0 && nearWorst < 0.001,
    'worst error ' + nearWorst.toFixed(7) + ' m within 100 m',
  );
  check(
    'macro-distance re-seat error stays centimetre-scale',
    farWorst > 0 && farWorst < 0.05,
    'worst error ' + farWorst.toFixed(7) + ' m',
  );
  check(
    're-seat error grows with distance from the origin',
    farWorst > nearWorst,
    nearWorst.toFixed(7) + ' m near vs ' + farWorst.toFixed(7) + ' m far',
  );

  check(
    'local frame origin matches the snapped anchor',
    frameAfterRebase.worldX === frameAnchor.x && frameAfterRebase.worldZ === frameAnchor.z,
    frameAfterRebase.worldX + ',' + frameAfterRebase.worldZ + ' vs ' + frameAnchor.x + ',' + frameAnchor.z,
  );

  if (failures > 0) {
    throw new Error(failures + ' test(s) failed');
  }
  console.log('All floating-origin re-seat tests passed.');
}

main();
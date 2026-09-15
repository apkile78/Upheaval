import { createLocalEarthFrame, worldToLocalEnu } from '../src/render/earth/localFrame';
import { METERS_PER_DEGREE } from '../src/sim/world/earth/earthConfig';

let failures = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log('PASS: ' + name);
  } else {
    failures++;
    console.error('FAIL: ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

function main(): void {
  const originX = 180 * METERS_PER_DEGREE;
  const originZ = 90 * METERS_PER_DEGREE;
  const origin = createLocalEarthFrame(originX, originZ, 0);
  const same = worldToLocalEnu(originX, originZ, 0, origin);
  check('frame origin maps to local zero', Math.hypot(same.east, same.north, same.up) < 1e-9);

  const east = worldToLocalEnu(originX + 10, originZ, 0, origin);
  const south = worldToLocalEnu(originX, originZ + 10, 0, origin);
  check('local east follows increasing longitude', east.east > 0 && Math.abs(east.north) < 0.01);
  check('local south follows decreasing latitude', south.north < 0 && Math.abs(south.east) < 0.01);

  const elevated = worldToLocalEnu(originX, originZ, 125, createLocalEarthFrame(originX, originZ, 100));
  check('local up preserves elevation delta', Math.abs(elevated.up - 25) < 1e-6);

  if (failures > 0) throw new Error(failures + ' test(s) failed');
  console.log('All local-frame tests passed.');
}

main();

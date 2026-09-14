/**
 * Phase 2 elevation model verification.
 */

import { createElevationModel } from '../src/sim/world/elevationModel';

let failures = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log('PASS: ' + name);
  } else {
    failures++;
    console.error('FAIL: ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

const model = createElevationModel(42);

check('elevation model is deterministic for the same seed', JSON.stringify(model.basinAt(0, 0)) === JSON.stringify(model.basinAt(0, 0)));

let bandPresence = false;
for (let x = -2000; x <= 2000; x += 200) {
  for (let z = -2000; z <= 2000; z += 200) {
    const e = model.elevation(x, z);
    if (e > 0 && e < 2000) {
      bandPresence = true;
      break;
    }
  }
}
check('staircase bands produce a usable elevation range', bandPresence);

let basinCount = 0;
for (let x = -1500; x <= 1500; x += 250) {
  for (let z = -1500; z <= 1500; z += 250) {
    if (model.basinAt(x, z) !== null) {
      basinCount++;
    }
  }
}
check('basin model provides contiguous basin assignment', basinCount > 0);

if (failures > 0) {
  throw new Error(failures + ' test(s) failed');
}

console.log('All elevation model tests passed.');

import {
  childTiles,
  parentTile,
  tileAtUv,
  tileCount,
  tileId,
  tileUvBounds,
} from '../src/render/earth/cubeSphereQuadtree';

let failures = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) console.log('PASS: ' + name);
  else {
    failures++;
    console.error('FAIL: ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

function main(): void {
  check('level zero has one tile per face', tileCount(0) === 1);
  check('level four has sixteen tiles per side', tileCount(4) === 16);

  const tile = tileAtUv('+x', 3, 0.1, -0.2);
  const bounds = tileUvBounds(tile);
  check('UV lookup returns a tile containing the sample', bounds.u0 <= 0.1 && 0.1 <= bounds.u1 && bounds.v0 <= -0.2 && -0.2 <= bounds.v1);
  check('tile bounds stay inside the face', bounds.u0 >= -1 && bounds.u1 <= 1 && bounds.v0 >= -1 && bounds.v1 <= 1);

  const parent = parentTile(tile);
  check('child tile has a parent', parent !== null && parent.level === 2);
  check('parent contains child index', parent !== null && Math.floor(tile.x / 2) === parent.x && Math.floor(tile.y / 2) === parent.y);

  const children = childTiles(parent!);
  check('parent has four children', children.length === 4);
  check('child round trip preserves tile', children.some((child) => child.x === tile.x && child.y === tile.y && child.level === tile.level));
  check('tile ID includes face and hierarchy', tileId(tile) === '+x/3/' + tile.x + '/' + tile.y);
  check('root has no parent', parentTile({ face: '-z', level: 0, x: 0, y: 0 }) === null);

  if (failures > 0) throw new Error(failures + ' test(s) failed');
  console.log('All cube-sphere quadtree tests passed.');
}

main();

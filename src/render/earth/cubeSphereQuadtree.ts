import { cubeSphereTileId, type CubeFace } from './cubeSphere';

export interface CubeSphereTile {
  face: CubeFace;
  level: number;
  x: number;
  y: number;
}

export interface TileUvBounds {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

export function tileAtUv(face: CubeFace, level: number, u: number, v: number): CubeSphereTile {
  const count = tileCount(level);
  const x = clampTileIndex(Math.floor(((u + 1) * 0.5) * count), count);
  const y = clampTileIndex(Math.floor(((v + 1) * 0.5) * count), count);
  return { face, level, x, y };
}

export function tileUvBounds(tile: CubeSphereTile): TileUvBounds {
  const count = tileCount(tile.level);
  const size = 2 / count;
  return {
    u0: -1 + tile.x * size,
    u1: -1 + (tile.x + 1) * size,
    v0: -1 + tile.y * size,
    v1: -1 + (tile.y + 1) * size,
  };
}

export function parentTile(tile: CubeSphereTile): CubeSphereTile | null {
  if (tile.level === 0) return null;
  return {
    face: tile.face,
    level: tile.level - 1,
    x: Math.floor(tile.x / 2),
    y: Math.floor(tile.y / 2),
  };
}

export function childTiles(tile: CubeSphereTile): CubeSphereTile[] {
  const level = tile.level + 1;
  const x = tile.x * 2;
  const y = tile.y * 2;
  return [
    { face: tile.face, level, x, y },
    { face: tile.face, level, x: x + 1, y },
    { face: tile.face, level, x, y: y + 1 },
    { face: tile.face, level, x: x + 1, y: y + 1 },
  ];
}

export function tileId(tile: CubeSphereTile): string {
  return cubeSphereTileId(tile.face, tile.level, tile.x, tile.y);
}

export function tileCount(level: number): number {
  if (!Number.isInteger(level) || level < 0 || level > 30) {
    throw new RangeError('Cube-sphere level must be an integer from 0 to 30');
  }
  return 2 ** level;
}

function clampTileIndex(value: number, count: number): number {
  return Math.max(0, Math.min(count - 1, value));
}

/**
 * Collision detection and resolution for player-vs-tile queries.
 *
 * Provides AABB-based collision detection against world terrain tiles,
 * including separate-axis resolution for wall sliding and ground following.
 *
 * Architecture: lives in /src/sim/; imports only from /src/types/.
 * Zero Three.js, Babylon.js, or DOM imports.
 */

import type { Vector3D } from '../../types/world';
import type { TerrainTile, WorldChunk } from '../../types/world';
import { IMPASSABLE_TERRAIN, SWIMMABLE_TERRAIN } from '../../types/physics';

const HALF_W = 0.2;
const HALF_H = 0.9;
const HALF_D = 0.2;

export class CollisionResolver {
  resolveMovement(
    currentPos: Vector3D,
    delta: Vector3D,
    chunks: WorldChunk[],
  ): Vector3D {
    if (delta.x === 0 && delta.y === 0 && delta.z === 0) return { ...currentPos };
    const cand = { x: currentPos.x + delta.x, y: currentPos.y + delta.y, z: currentPos.z + delta.z };
    if (!this.testPosition(cand, chunks)) return cand;
    const rx = this.testAxisDelta(currentPos, delta, 'x', chunks);
    const afterX: Vector3D = { x: rx.x, y: currentPos.y, z: currentPos.z };
    const ry = this.testAxisDelta(afterX, delta, 'y', chunks);
    const afterY: Vector3D = { x: afterX.x, y: ry.y, z: afterX.z };
    const rz = this.testAxisDelta(afterY, delta, 'z', chunks);
    return { x: afterY.x, y: afterY.y, z: rz.z };
  }

  private testPosition(pos: Vector3D, chunks: WorldChunk[]): boolean {
    for (const chunk of chunks) if (this.checkTileAtPosition(pos, chunk)) return true;
    return false;
  }

  private testAxisDelta(startPos: Vector3D, delta: Vector3D, axis: 'x'|'y'|'z', chunks: WorldChunk[]): Vector3D {
    if (delta[axis] === 0) return { ...startPos };
    const sign = Math.sign(delta[axis]);
    const maxStep = Math.abs(delta[axis]);
    const stepSize = maxStep / 4;
    let cur = { ...startPos };
    for (let s = 0; s < 4; s++) {
      const prop: Vector3D = { x: cur.x, y: cur.y, z: cur.z };
      prop[axis] = cur[axis] + sign * stepSize;
      if (this.testPosition(prop, chunks)) return cur;
      cur = prop;
    }
    return cur;
  }

  private checkTileAtPosition(pos: Vector3D, chunk: WorldChunk): boolean {
    const tiles = chunk.tiles;
    if (!tiles || tiles.length === 0) return false;
    const cMX = chunk.coordinate.x * 16;
    const cMY = chunk.coordinate.y * 16;
    const cMZ = chunk.coordinate.z * 16;
    const fZ = pos.z - HALF_D, hZ = pos.z + HALF_D;
    const fY = pos.y - HALF_H, hY = pos.y + HALF_H;
    const lX = pos.x - HALF_W, rX = pos.x + HALF_W;
    const checks = [
      [Math.floor(lX-cMX), Math.floor(fY-cMY), Math.floor(fZ-cMZ)],
      [Math.floor(rX-cMX), Math.floor(fY-cMY), Math.floor(fZ-cMZ)],
      [Math.floor(lX-cMX), Math.floor(hY-cMY), Math.floor(hZ-cMZ)],
      [Math.floor(rX-cMX), Math.floor(hY-cMY), Math.floor(hZ-cMZ)],
      [Math.floor(pos.x-cMX), Math.floor((fY+hY)/2-cMY), Math.floor((fZ+hZ)/2-cMZ)],
    ];
    for (const [x,y,z] of checks) {
      const t = this.getTileAt(tiles, x, y, z);
      if (t && this.isImpassable(t, pos)) return true;
    }
    return false;
  }

  private getTileAt(tiles: TerrainTile[][][], x: number, y: number, z: number): TerrainTile|undefined {
    if (x<0||x>=tiles.length||y<0||y>=tiles[0]?.length||z<0||z>=tiles[0][0]?.length) return undefined;
    return tiles[x]?.[y]?.[z];
  }

  private isImpassable(tile: TerrainTile, playerPos: Vector3D): boolean {
    const type = tile.terrainType;
    if (IMPASSABLE_TERRAIN.has(type)) return true;
    if (SWIMMABLE_TERRAIN.has(type)) {
      const feetY = playerPos.y - HALF_H;
      if (tile.elevation > feetY + 0.5) return true;
    }
    return false;
  }

  castRay(origin: Vector3D, direction: Vector3D, chunks: WorldChunk[], maxDist: number = 200): { point: Vector3D; normal: Vector3D; distance: number; hit: boolean } {
    const step = 0.5;
    let t = 0;
    let pos: Vector3D = { ...origin };
    while (t < maxDist) {
      t += step;
      pos = { x: origin.x + direction.x * t, y: origin.y + direction.y * t, z: origin.z + direction.z * t };
      const tile = this.findTileAtPosition(pos, chunks);
      if (tile !== undefined && this.isSolidTile(tile)) return { point: { ...pos }, normal: this.computeNormal(tile), distance: t, hit: true };
    }
    return {
      point: { x: origin.x + direction.x * maxDist, y: origin.y + direction.y * maxDist, z: origin.z + direction.z * maxDist },
      normal: { x: 0, y: 1, z: 0 },
      distance: maxDist,
      hit: false,
    };
  }

  private findTileAtPosition(pos: Vector3D, chunks: WorldChunk[]): TerrainTile|undefined {
    for (const chunk of chunks) {
      if (this.checkTileAtPosition(pos, chunk)) {
        const { tiles } = chunk;
        const cMX = chunk.coordinate.x * 16, cMY = chunk.coordinate.y * 16, cMZ = chunk.coordinate.z * 16;
        const tile = this.getTileAt(tiles, Math.floor(pos.x-cMX), Math.floor(pos.y-cMY), Math.floor(pos.z-cMZ));
        if (tile) return tile;
      }
    }
    return undefined;
  }

  private isSolidTile(tile: TerrainTile): boolean {
    return IMPASSABLE_TERRAIN.has(tile.terrainType) || (tile.elevation > 0 && tile.elevation > 2);
  }

  private computeNormal(tile: TerrainTile): Vector3D {
    return tile.elevation > 0 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
  }
}

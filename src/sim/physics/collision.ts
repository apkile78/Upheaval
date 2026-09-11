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
  /** Scratch vectors to avoid per-call allocations. */
  private scratchCand: Vector3D = { x: 0, y: 0, z: 0 };
  private scratchAfterX: Vector3D = { x: 0, y: 0, z: 0 };
  private scratchAfterY: Vector3D = { x: 0, y: 0, z: 0 };
  private scratchResult: Vector3D = { x: 0, y: 0, z: 0 };

  resolveMovement(
    currentPos: Vector3D,
    delta: Vector3D,
    chunks: WorldChunk[],
  ): Vector3D {
    if (delta.x === 0 && delta.y === 0 && delta.z === 0) {
      const r = this.scratchResult;
      r.x = currentPos.x; r.y = currentPos.y; r.z = currentPos.z;
      return r;
    }
    const cand = this.scratchCand;
    cand.x = currentPos.x + delta.x; cand.y = currentPos.y + delta.y; cand.z = currentPos.z + delta.z;
    if (!this.testPosition(cand, chunks)) return cand;
    const rx = this.testAxisDelta(currentPos, delta, 'x', chunks);
    const afterX = this.scratchAfterX;
    afterX.x = rx.x; afterX.y = currentPos.y; afterX.z = currentPos.z;
    const ry = this.testAxisDelta(afterX, delta, 'y', chunks);
    const afterY = this.scratchAfterY;
    afterY.x = afterX.x; afterY.y = ry.y; afterY.z = afterX.z;
    const rz = this.testAxisDelta(afterY, delta, 'z', chunks);
    const result = this.scratchResult;
    result.x = afterY.x; result.y = afterY.y; result.z = rz.z;
    return result;
  }

  private testPosition(pos: Vector3D, chunks: WorldChunk[]): boolean {
    for (const chunk of chunks) if (this.checkTileAtPosition(pos, chunk)) return true;
    return false;
  }

  /** Scratch for testAxisDelta to avoid per-call allocations. */
  private scratchProp: Vector3D = { x: 0, y: 0, z: 0 };
  private scratchCur: Vector3D = { x: 0, y: 0, z: 0 };
  private scratchReturn: Vector3D = { x: 0, y: 0, z: 0 };

  private testAxisDelta(startPos: Vector3D, delta: Vector3D, axis: 'x'|'y'|'z', chunks: WorldChunk[]): Vector3D {
    if (delta[axis] === 0) {
      const r = this.scratchReturn;
      r.x = startPos.x; r.y = startPos.y; r.z = startPos.z;
      return r;
    }
    const sign = Math.sign(delta[axis]);
    const stepSize = Math.abs(delta[axis]) / 4;
    const cur = this.scratchCur;
    cur.x = startPos.x; cur.y = startPos.y; cur.z = startPos.z;
    const prop = this.scratchProp;
    for (let s = 0; s < 4; s++) {
      prop.x = cur.x; prop.y = cur.y; prop.z = cur.z;
      prop[axis] = cur[axis] + sign * stepSize;
      if (this.testPosition(prop, chunks)) return cur;
      cur.x = prop.x; cur.y = prop.y; cur.z = prop.z;
    }
    return cur;
  }

  /** Pre-allocated check coordinates to avoid per-call array allocation. */
  private checkX: Int32Array = new Int32Array(5);
  private checkY: Int32Array = new Int32Array(5);
  private checkZ: Int32Array = new Int32Array(5);

  private checkTileAtPosition(pos: Vector3D, chunk: WorldChunk): boolean {
    const tiles = chunk.tiles;
    if (!tiles || tiles.length === 0) return false;
    const cMX = chunk.coordinate.x * 16;
    const cMY = chunk.coordinate.y * 16;
    const cMZ = chunk.coordinate.z * 16;
    const fZ = pos.z - HALF_D, hZ = pos.z + HALF_D;
    const fY = pos.y - HALF_H, hY = pos.y + HALF_H;
    const lX = pos.x - HALF_W, rX = pos.x + HALF_W;
    const cx = this.checkX, cy = this.checkY, cz = this.checkZ;
    cx[0] = Math.floor(lX-cMX); cy[0] = Math.floor(fY-cMY); cz[0] = Math.floor(fZ-cMZ);
    cx[1] = Math.floor(rX-cMX); cy[1] = Math.floor(fY-cMY); cz[1] = Math.floor(fZ-cMZ);
    cx[2] = Math.floor(lX-cMX); cy[2] = Math.floor(hY-cMY); cz[2] = Math.floor(hZ-cMZ);
    cx[3] = Math.floor(rX-cMX); cy[3] = Math.floor(hY-cMY); cz[3] = Math.floor(hZ-cMZ);
    cx[4] = Math.floor(pos.x-cMX); cy[4] = Math.floor((fY+hY)/2-cMY); cz[4] = Math.floor((fZ+hZ)/2-cMZ);
    for (let i = 0; i < 5; i++) {
      const t = this.getTileAt(tiles, cx[i], cy[i], cz[i]);
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

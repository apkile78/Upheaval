/**
 * Tile-backed real-Earth elevation source.
 *
 * Elevation lives in a global 1-arc-minute grid split into PNG tiles that are
 * decoded asynchronously (Web Worker) and cached in an LRU. Sampling is a
 * deterministic bilinear interpolation over the global grid; missing tiles
 * make the sampler fall back to the nearest resident cell (chunk generation
 * is deferred via isReady()/requestArea() so play areas are always complete).
 *
 * Architecture: /src/sim/ layer - pure TypeScript, zero rendering imports.
 */

import type { EarthElevationSource, EarthElevMeta } from '../../../types/world';
import { worldToLatLon, clampLatitude } from './earthProjection';
import {
  GRID_COLS,
  GRID_ROWS,
  TILE_PX,
  TILES_X,
  ELEV_OFFSET,
  MAX_RESIDENT_TILES,
} from './earthConfig';

export type TileLoader = (row: number, col: number) => Promise<Int16Array>;

/** Unsigned PNG channel pair -> meters. */
export function decodeCell(r: number, g: number, elevOffset: number = ELEV_OFFSET): number {
  return ((r << 8) | g) - elevOffset;
}

export class ElevationSource implements EarthElevationSource {
  private tiles: Map<number, Int16Array> = new Map();
  private inflight: Map<number, Promise<Int16Array | undefined>> = new Map();
  private stamps: Map<number, number> = new Map();
  private clock = 0;

  constructor(
    private readonly loader: TileLoader,
    private readonly maxTiles: number = MAX_RESIDENT_TILES,
    private readonly meta: EarthElevMeta | null = null,
  ) {}

  private tileKey(row: number, col: number): number {
    return row * TILES_X + col;
  }

  /** Raw grid value at a global cell index, or null when its tile is absent. */
  private cellValue(gx: number, gy: number): number | null {
    if (gy < 0 || gy >= GRID_ROWS) return null;
    const cx = ((gx % GRID_COLS) + GRID_COLS) % GRID_COLS;
    const key = this.tileKey(Math.floor(gy / TILE_PX), Math.floor(cx / TILE_PX));
    const tile = this.tiles.get(key);
    if (tile === undefined) return null;
    this.stamps.set(key, this.clock++);
    return tile[(gy % TILE_PX) * TILE_PX + (cx % TILE_PX)];
  }

  /** Fractional grid coordinates (col space, row space) for a world point. */
  private gridFraction(worldX: number, worldZ: number): { fx: number; fy: number } {
    const { lat, lon } = worldToLatLon(worldX, worldZ);
    const latC = clampLatitude(lat);
    return {
      fx: ((lon + 180) / 360) * GRID_COLS - 0.5,
      fy: ((90 - latC) / 180) * GRID_ROWS - 0.5,
    };
  }

  /** Bilinear surface height (meters) with nearest-resident-cell fallback. */
  sampleHeight(worldX: number, worldZ: number): number {
    const { fx, fy } = this.gridFraction(worldX, worldZ);
    const gx0 = Math.floor(fx);
    const gy0 = Math.floor(fy);
    const gy1 = Math.min(gy0 + 1, GRID_ROWS - 1);
    const tx = Math.max(0, Math.min(1, fx - gx0));
    const ty = Math.max(0, Math.min(1, fy - gy0));

    const v00 = this.cellValue(gx0, gy0);
    const v10 = this.cellValue(gx0 + 1, gy0);
    const v01 = this.cellValue(gx0, gy1);
    const v11 = this.cellValue(gx0 + 1, gy1);

    if (v00 !== null && v10 !== null && v01 !== null && v11 !== null) {
      return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
    }
    // Fallback: nearest resident cell (avoids sampling zero while loading).
    return v00 ?? v10 ?? v01 ?? v11 ?? 0;
  }

  /** Global cell indices covered by a world-space box (tiny boxes assumed). */
  private cellsForBox(minX: number, minZ: number, maxX: number, maxZ: number): { x0: number; x1: number; y0: number; y1: number } {
    const a = this.gridFraction(minX, minZ);
    const b = this.gridFraction(maxX, maxZ);
    const x0 = Math.min(Math.floor(a.fx), Math.floor(b.fx)) - 1;
    const x1 = Math.max(Math.floor(a.fx), Math.floor(b.fx)) + 2;
    const y0 = Math.max(0, Math.min(Math.floor(a.fy), Math.floor(b.fy)) - 1);
    const y1 = Math.min(GRID_ROWS - 1, Math.max(Math.floor(a.fy), Math.floor(b.fy)) + 2);
    return { x0, x1, y0, y1 };
  }

  /** True when every tile overlapping the box (plus a sampling margin) is resident. */
  isReady(minX: number, minZ: number, maxX: number, maxZ: number): boolean {
    const { x0, x1, y0, y1 } = this.cellsForBox(minX, minZ, maxX, maxZ);
    const rowStart = Math.floor(y0 / TILE_PX);
    const rowEnd = Math.floor(y1 / TILE_PX);
    const colStart = Math.floor(x0 / TILE_PX);
    const colEnd = Math.floor(x1 / TILE_PX);
    for (let row = rowStart; row <= rowEnd; row++) {
      for (let colIndex = colStart; colIndex <= colEnd; colIndex++) {
        const col = ((colIndex % TILES_X) + TILES_X) % TILES_X;
        if (!this.tiles.has(this.tileKey(row, col))) return false;
      }
    }
    return true;
  }

  requestArea(minX: number, minZ: number, maxX: number, maxZ: number): void {
    const { x0, x1, y0, y1 } = this.cellsForBox(minX, minZ, maxX, maxZ);
    const rowStart = Math.floor(y0 / TILE_PX);
    const rowEnd = Math.floor(y1 / TILE_PX);
    const colStart = Math.floor(x0 / TILE_PX);
    const colEnd = Math.floor(x1 / TILE_PX);
    for (let row = rowStart; row <= rowEnd; row++) {
      for (let colIndex = colStart; colIndex <= colEnd; colIndex++) {
        const col = ((colIndex % TILES_X) + TILES_X) % TILES_X;
        const key = this.tileKey(row, col);
        if (this.tiles.has(key) || this.inflight.has(key)) continue;
        const promise = this.loader(row, col)
          .then((data) => {
            this.tiles.set(key, data);
            this.stamps.set(key, this.clock++);
            this.evictIfNeeded();
            return data;
          })
          .catch(() => undefined) // failed loads can be retried by later requests
          .finally(() => {
            this.inflight.delete(key);
          });
        this.inflight.set(key, promise);
      }
    }
  }

  /** Resolves once every tile requested so far has arrived (or failed). */
  async waitForArea(): Promise<void> {
    await Promise.allSettled(Array.from(this.inflight.values()));
  }

  private evictIfNeeded(): void {
    while (this.tiles.size > this.maxTiles) {
      let oldestKey = -1;
      let oldestStamp = Infinity;
      for (const [key, stamp] of this.stamps) {
        if (!this.inflight.has(key) && stamp < oldestStamp) {
          oldestStamp = stamp;
          oldestKey = key;
        }
      }
      if (oldestKey < 0) break;
      this.tiles.delete(oldestKey);
      this.stamps.delete(oldestKey);
    }
  }

  cachedTileCount(): number {
    return this.tiles.size;
  }

  /** Asset metadata (null for synthetic test sources). */
  get assetMeta(): EarthElevMeta | null {
    return this.meta;
  }
}

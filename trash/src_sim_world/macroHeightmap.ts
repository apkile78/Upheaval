/**
 * Macro heightmap - coarse, low-resolution terrain sampler.
 *
 * Samples a dedicated low-frequency noise field on a large lattice (every
 * MACRO_CELL_SIZE world units) with bilinear interpolation between lattice
 * points, producing smooth large-scale elevation trends. Used ONLY for
 * large-scale terrain decisions (river tracing, region classification) -
 * never for per-tile chunk generation.
 *
 * A CoastFactorFn may be injected so macro heights decay toward sea level
 * near the ocean, giving river-descents a slope that terminates at the
 * coastline.
 *
 * Architecture: /src/sim/ layer - pure TypeScript, zero rendering imports.
 */

import type { CoastFactorFn } from '../../types/world';
import { SimplexNoise, fbm } from './noise';

/** Lattice spacing in world units (coarse sampling interval). */
export const MACRO_CELL_SIZE = 512;

/** Peak macro elevation in world units (mirrors real East Coast range). */
export const MACRO_MAX_ELEVATION = 2000;

/** Base spatial frequency: features repeat every ~1250 world units. */
const MACRO_FREQUENCY = 0.0008;

/** Octave count - low, so only broad trends survive. */
const MACRO_OCTAVES = 3;

/**
 * Residual coastal elevation floor: even at coast factor 0 (open ocean)
 * a small fraction of the macro height survives, avoiding perfectly flat
 * plateaus that would stall steepest-descent river tracing.
 */
const COAST_FLOOR = 0.05;

export class MacroHeightmap {
  private macroNoise: SimplexNoise;
  private coastFactor: CoastFactorFn | null;
  /** Memoized raw [0, 1] heights at integer lattice points. */
  private latticeCache: Map<string, number> = new Map();

  /**
   * @param seed        - World seed (internally offset by +6000, independent
   *                      of all other noise instances).
   * @param coastFactor - Optional coast gradient (0 = ocean, 1 = inland);
   *                      when provided, macro heights scale with it.
   */
  constructor(seed: number, coastFactor?: CoastFactorFn) {
    this.macroNoise = new SimplexNoise(seed + 6000);
    this.coastFactor = coastFactor ?? null;
  }

  /**
   * Raw normalized height [0, 1] at an integer lattice point.
   * Memoized: repeated river/region queries never re-evaluate noise.
   */
  private rawAt(ix: number, iz: number): number {
    const key = ix + ',' + iz;
    const cached = this.latticeCache.get(key);
    if (cached !== undefined) return cached;

    const worldX = ix * MACRO_CELL_SIZE;
    const worldZ = iz * MACRO_CELL_SIZE;
    const n = fbm(
      this.macroNoise,
      worldX * MACRO_FREQUENCY,
      worldZ * MACRO_FREQUENCY,
      MACRO_OCTAVES,
      2.0,
      0.5,
    );
    let v = (n + 1) / 2;

    if (this.coastFactor !== null) {
      const cf = this.coastFactor(worldX, worldZ);
      v *= COAST_FLOOR + (1 - COAST_FLOOR) * cf;
    }

    this.latticeCache.set(key, v);
    return v;
  }

  /**
   * Coarse height at a world coordinate: bilinear interpolation across the
   * 4 surrounding lattice points, scaled to MACRO_MAX_ELEVATION.
   */
  sampleHeight(worldX: number, worldZ: number): number {
    const fx = worldX / MACRO_CELL_SIZE;
    const fz = worldZ / MACRO_CELL_SIZE;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;

    const h00 = this.rawAt(ix, iz);
    const h10 = this.rawAt(ix + 1, iz);
    const h01 = this.rawAt(ix, iz + 1);
    const h11 = this.rawAt(ix + 1, iz + 1);

    const h0 = h00 * (1 - tx) + h10 * tx;
    const h1 = h01 * (1 - tx) + h11 * tx;
    return (h0 * (1 - tz) + h1 * tz) * MACRO_MAX_ELEVATION;
  }

  /** Number of memoized lattice points (cache-growth diagnostics). */
  get cachedPointCount(): number {
    return this.latticeCache.size;
  }

  /** Drop all memoized lattice heights (memory management hook). */
  clearCache(): void {
    this.latticeCache.clear();
  }
}

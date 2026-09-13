/**
 * River generation - deterministic steepest-descent river tracing.
 *
 * Selects seeded source points in the inland highlands, then walks each
 * downhill on the macro heightmap (Step 6.3) until the coastline is reached
 * (coast factor below the ocean threshold, Step 6.2). Paths are stored as
 * reusable RiverPath arrays and bucketed spatially so chunk generation can
 * query only the rivers near a chunk's bounds.
 *
 * Architecture: /src/sim/ layer - pure TypeScript, zero rendering imports.
 */

import type { CoastFactorFn, RiverPath, Vector3D } from '../../types/world';
import { MacroHeightmap } from './macroHeightmap';

/** Number of rivers traced per world. */
const RIVER_COUNT = 12;
/** Full river corridor width in world units. */
export const RIVER_WIDTH = 6;
/** Steepest-descent step length in world units. */
const DESCENT_STEP = 64;
/** Hard cap on descent iterations per river. */
const MAX_DESCENT_STEPS = 2000;
/** Sources must be well inland (coast factor above this). */
const INLAND_MIN_CF = 0.5;
/** Rivers terminate once the coast factor drops below this (open ocean). */
const OCEAN_CF = 0.12;
/** Sources must start this high on the macro heightmap (world units). */
const SOURCE_HEIGHT_MIN = 900;
/** Minimum spacing between river sources (world units). */
const MIN_SOURCE_SPACING = 1200;
/** Z half-extent of the random source candidate zone (world units). */
const WORLD_EXTENT = 9000;
/**
 * Source X range (world units): the continent's inland band. Rivers spawn
 * here so they can actually cross the narrow coastal gradient (x ~ 50-450)
 * and reach the ocean instead of wandering on the interior plateau.
 */
const SOURCE_X_MIN = 300;
const SOURCE_X_MAX = 3000;
/** Bounded attempt budget for source selection (keeps generate() finite). */
const MAX_SELECT_ATTEMPTS = 20000;
/** Coast-factor weight in descent energy; dominates the coastal band. */
const OCEAN_PULL = 1200;
/** Eastward x-bias for the interior plateau (cf saturates at 1 there). */
const X_PULL = 2.0;
/** Consecutive stall iterations tolerated before a descent gives up. */
const MAX_STALL = 12;
/** Spatial bucket size for river point indexing (world units). */
const BUCKET_SIZE = 256;
/** Query padding so segments crossing a chunk edge are always found. */
export const RIVER_QUERY_PAD = DESCENT_STEP * 2;

/** Integer bucket coordinate key. */
function bucketKey(bx: number, bz: number): string {
  return bx + ',' + bz;
}

export class RiverGenerator {
  private macro: MacroHeightmap;
  private coastFactor: CoastFactorFn;
  private landmask: ((worldX: number, worldZ: number) => number) | null;
  private rngState: number;
  private rivers: RiverPath[] = [];
  private buckets: Map<string, Vector3D[]> = new Map();
  private generated = false;

  /**
   * @param seed        - World seed (RNG state is derived, noise lives in
   *                      the injected MacroHeightmap).
   * @param macro       - Coarse height sampler for descent tracing.
   * @param coastFactor - Coast gradient (0 = ocean, 1 = far inland).
   */
  constructor(
    seed: number,
    macro: MacroHeightmap,
    coastFactor: CoastFactorFn,
    landmask?: (worldX: number, worldZ: number) => number,
  ) {
    this.macro = macro;
    this.coastFactor = coastFactor;
    this.landmask = landmask ?? null;
    this.rngState = (seed ^ 0x9e3779b9) >>> 0;
  }

  /** Deterministic LCG step shared with the project's noise seeding. */
  private nextRandom(): number {
    this.rngState = (this.rngState * 1664525 + 1013904223) >>> 0;
    return this.rngState / 4294967296;
  }

  /**
   * Trace all rivers. Idempotent: only the first call does work; all later
   * calls see the cached path set.
   */
  generate(): void {
    if (this.generated) return;
    this.generated = true;

    const sources: Vector3D[] = [];
    let attempts = 0;
    while (sources.length < RIVER_COUNT && attempts < MAX_SELECT_ATTEMPTS) {
      attempts++;
      const wx = SOURCE_X_MIN + this.nextRandom() * (SOURCE_X_MAX - SOURCE_X_MIN);
      const wz = (this.nextRandom() * 2 - 1) * WORLD_EXTENT;
      if (this.coastFactor(wx, wz) < INLAND_MIN_CF) continue;
      if (this.landmask !== null && this.landmask(wx, wz) < 0.6) continue;
      if (this.macro.sampleHeight(wx, wz) < SOURCE_HEIGHT_MIN) continue;
      let tooClose = false;
      for (const s of sources) {
        if (Math.sqrt((s.x - wx) * (s.x - wx) + (s.z - wz) * (s.z - wz)) < MIN_SOURCE_SPACING) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      sources.push({ x: wx, y: 0, z: wz });
    }

    for (const src of sources) {
      const river = this.traceRiver(src);
      if (river.points.length >= 2) this.registerRiver(river);
    }
  }

  /** Steepest-descent walk from a source to the coastline. */
  private traceRiver(source: Vector3D): RiverPath {
    const points: Vector3D[] = [];
    let x = source.x;
    let z = source.z;
    let h = this.macro.sampleHeight(x, z);
    points.push({ x, y: h, z });

    // Energy = height + coast pull + x-bias; plateau escapes keep the walk moving.
    const energyAt = (px: number, pz: number): number =>
      this.macro.sampleHeight(px, pz) +
      this.coastFactor(px, pz) * OCEAN_PULL +
      px * X_PULL;

    let curEnergy = energyAt(x, z);
    let stalled = 0;
    let prevX = x;
    let prevZ = z;
    for (let i = 0; i < MAX_DESCENT_STEPS; i++) {
      if (this.landmask !== null && this.landmask(x, z) < 0.05) break;
      if (this.coastFactor(x, z) < OCEAN_CF) break;

      let bestX = x;
      let bestZ = z;
      let bestEnergy = curEnergy;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dz === 0) continue;
          const nx = x + dx * DESCENT_STEP;
          const nz = z + dz * DESCENT_STEP;
          if (nx === prevX && nz === prevZ) continue;
          const e = energyAt(nx, nz);
          if (e < bestEnergy) {
            bestEnergy = e;
            bestX = nx;
            bestZ = nz;
          }
        }
      }

      if (bestEnergy < curEnergy - 0.01) {
        prevX = x;
        prevZ = z;
        x = bestX;
        z = bestZ;
        h = this.macro.sampleHeight(x, z);
        curEnergy = bestEnergy;
        points.push({ x, y: h, z });
        stalled = 0;
      } else {
        stalled++;
        if (stalled >= MAX_STALL) {
          // Plateau escape: best non-backtracking neighbor, even if worse.
          let eX = x;
          let eZ = z;
          let eBest = Infinity;
          for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
              if (dx === 0 && dz === 0) continue;
              const nx = x + dx * DESCENT_STEP;
              const nz = z + dz * DESCENT_STEP;
              if (nx === prevX && nz === prevZ) continue;
              const e = energyAt(nx, nz);
              if (e < eBest) {
                eBest = e;
                eX = nx;
                eZ = nz;
              }
            }
          }
          prevX = x;
          prevZ = z;
          x = eX;
          z = eZ;
          h = this.macro.sampleHeight(x, z);
          curEnergy = eBest;
          points.push({ x, y: h, z });
          stalled = 0;
        }
      }
    }

    return { points, width: RIVER_WIDTH };
  }

  /** Index a river's points into spatial buckets for fast chunk queries. */
  private registerRiver(river: RiverPath): void {
    this.rivers.push(river);
    for (const p of river.points) {
      const key = bucketKey(Math.floor(p.x / BUCKET_SIZE), Math.floor(p.z / BUCKET_SIZE));
      let cell = this.buckets.get(key);
      if (!cell) {
        cell = [];
        this.buckets.set(key, cell);
      }
      cell.push(p);
    }
  }

  /** All traced rivers (ordered by source selection). */
  getRivers(): RiverPath[] {
    return this.rivers;
  }

  /**
   * River points near an axis-aligned world-space box. Consecutive points
   * are at most DESCENT_STEP apart, so a RIVER_QUERY_PAD margin guarantees
   * every segment intersecting the box has both endpoints included.
   */
  getRiverPointsNear(minX: number, minZ: number, maxX: number, maxZ: number): Vector3D[] {
    const out: Vector3D[] = [];
    const seen = new Set<Vector3D>();
    const bx0 = Math.floor((minX - RIVER_QUERY_PAD) / BUCKET_SIZE);
    const bx1 = Math.floor((maxX + RIVER_QUERY_PAD) / BUCKET_SIZE);
    const bz0 = Math.floor((minZ - RIVER_QUERY_PAD) / BUCKET_SIZE);
    const bz1 = Math.floor((maxZ + RIVER_QUERY_PAD) / BUCKET_SIZE);
    for (let bx = bx0; bx <= bx1; bx++) {
      for (let bz = bz0; bz <= bz1; bz++) {
        const cell = this.buckets.get(bucketKey(bx, bz));
        if (!cell) continue;
        for (const p of cell) {
          if (!seen.has(p)) {
            seen.add(p);
            out.push(p);
          }
        }
      }
    }
    return out;
  }
}

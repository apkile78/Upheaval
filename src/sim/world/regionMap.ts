/**
 * Procedural region classification (Step 6.5).
 *
 * Classifies world locations into RegionArchetypes using coarse signals:
 * macro-heightmap neighborhood sampling (elevation variance + valley
 * patterns), distance-to-coast (meandering coast factor, Step 6.2), river
 * proximity (traced paths, Step 6.4), and a dedicated blending noise field
 * (seed +8000) for natural variation at archetype boundaries.
 *
 * Results are memoized per macro-cell so repeated queries in the same area
 * never re-run full classification.
 *
 * Architecture: /src/sim/ layer - pure TypeScript, zero rendering imports.
 */

import type { CoastFactorFn, RegionArchetype, RegionBiases, Vector3D } from '../../types/world';
import { SimplexNoise, fbm } from './noise';
import { MacroHeightmap, MACRO_CELL_SIZE } from './macroHeightmap';
import { distToSegment } from './riverCarve';

/** Per-archetype generation biases. Biases nudge noise, never override it. */
export const REGION_BIASES: Record<RegionArchetype, RegionBiases> = {
  coastal_bay:    { elevationBias: -0.30, moistureBias: +0.20, vegetationBias: +0.20 },
  river_valley:   { elevationBias: -0.15, moistureBias: +0.30, vegetationBias: +0.35 },
  upland_plain:   { elevationBias:  0.00, moistureBias:  0.00, vegetationBias: +0.05 },
  ridge_highland: { elevationBias: +0.20, moistureBias: -0.10, vegetationBias: -0.15 },
  coastal_plain:  { elevationBias: -0.05, moistureBias: +0.10, vegetationBias: +0.15 },
};

/** Minimal structural contract for river proximity lookups (RiverGenerator). */
interface RiverPointSource {
  getRiverPointsNear(minX: number, minZ: number, maxX: number, maxZ: number): Vector3D[];
}

/** Neighborhood sample radius around a classification point (world units). */
const NEIGHBORHOOD_RADIUS = MACRO_CELL_SIZE / 2;
/** Blend-noise spatial frequency (boundary variation). */
const BLEND_FREQUENCY = 0.002;
/** Points below this macro elevation in the coastal zone are bays. */
const BAY_ELEVATION = 250;
/** Blend-noise swing applied to classification thresholds. */
const BLEND_SWING = 150;
/** Above this macro elevation (plus blend) is highland. */
const HIGHLAND_ELEVATION = 1100;
/** Above this local elevation variance is ridged highland. */
const HIGHLAND_VARIANCE = 500;
/** Coast factors below this are open-ocean/bay territory. */
const COASTAL_ZONE_CF = 0.5;
/** Center must sit this far below both flanks to count as a valley. */
const VALLEY_DEPTH = 120;
/** River proximity radius for river_valley classification (world units). */
const RIVER_VALLEY_RADIUS = 150;

export class RegionMap {
  private macro: MacroHeightmap;
  private coastFactor: CoastFactorFn;
  private rivers: RiverPointSource | null;
  private blendNoise: SimplexNoise;
  /** Memoized archetype per macro-cell ("cx,cz" -> archetype). */
  private cache: Map<string, RegionArchetype> = new Map();

  /**
   * @param seed        - World seed (blend noise offset +8000, independent
   *                      of every other noise field).
   * @param macro       - Coarse height sampler (Step 6.3).
   * @param coastFactor - Meandering coast gradient (Step 6.2).
   * @param rivers      - Optional traced-river provider (Step 6.4).
   */
  constructor(
    seed: number,
    macro: MacroHeightmap,
    coastFactor: CoastFactorFn,
    rivers?: RiverPointSource,
  ) {
    this.macro = macro;
    this.coastFactor = coastFactor;
    this.rivers = rivers ?? null;
    this.blendNoise = new SimplexNoise(seed + 8000);
  }

  /** Dedicated blending noise, roughly [-1, 1]. */
  private blend(worldX: number, worldZ: number): number {
    return fbm(this.blendNoise, worldX * BLEND_FREQUENCY, worldZ * BLEND_FREQUENCY, 2, 2.0, 0.5);
  }

  /**
   * Sample the macro heightmap around a point; return center height,
   * max-min neighborhood variance, and valley flags for the x/z axes.
   */
  private sampleNeighborhood(worldX: number, worldZ: number): {
    center: number;
    variance: number;
    valleyX: boolean;
    valleyZ: boolean;
  } {
    const c = this.macro.sampleHeight(worldX, worldZ);
    let hMin = c;
    let hMax = c;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const h = this.macro.sampleHeight(
        worldX + Math.cos(ang) * NEIGHBORHOOD_RADIUS,
        worldZ + Math.sin(ang) * NEIGHBORHOOD_RADIUS,
      );
      if (h < hMin) hMin = h;
      if (h > hMax) hMax = h;
    }
    const r = NEIGHBORHOOD_RADIUS;
    const west = this.macro.sampleHeight(worldX - r, worldZ);
    const east = this.macro.sampleHeight(worldX + r, worldZ);
    const north = this.macro.sampleHeight(worldX, worldZ - r);
    const south = this.macro.sampleHeight(worldX, worldZ + r);
    return {
      center: c,
      variance: hMax - hMin,
      valleyX: c < west - VALLEY_DEPTH && c < east - VALLEY_DEPTH,
      valleyZ: c < north - VALLEY_DEPTH && c < south - VALLEY_DEPTH,
    };
  }

  /** True when a traced river passes within RIVER_VALLEY_RADIUS of the point. */
  private nearRiver(worldX: number, worldZ: number): boolean {
    if (this.rivers === null) return false;
    const pad = RIVER_VALLEY_RADIUS * 2;
    const pts = this.rivers.getRiverPointsNear(worldX - pad, worldZ - pad, worldX + pad, worldZ + pad);
    for (let i = 0; i < pts.length - 1; i++) {
      if (distToSegment(worldX, worldZ, pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z) < RIVER_VALLEY_RADIUS) {
        return true;
      }
    }
    return false;
  }

  /**
   * Full classification for a point. Deterministic decision tree combining
   * coast distance, neighborhood variance/valleys, river proximity, and the
   * blending noise (which swings thresholds for organic boundaries).
   */
  classifyRegion(worldX: number, worldZ: number): RegionArchetype {
    const cf = this.coastFactor(worldX, worldZ);
    const n = this.sampleNeighborhood(worldX, worldZ);
    const blend = this.blend(worldX, worldZ);

    // Coastal zone: bays are low-lying, coastal plains sit higher.
    if (cf < COASTAL_ZONE_CF) {
      const bayThreshold = BAY_ELEVATION + blend * BLEND_SWING;
      return n.center < bayThreshold ? 'coastal_bay' : 'coastal_plain';
    }

    // Inland: river proximity or a valley pattern yields river valleys.
    if (this.nearRiver(worldX, worldZ)) return 'river_valley';
    if (n.valleyX || n.valleyZ) return 'river_valley';

    // High macro elevation or high local relief is highland.
    const highlandThreshold = HIGHLAND_ELEVATION + blend * BLEND_SWING;
    if (n.center > highlandThreshold || n.variance > HIGHLAND_VARIANCE + blend * BLEND_SWING) {
      return 'ridge_highland';
    }
    return 'upland_plain';
  }

  /**
   * Public query: region archetype at a world coordinate, memoized per
   * macro-cell so repeated queries never re-run full classification.
   */
  getRegionAt(worldX: number, worldZ: number): RegionArchetype {
    const key = Math.floor(worldX / MACRO_CELL_SIZE) + ',' + Math.floor(worldZ / MACRO_CELL_SIZE);
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const region = this.classifyRegion(worldX, worldZ);
    this.cache.set(key, region);
    return region;
  }

  /** Convenience: biases for the region at a world coordinate. */
  getBiasesAt(worldX: number, worldZ: number): RegionBiases {
    return REGION_BIASES[this.getRegionAt(worldX, worldZ)];
  }

  /** Number of memoized macro-cells (diagnostics). */
  get cachedCellCount(): number {
    return this.cache.size;
  }

  /** Drop all memoized classifications. */
  clearCache(): void {
    this.cache.clear();
  }
}

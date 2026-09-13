/**
 * East Coast biome evaluation using real geological parameters.
 * Combines region-based elevation with moisture for biome selection.
 *
 * Architecture: /src/sim/ layer — no rendering imports.
 */

import type { RegionBiases, TileTerrainType } from '../../types/world';
import { createBasinModel, basinStaircase } from './basinModel';
import { createContinentModel } from './continentModel';
import { SimplexNoise, fbm, ridged, domainWarp, CoastPerturbationNoise, MAX_MOUNTAIN_ELEVATION, RIDGE_COAST_STEEPNESS, ELEVATION_SCALE, BASE_TERRAIN_WEIGHT, RIDGE_TERRAIN_WEIGHT, DETAIL_TERRAIN_WEIGHT, RIDGE_ELEVATION_EXPONENT, RIDGE_INLAND_START_X, RIDGE_INLAND_RAMP_X } from './noise';

export interface BiomeInfo {
  type: TileTerrainType;
  elevation: number;
  moisture: number;
}

/**
 * Max lateral displacement (world units) of the coastline boundary from the
 * coastline perturbation noise (Step 6.1/6.2). Scaled by the roughly [-1, 1]
 * meander offset, this yields capes and bays up to +/-60 units deep instead
 * of a straight vertical coast line.
 */
const MEANDER_AMPLITUDE = 60;

/** World X of the ideal (pre-meander) coastline boundary. */
const COAST_EDGE_X = 50;
/** Width of the coastal baseline ramp, in world units. */
const BASELINE_RAMP_WIDTH = 150;
/**
 * Peak coastal baseline elevation (world units). A separate baseline term
 * ramping from -COASTAL_BASELINE_MAX in open ocean to +COASTAL_BASELINE_MAX
 * inland keeps flat coastal-plain areas reliably above sea level, so water
 * only appears at the true coastline edge or in genuinely low-lying spots
 * (river mouths, swamp pockets) - not randomly wherever the zero-centered
 * elevation noise happens to dip negative.
 */
const COASTAL_BASELINE_MAX = 6;

// Real East Coast biome colors for rendering
export const BIOME_COLORS: Record<TileTerrainType, number> = {
  water:    0x1a5276,  // Deep ocean blue
  grass:    0x4a7c3f,  // Coastal green
  dirt:     0x8b5e3c,  // Piedmont red clay
  stone:    0x6b7b6b,  // Appalachian grey
  sand:     0xc2b280,  // Beach tan
  forest:   0x1e4a1e,  // Deep forest green
  mountain: 0x5a6b5a,  // Mountain rock
  road:     0x4a4a4a,  // Asphalt grey
  building: 0x8a7a6a,  // Building brown
  swamp:    0x3d5c3a,  // Marsh dark green
  snow:     0xe8e8f0,  // Snow white
  metal:    0x7a7a8a,  // Metal grey
};

export class BiomeManager {
  private elevationNoise: SimplexNoise;
  private ridgeNoise: SimplexNoise;
  private moistureNoise: SimplexNoise;
  private warpNoise: SimplexNoise;
  private detailNoise: SimplexNoise;
  private coastPerturbation: CoastPerturbationNoise;
  private continentModel: ReturnType<typeof createContinentModel>;
  private basinModel: ReturnType<typeof createBasinModel>;
  /** Optional region-bias provider (Step 6.6); null = unbiased generation. */
  private regionProvider: ((worldX: number, worldZ: number) => RegionBiases) | null = null;

  constructor(seed: number) {
    this.elevationNoise = new SimplexNoise(seed);
    this.ridgeNoise = new SimplexNoise(seed + 1000);
    this.moistureNoise = new SimplexNoise(seed + 2000);
    this.warpNoise = new SimplexNoise(seed + 3000);
    this.detailNoise = new SimplexNoise(seed + 4000);
    this.coastPerturbation = new CoastPerturbationNoise(seed);
    this.continentModel = createContinentModel(seed);
    this.basinModel = createBasinModel(this.continentModel.profile);
  }

  /**
   * Register a region-bias provider (Step 6.6). Biases NUDGE the base noise
   * output - never override it: elevation scales by (1 + elevationBias),
   * moisture shifts additively (clamped to [0, 1]). Pass null to disable.
   */
  setRegionProvider(provider: ((worldX: number, worldZ: number) => RegionBiases) | null): void {
    this.regionProvider = provider;
  }

  /** Get biome + elevation at a world coordinate. */
  getBiome(worldX: number, worldZ: number): BiomeInfo {
    const elevation = this.getElevation(worldX, worldZ);
    const moisture = this.getMoisture(worldX, worldZ);
    const type = this.classifyBiome(elevation, moisture);
    return { type, elevation, moisture };
  }

  /** Get the nearest procedural basin for a world coordinate. */
  getBasinAt(worldX: number, worldZ: number) {
    return this.basinModel.basinAt(worldX, worldZ);
  }

  /** Seed-generated landmask for the current continent profile. */
  getLandmask(worldX: number, worldZ: number): number {
    return this.continentModel.landmask(worldX, worldZ);
  }

  /** Get terrain surface elevation (Y height) at a world coordinate. */
  getElevation(worldX: number, worldZ: number): number {
    // Domain warp for organic shapes
    const [wx, wz] = domainWarp(this.warpNoise, worldX * 0.005, worldZ * 0.005, 2.0);

    // Base terrain: FBM for rolling hills
    const baseFbm = fbm(this.elevationNoise, wx, wz, 4, 2.0, 0.5);

    // Ridge noise for Appalachian mountains: LOW base frequency (massif
    // wavelength ~800 units) with 4 octaves, so the fractal layers peaks and
    // crags onto a broad massif with foothills instead of a narrow mohawk.
    // Full fractal (massif + crags) is rendered as terrain *texture*, but
    // AMPLITUDE comes from the massif octave alone: genuine massifs reach
    // stone/snow, craggy-but-flat ground stays forest/farmland. (SAMPLE=1.)
    const ridge = ridged(this.ridgeNoise, wx * 0.25, wz * 0.25, 1, 2.0, 0.5);

    // Distance from coast (east = low, west = high)
    const coastFactor = this.getCoastFactor(worldX, worldZ);

    // Ridge coast falloff is STEEPER than the base rolling-hill terrain,
    // so full-height mountain massifs are suppressed near the coastline and
    // a clear foothill buffer develops between flat coast and real mountains.
    // Effective ridge amplitude falloff ~ coastFactor^RIDGE_COAST_STEEPNESS
    // vs the base FBM terrain's coastFactor^1.
    // Inland gate: ridge is illegal on the coastal plain / foothills.
    // Computed from the same meander-adjusted effective X as the coast
    // factor, so bays and peninsulas gate ridge at the same true shoreline.
    const meanderGate = this.coastPerturbation.getOffset(worldX, worldZ);
    const effectiveGateX = worldX - meanderGate * MEANDER_AMPLITUDE;
    const gateT = Math.max(0, Math.min(1, (effectiveGateX - RIDGE_INLAND_START_X) / RIDGE_INLAND_RAMP_X));
    const inlandGate = gateT * gateT * (3 - 2 * gateT);
    // Combine inland gate with coast-amplitude falloff: double security that
    // ridge energy is zero anywhere near the coast, even under meander swings.
    const ridgeScaled = ridge * inlandGate * Math.pow(coastFactor, RIDGE_COAST_STEEPNESS);

    // Combine base + ridge + detail, BEFORE scaling by coast factor so that
    // the coastal baseline (added next) is not suppressed near the coastline.
    // Power curve: massif crests (ridge ~= 1) keep full amplitude while
    // mid-slope ridge values are pushed down, so valleys stay grass/forest
    // and only true crests reach stone/snow.
    const ridgeShaped = Math.pow(Math.max(0, Math.min(1, ridgeScaled)), RIDGE_ELEVATION_EXPONENT);
    let elevation = baseFbm * BASE_TERRAIN_WEIGHT + ridgeShaped * RIDGE_TERRAIN_WEIGHT + fbm(this.detailNoise, worldX * 0.02, worldZ * 0.02, 2, 2.0, 0.5) * DETAIL_TERRAIN_WEIGHT;

    // Coastal baseline is signed: negative offshore (sea floor) and positive
    // inland (coastal plain lift), following the same meander-adjusted edge
    // as the coast factor.
    elevation += this.getCoastalBaseline(worldX, worldZ);

    // Scale to world units, with coast factor applied last (so ocean stays calm
    // and the baseline lifts real terrain but not open-ocean speckle meaningfully).
    let elevationScaled = elevation * coastFactor * ELEVATION_SCALE;

    // Phase 1 landmask: the seed-generated continent envelope keeps interior
    // terrain land-locked while preserving ocean below sea level outside the
    // seeded continent footprints. Only the deep interior is forced to land;
    // the raw coastal/ocean baseline remains intact so the old open-water tests
    // still describe the correct sea behavior.
    const landmask = this.continentModel.landmask(worldX, worldZ);
    if (landmask > 0.85 && elevationScaled < 0) {
      elevationScaled = 0;
    }

    // Phase 2 basin staircase: apply a small, bounded basin baseline in the
    // interior so the terrain follows seeded basin structure without
    // overriding the existing coastline / ridge machinery.
    const basin = this.basinModel.basinAt(worldX, worldZ);
    if (basin !== null) {
      const basinBase = basinStaircase(worldX, worldZ, basin, this.continentModel.landmask);
      const inlandBlend = Math.max(0, 1 - coastFactor);
      elevationScaled += basinBase * inlandBlend * 0.15;
    }

    // Region bias (Step 6.6): multiplicative nudge, deterministic per seed.
    if (this.regionProvider !== null) {
      elevationScaled *= 1 + this.regionProvider(worldX, worldZ).elevationBias;
    }

    // Clamp to the hard mountain ceiling LAST, after region bias, so the final
    // elevation never exceeds MAX_MOUNTAIN_ELEVATION regardless of octave count
    // or region bias. (MAX_MOUNTAIN_ELEVATION is exported from noise.)
    if (elevationScaled > MAX_MOUNTAIN_ELEVATION) {
      elevationScaled = MAX_MOUNTAIN_ELEVATION;
    }

    return elevationScaled;
  }

  /** Get moisture level (0-1) at a world coordinate. */
  private getMoisture(worldX: number, worldZ: number): number {
    const m = fbm(this.moistureNoise, worldX * 0.008, worldZ * 0.008, 3, 2.0, 0.5);
    let moisture = (m + 1) / 2; // Normalize to 0-1

    // Region bias (Step 6.6): additive nudge, clamped to [0, 1].
    if (this.regionProvider !== null) {
      moisture = Math.max(0, Math.min(1, moisture + this.regionProvider(worldX, worldZ).moistureBias));
    }
    return moisture;
  }

  /**
   * Coastal baseline elevation (pre-scale units, +/-COASTAL_BASELINE_MAX/100 = +/-0.06):
   * ramps across the true coastline edge using the same meander offset as
   * getCoastFactor, so the baseline follows the meandering coast exactly.
   */
  private getCoastalBaseline(worldX: number, worldZ: number): number {
    const meander = this.coastPerturbation.getOffset(worldX, worldZ);
    const effectiveX = worldX - meander * MEANDER_AMPLITUDE;
    const t = Math.max(-1, Math.min(1, (effectiveX - COAST_EDGE_X) / BASELINE_RAMP_WIDTH));
    // Asymmetric ramp: full-strength sea floor offshore (ocean MUST stay wet),
    // but only a third of the lift inland so the plain boost does not inflate
    // inland medians on the recalibrated scale. Position still follows
    // the meandering coast exactly via effectiveX.
    const k = t < 0 ? 2.0 : 1 / 3;
    return ((COASTAL_BASELINE_MAX / 100) * t * k);
  }

  /**
   * Coast factor: east (ocean) = 0, west (mountains) = 1.
   *
   * The straight west-to-east gradient is preserved; the coastline boundary
   * is meandered along the Z axis by the dedicated perturbation noise (Step
   * 6.1), displacing the effective worldX where the gradient begins. This
   * produces bays and peninsulas instead of a vertical straight coast.
   *
   * Public: river tracing and region classification consume this to know
   * how far inland/out to sea a given point sits.
   */
  getCoastFactor(worldX: number, worldZ: number): number {
    // Meander offset (approx [-1, 1]) scaled to world units, then applied
    // as a lateral displacement of the coastline boundary in X.
    const meander = this.coastPerturbation.getOffset(worldX, worldZ);
    const effectiveX = worldX - meander * MEANDER_AMPLITUDE;

    // East coast at worldX ~ 0-50, mountains at 500-800
    const normalized = Math.max(0, Math.min(1, (effectiveX - 50) / 400));
    // Smoothstep for gradual transition, with minimum 0.05 for gentle coastal variation
    const base = normalized * normalized * (3 - 2 * normalized);
    return Math.max(0.05, base);
  }

  /** Classify biome based on elevation and moisture. */
  private classifyBiome(elevation: number, moisture: number): TileTerrainType {
    if (elevation < 0) return 'water';
    if (elevation < 2) return moisture > 0.5 ? 'swamp' : 'sand';
    if (elevation < 10) return moisture > 0.6 ? 'swamp' : 'grass';
    if (elevation < 50) return moisture > 0.5 ? 'forest' : 'grass';
    if (elevation < 150) return 'forest';
    if (elevation < 400) return moisture > 0.4 ? 'forest' : 'dirt';
    if (elevation < 800) return 'forest';
    if (elevation < 1200) return 'mountain';
    if (elevation < 1800) return 'stone';
    return 'snow';
  }

  /** Get tile type at a specific world Y (for underground layers). */
  getTileType(worldY: number, surfaceElevation: number): TileTerrainType {
    if (worldY > surfaceElevation) return 'grass'; // Air/above
    if (worldY === surfaceElevation) return this.classifyBiome(surfaceElevation, 0.5);
    if (worldY >= surfaceElevation - 3) return 'dirt';
    return 'stone';
  }
}

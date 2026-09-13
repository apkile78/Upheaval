/**
 * Seeded Simplex Noise with FBM, ridge noise, and domain warping.
 * Zero-dependency, pure TypeScript.
 *
 * Architecture: /src/sim/ layer — no rendering imports.
 */

// ---------------------------------------------------------------------------
// Ridge shaping constants (Step 6 tuning - exposed for by-eye adjustment)
// ---------------------------------------------------------------------------

/** Exponent on |noise| for the low-frequency massif octave (1 - m^E). */
export const RIDGE_MASSIF_EXPONENT = 2.0;

/**
 * Exponent on (1 - |noise|) for high-frequency crag octaves. Lower than 2
 * rounds off summit tops (widens the near-peak zone) while the massif
 * octave keeps the broad/foothill shape. Tunable: 2.0 = sharp spires,
 * ~1.3 = rounded summits.
 */
export const RIDGE_CRAG_EXPONENT = 1.3;

/**
 * Relative amplitude weight of the massif octave versus the fractal gain,
 * so peaks read as rounded summits on a broad base rather than spires.
 */
export const RIDGE_MASSIF_WEIGHT = 1.15;

/**
 * Absolute ceiling on the combined ridge signal (before it is scaled by
 * the coast factor). Clamps stacked-octave ridge massifs so their peak
 * never exceeds the realistic mountain bands defined in the biome table.
 */
export const MAX_MOUNTAIN_ELEVATION = 2200;
/**
 * Ridge coast steepness: the ridge massif is suppressed faster than the
 * base rolling-hill terrain near the coastline, so a clear foothill buffer
 * zone (-> flat coast -> foothills -> real mountains) develops.
 * Effective ridge amplitude falloff ~ coastFactor^RIDGE_COAST_STEEPNESS
 * vs the base FBM terrain ~ coastFactor^1.
 */
export const RIDGE_COAST_STEEPNESS = 2.0;

/** Final world-unit scale for elevation (recalibrated so genuine ridge
 *  crests reach the stone/snow biome bands at full inland coast factor).
 */
export const ELEVATION_SCALE = 2000;

/** Weight of base FBM rolling-hill terrain in the elevation combine. */
export const BASE_TERRAIN_WEIGHT = 0.15;

/** Weight of the ridge massif in the elevation combine (dominant term). */
export const RIDGE_TERRAIN_WEIGHT = 1.0;

/** Weight of high-frequency detail noise in the elevation combine. */
export const DETAIL_TERRAIN_WEIGHT = 0.03;

/** Inland X where ridge massifs may begin (~city of foothill buffer end).
 *  Below this effective longitude (meander-adjusted), ridge amplitude is
 *  forced to zero, guaranteeing no high country reaches the coastal plain
 *  regardless of meander or octave stacking.
 */
export const RIDGE_INLAND_START_X = 550;

/** Ramp width of the ridge inland gate (smoothstep over this distance).
 *  Keeps the transition legal without seams when the gate is active.
 */
export const RIDGE_INLAND_RAMP_X = 250;

/** Power curve on the 0..1 ridge signal before weighting: suppresses
 *  mid-slope ridge values so only true massif crests reach stone/snow,
 *  while valleys stay in grass/forest. Must stay > 1.
 */
export const RIDGE_ELEVATION_EXPONENT = 12.0;

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

const GRAD2 = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [-1, 1], [1, -1], [-1, -1],
];

export class SimplexNoise {
  private perm: Uint8Array = new Uint8Array(512);

  constructor(seed: number) {
    this.seedPermutation(seed);
  }

  private seedPermutation(seed: number): void {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      const j = ((s >>> 0) % (i + 1)) | 0;
      [p[i], p[j]] = [p[j], p[i]];
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  noise2D(x: number, y: number): number {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      t0 *= t0;
      const gi0 = this.perm[ii + this.perm[jj]] % 12;
      n0 = t0 * t0 * (GRAD2[gi0][0] * x0 + GRAD2[gi0][1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      t1 *= t1;
      const gi1 = this.perm[ii + i1 + this.perm[jj + j1]] % 12;
      n1 = t1 * t1 * (GRAD2[gi1][0] * x1 + GRAD2[gi1][1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      t2 *= t2;
      const gi2 = this.perm[ii + 1 + this.perm[jj + 1]] % 12;
      n2 = t2 * t2 * (GRAD2[gi2][0] * x2 + GRAD2[gi2][1] * y2);
    }
    return 70 * (n0 + n1 + n2);
  }
}

/** Fractal Brownian Motion - layered octaves for natural terrain. */
export function fbm(noise: SimplexNoise, x: number, y: number, octaves: number, lacunarity: number, gain: number): number {
  let value = 0, amplitude = 1, frequency = 1, maxValue = 0;
  for (let i = 0; i < octaves; i++) {
    value += noise.noise2D(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return value / maxValue;
}

/**
 * Ridged multifractal - builds mountain massifs, not single spike crests.
 *
 * Two anti-mohawk measures on top of the fractal sum:
 * 1. Power curve: each octave's ridge value is squared, sharpening the crest
 *    while broadening the base (wide-base/narrow-peak taper instead of a
 *    razor-thin spike with symmetric steep falloff).
 * 2. Spectral weighting: each octave is gated by the previous one's ridge
 *    strength, so high-frequency peaks/crags only appear INSIDE the broad
 *    low-frequency massif footprint. Outside the massif the octaves collapse
 *    to zero, blending smoothly into surrounding rolling terrain (no seam).
 */
export function ridged(noise: SimplexNoise, x: number, y: number, octaves: number, lacunarity: number, gain: number): number {
  let value = 0, amplitude = 1, frequency = 1, maxValue = 0, filter = 1;
  for (let i = 0; i < octaves; i++) {
    const m = Math.abs(noise.noise2D(x * frequency, y * frequency));
    // Power curve, octave-aware (exponents/weights are tuned constants):
    // the LOW octave uses 1 - m^RIDGE_MASSIF_EXPONENT for a broad massif with
    // shoulders; higher octaves use (1 - m)^RIDGE_CRAG_EXPONENT - below 2 this
    // rounds summit tops instead of producing sharp spires.
    let n = i === 0
      ? 1 - Math.pow(m, RIDGE_MASSIF_EXPONENT)
      : Math.pow(1 - m, RIDGE_CRAG_EXPONENT);
    n *= filter; // spectral weighting: crags only within the massif
    filter = Math.min(1, n * 1.5);
    // Massif octave weighted up (RIDGE_MASSIF_WEIGHT) so the broad base
    // dominates the fractal sum and summits read rounded.
    const amp = i === 0 ? amplitude * RIDGE_MASSIF_WEIGHT : amplitude;
    value += n * amp;
    maxValue += amp;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return value / maxValue;
}

/** Domain warping - distorts noise coordinates for more organic shapes. */
export function domainWarp(noise: SimplexNoise, x: number, y: number, warpStrength: number): [number, number] {
  const wx = noise.noise2D(x + 0.0, y + 0.0) * warpStrength;
  const wy = noise.noise2D(x + 5.2, y + 1.3) * warpStrength;
  return [x + wx, y + wy];
}

// ---------------------------------------------------------------------------
// Coastline perturbation noise (Step 6.1)
// ---------------------------------------------------------------------------

/**
 * Base spatial frequency for coastline perturbation (cycles per world unit).
 * Chosen VERY low so features repeat every ~1250 world units, producing
 * broad, gentle meanders (capes, bays, inlets) rather than jagged edges.
 */
const COAST_FREQUENCY = 0.0008;

/**
 * Dedicated low-frequency noise for perturbing the coastline boundary.
 *
 * Kept as a separate instance (different seed offset) from elevation, ridge,
 * and detail noise so coastline shape is independent of terrain height -
 * adjusting one never silently shifts the other.
 *
 * Output is a smooth scalar in roughly [-1, 1] representing the meander
 * offset to apply along the coastline boundary. Consumers typically scale
 * it by a meander amplitude (e.g. 40-80 world units).
 */
export class CoastPerturbationNoise {
  private noise: SimplexNoise;

  constructor(seed: number) {
    // Distinct seed offset (+5000) guarantees independence from all other
    // noise instances created by BiomeManager.
    this.noise = new SimplexNoise(seed + 5000);
  }

  /**
   * Get the coastline meander offset at a world coordinate.
   *
   * @param worldX - World X coordinate (coastline runs roughly north-south).
   * @param worldZ - World Z coordinate (along the coastline).
   * @returns Smooth perturbation value, approximately [-1, 1].
   */
  getOffset(worldX: number, worldZ: number): number {
    // Two octaves only: one broad meander + one subtle secondary swell.
    // Gain 0.5 keeps the second octave from adding jaggedness.
    return fbm(this.noise, worldX * COAST_FREQUENCY, worldZ * COAST_FREQUENCY, 2, 2.0, 0.5);
  }
}

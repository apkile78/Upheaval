/**
 * Seeded Simplex Noise with FBM, ridge noise, and domain warping.
 * Zero-dependency, pure TypeScript.
 *
 * Architecture: /src/sim/ layer — no rendering imports.
 */

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

/** Ridged noise - creates sharp mountain ridges. */
export function ridged(noise: SimplexNoise, x: number, y: number, octaves: number, lacunarity: number, gain: number): number {
  let value = 0, amplitude = 1, frequency = 1, maxValue = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise.noise2D(x * frequency, y * frequency));
    value += n * n * amplitude;
    maxValue += amplitude;
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

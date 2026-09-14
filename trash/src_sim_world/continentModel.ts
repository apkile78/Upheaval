/**
 * Seed-generated continent model for Phase 1.
 *
 * Produces a deterministic landmask made from multiple seeded continental
 * blobs so the interior is reliably land, while the sea remains outside the
 * generated continent envelopes. This keeps the existing biome/elevation logic
 * in place but removes the previous "scattered water in the interior" issue.
 */

import type { ClimateField, ContinentProfile, ContinentSpec } from '../../types/world';

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

const pseudoRandom = (seed: number, x: number, z: number): number => {
  const value = Math.sin(seed * 12.9898 + x * 78.233 + z * 37.719) * 43758.5453;
  return value - Math.floor(value);
};

export interface ContinentModel {
  profile: ContinentProfile;
  landmask: (x: number, z: number) => number;
  coastalBand: (x: number, z: number) => number;
  coastAnchor: (x: number, z: number) => number;
}

export function createContinentModel(seed: number): ContinentModel {
  const continentCount = 2 + Math.floor(pseudoRandom(seed, 0, 0) * 2);
  const continents: ContinentSpec[] = [];

  for (let i = 0; i < continentCount; i++) {
    const idx = i + 1;
    const centerX = (pseudoRandom(seed, idx, 11) * 2 - 1) * 1600 + 400;
    const centerZ = (pseudoRandom(seed, idx + 10, 21) * 2 - 1) * 1800;
    const radiusX = 450 + pseudoRandom(seed, idx + 20, 31) * 500;
    const radiusZ = 500 + pseudoRandom(seed, idx + 30, 41) * 600;

    continents.push({
      id: `continent-${i}`,
      centerX,
      centerZ,
      radiusX,
      radiusZ,
      strength: 0.78 + pseudoRandom(seed, idx + 50, 61) * 0.22,
    });
  }

  const profile: ContinentProfile = {
    seed,
    continents,
    coastBias: 0.25 + pseudoRandom(seed, 100, 101) * 0.15,
    climate: {
      direction: pseudoRandom(seed, 102, 103) * Math.PI * 2,
      strength: 0.8 + pseudoRandom(seed, 104, 105) * 0.2,
      humidity: 0.6 + pseudoRandom(seed, 106, 107) * 0.25,
      rainShadow: 0.45 + pseudoRandom(seed, 108, 109) * 0.35,
    } satisfies ClimateField,
  };

  const landmask = (x: number, z: number): number => {
    let combined = 0;

    for (const continent of continents) {
      const dx = (x - continent.centerX) / continent.radiusX;
      const dz = (z - continent.centerZ) / continent.radiusZ;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const envelope = Math.exp(-distance * distance * 1.8);
      const mask = clamp(envelope * continent.strength, 0, 1);
      combined = Math.max(combined, mask);
    }

    return clamp(combined);
  };

  const coastalBand = (x: number, z: number): number => {
    const mask = landmask(x, z);
    // Coastal band is the smooth transition zone where the envelope is falling
    // from solid land into the ocean.
    const coastal = smoothstep(0.15, 0.65, mask);
    return clamp(coastal);
  };

  const coastAnchor = (x: number, z: number): number => {
    const mask = landmask(x, z);
    return clamp(1 - Math.abs(mask - 0.5) * 2);
  };

  return {
    profile,
    landmask,
    coastalBand,
    coastAnchor,
  };
}

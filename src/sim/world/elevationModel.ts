/**
 * Phase 2: staircase elevation model.
 *
 * Combines the seed-generated landmask with basin staircase bands and a bounded
 * relief texture so terrain remains contiguous and never flips across band
 * boundaries. This is intentionally a standalone model that can be verified
 * independently before the rest of the world pipeline is rewired.
 */

import type { BasinInfo } from '../../types/world';
import { createContinentModel } from './continentModel';
import { createBasinModel, basinStaircase } from './basinModel';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const pseudoRandom = (seed: number, x: number, z: number): number => {
  const value = Math.sin(seed * 12.9898 + x * 78.233 + z * 37.719) * 43758.5453;
  return value - Math.floor(value);
};

export interface ElevationModel {
  elevation: (x: number, z: number) => number;
  landmask: (x: number, z: number) => number;
  basinAt: (x: number, z: number) => BasinInfo | null;
}

export function createElevationModel(seed: number): ElevationModel {
  const profile = createContinentModel(seed).profile;
  const basinModel = createBasinModel(profile);
  const continentModel = createContinentModel(seed);

  const reliefTexture = (x: number, z: number): number => {
    const noise = pseudoRandom(seed, Math.floor(x * 0.05), Math.floor(z * 0.05));
    return noise * 60;
  };

  const elevation = (x: number, z: number): number => {
    const landmask = continentModel.landmask(x, z);
    const basin = basinModel.basinAt(x, z);

    if (basin === null) {
      return landmask > 0 ? reliefTexture(x, z) : -60;
    }

    const staircase = basinStaircase(x, z, basin, continentModel.landmask);
    const localRelief = reliefTexture(x, z);
    const boundedRelief = clamp(localRelief, -30, 30);

    return landmask * (staircase + boundedRelief);
  };

  return {
    elevation,
    landmask: continentModel.landmask,
    basinAt: basinModel.basinAt,
  };
}

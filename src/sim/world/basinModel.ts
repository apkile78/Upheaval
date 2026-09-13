/**
 * Phase 2: procedural basin model.
 *
 * Builds a deterministic set of contiguous drainage basins from the seeded
 * continent layout. Each basin carries a headwater source, an outlet, and a
 * dominant biome spectrum selected from climate/rain-shadow bands. This is
 * intentionally kept separate from the existing region/river logic so it can be
 * verified independently before wiring into the rest of the world generator.
 */

import type { BasinId, BasinInfo, ContinentProfile } from '../../types/world';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const pseudoRandom = (seed: number, x: number, z: number): number => {
  const value = Math.sin(seed * 12.9898 + x * 78.233 + z * 37.719) * 43758.5453;
  return value - Math.floor(value);
};

export interface BasinModel {
  profile: ContinentProfile;
  basins: BasinInfo[];
  basinAt: (x: number, z: number) => BasinInfo | null;
  basinIdAt: (x: number, z: number) => BasinId | null;
  basinCount: number;
}

export function createBasinModel(profile: ContinentProfile): BasinModel {
  const basins: BasinInfo[] = [];
  const basinCount = Math.max(2, Math.min(5, 2 + Math.floor(pseudoRandom(profile.seed, 1, 1) * 3)));

  for (let i = 0; i < basinCount; i++) {
    const continent = profile.continents[i % profile.continents.length] ?? profile.continents[0];
    const jitterX = (pseudoRandom(profile.seed, i + 15, 2) - 0.5) * continent.radiusX * 0.8;
    const jitterZ = (pseudoRandom(profile.seed, i + 25, 3) - 0.5) * continent.radiusZ * 0.8;

    const centerX = continent.centerX + jitterX;
    const centerZ = continent.centerZ + jitterZ;

    const headwaterX = centerX - continent.radiusX * (0.25 + pseudoRandom(profile.seed, i + 35, 4) * 0.25);
    const headwaterZ = centerZ - continent.radiusZ * (0.25 + pseudoRandom(profile.seed, i + 45, 5) * 0.25);

    const outletType = pseudoRandom(profile.seed, i + 55, 6) > 0.65 ? 'endorheic' : 'ocean';
    const outletX = outletType === 'endorheic'
      ? centerX + (pseudoRandom(profile.seed, i + 65, 7) - 0.5) * 300
      : Math.sign(centerX) * 1800 + (pseudoRandom(profile.seed, i + 75, 8) - 0.5) * 200;
    const outletZ = outletType === 'endorheic'
      ? centerZ + (pseudoRandom(profile.seed, i + 85, 9) - 0.5) * 300
      : Math.sign(centerZ) * 1800 + (pseudoRandom(profile.seed, i + 95, 10) - 0.5) * 200;

    const dominantBiome = outletType === 'endorheic'
      ? (pseudoRandom(profile.seed, i + 105, 11) > 0.5 ? 'arid_plateau' : 'prairie')
      : (pseudoRandom(profile.seed, i + 115, 12) > 0.5 ? 'temperate_rainforest' : 'swamp');

    basins.push({
      id: `basin-${i}`,
      continentId: continent.id,
      centerX,
      centerZ,
      headwaterX,
      headwaterZ,
      outletX,
      outletZ,
      outletType,
      width: 200 + pseudoRandom(profile.seed, i + 125, 13) * 220,
      baseLevel: 30 + pseudoRandom(profile.seed, i + 135, 14) * 70,
      dominantBiome,
    });
  }

  const basinAt = (x: number, z: number): BasinInfo | null => {
    let best: BasinInfo | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const basin of basins) {
      const dx = x - basin.centerX;
      const dz = z - basin.centerZ;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = basin;
      }
    }

    return best;
  };

  const basinIdAt = (x: number, z: number): BasinId | null => {
    const basin = basinAt(x, z);
    return basin ? basin.id : null;
  };

  return {
    profile,
    basins,
    basinAt,
    basinIdAt,
    basinCount: basins.length,
  };
}

export function basinStaircase(
  x: number,
  z: number,
  basin: BasinInfo,
  landmask: (arg0: number, arg1: number) => number,
): number {
  const dx = x - basin.headwaterX;
  const dz = z - basin.headwaterZ;
  const dist = Math.sqrt(dx * dx + dz * dz);

  const normalized = clamp(dist / Math.max(1, basin.width * 3), 0, 1);
  const band = 1 - normalized;
  const mask = landmask(x, z);

  return band * 580 + (mask * 120) + basin.baseLevel;
}

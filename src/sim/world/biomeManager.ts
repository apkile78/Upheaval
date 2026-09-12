/**
 * East Coast biome evaluation using real geological parameters.
 * Combines region-based elevation with moisture for biome selection.
 *
 * Architecture: /src/sim/ layer — no rendering imports.
 */

import type { TileTerrainType } from '../../types/world';
import { SimplexNoise, fbm, ridged, domainWarp } from './noise';

export interface BiomeInfo {
  type: TileTerrainType;
  elevation: number;
  moisture: number;
}

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

  constructor(seed: number) {
    this.elevationNoise = new SimplexNoise(seed);
    this.ridgeNoise = new SimplexNoise(seed + 1000);
    this.moistureNoise = new SimplexNoise(seed + 2000);
    this.warpNoise = new SimplexNoise(seed + 3000);
    this.detailNoise = new SimplexNoise(seed + 4000);
  }

  /** Get biome + elevation at a world coordinate. */
  getBiome(worldX: number, worldZ: number): BiomeInfo {
    const elevation = this.getElevation(worldX, worldZ);
    const moisture = this.getMoisture(worldX, worldZ);
    const type = this.classifyBiome(elevation, moisture);
    return { type, elevation, moisture };
  }

  /** Get terrain surface elevation (Y height) at a world coordinate. */
  getElevation(worldX: number, worldZ: number): number {
    // Domain warp for organic shapes
    const [wx, wz] = domainWarp(this.warpNoise, worldX * 0.005, worldZ * 0.005, 2.0);

    // Base terrain: FBM for rolling hills
    const baseFbm = fbm(this.elevationNoise, wx, wz, 4, 2.0, 0.5);

    // Ridge noise for Appalachian mountains (stronger in western regions)
    const ridge = ridged(this.ridgeNoise, wx, wz, 3, 2.0, 0.6);

    // Distance from coast (east = low, west = high)
    const coastFactor = this.getCoastFactor(worldX);

    // Combine: base hills + mountains scaled by coast position
    let elevation = baseFbm * 0.4 + ridge * 0.6;

    // Scale elevation based on coast factor (east coast flat, west mountainous)
    elevation *= coastFactor;

    // Add fine detail
    const detail = fbm(this.detailNoise, worldX * 0.02, worldZ * 0.02, 2, 2.0, 0.5);
    elevation += detail * 0.1;

    return elevation * 100; // Scale to world units
  }

  /** Get moisture level (0-1) at a world coordinate. */
  private getMoisture(worldX: number, worldZ: number): number {
    const m = fbm(this.moistureNoise, worldX * 0.008, worldZ * 0.008, 3, 2.0, 0.5);
    return (m + 1) / 2; // Normalize to 0-1
  }

  /** Coast factor: east (ocean) = 0, west (mountains) = 1. */
  private getCoastFactor(worldX: number): number {
    // East coast at worldX ~ 0-50, mountains at 500-800
    const normalized = Math.max(0, Math.min(1, (worldX - 50) / 400));
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

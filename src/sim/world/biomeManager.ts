/**
 * Biome evaluation on the real Earth.
 *
 * Elevation comes straight from the NOAA ETOPO 2022 tile source (1 game unit
 * = 1 meter, sea level = 0). Terrain types are classified from real latitude
 * and elevation with a small deterministic moisture field (see earthBiome).
 *
 * Architecture: /src/sim/ layer - no rendering imports.
 */

import type { EarthElevationSource, TileTerrainType } from '../../types/world';
import { SimplexNoise, fbm } from './noise';
import { worldToLatLon } from './earth/earthProjection';
import { classifyEarthBiome, blendMoisture } from './earth/earthBiome';

export interface BiomeInfo {
  type: TileTerrainType;
  elevation: number;
  moisture: number;
}

/** Spatial frequency of the moisture variation field (cycles per meter). */
const MOISTURE_FREQUENCY = 0.00005;

/** Real-Earth terrain palette for vertex coloring (same keys as before). */
export const BIOME_COLORS: Record<TileTerrainType, number> = {
  water:    0x1a5276,  // Deep ocean blue
  grass:    0x4a7c3f,  // Temperate grassland
  dirt:     0x8b5e3c,  // Dry soil / tundra
  stone:    0x6b7b6b,  // Alpine rock
  sand:     0xc2b280,  // Desert / beach tan
  forest:   0x1e4a1e,  // Deep forest green
  mountain: 0x5a6b5a,  // Mountain rock
  road:     0x4a4a4a,  // Asphalt grey
  building: 0x8a7a6a,  // Building brown
  swamp:    0x3d5c3a,  // Marsh dark green
  snow:     0xe8e8f0,  // Snow / ice white
  metal:    0x7a7a8a,  // Metal grey
};

export class BiomeManager {
  private readonly source: EarthElevationSource;
  private readonly moistureNoise: SimplexNoise;

  /**
   * @param source - Real-Earth elevation source (tiled ETOPO assets).
   * @param seed   - Deterministic moisture-variation seed (terrain itself is
   *                 seed-independent: it is real data).
   */
  constructor(source: EarthElevationSource, seed: number = 0) {
    this.source = source;
    this.moistureNoise = new SimplexNoise(seed + 2000);
  }

  /** Real-Earth surface elevation (meters) at a world coordinate. */
  getElevation(worldX: number, worldZ: number): number {
    return this.source.sampleHeight(worldX, worldZ);
  }

  /** True when the surface is at or below sea level. */
  isWater(worldX: number, worldZ: number): boolean {
    return this.getElevation(worldX, worldZ) <= 0;
  }

  /** Latitude/longitude for a world coordinate. */
  getLatLon(worldX: number, worldZ: number): { lat: number; lon: number } {
    return worldToLatLon(worldX, worldZ);
  }

  /** Get biome + elevation at a world coordinate. */
  getBiome(worldX: number, worldZ: number): BiomeInfo {
    const elevation = this.getElevation(worldX, worldZ);
    const { lat } = worldToLatLon(worldX, worldZ);
    const moisture = this.getMoisture(worldX, worldZ, lat);
    const type = classifyEarthBiome(lat, elevation, moisture);
    return { type, elevation, moisture };
  }

  /** Moisture in [0, 1]: latitude climatology + deterministic noise. */
  getMoisture(worldX: number, worldZ: number, lat?: number): number {
    const latValue = lat ?? worldToLatLon(worldX, worldZ).lat;
    const n = fbm(
      this.moistureNoise,
      worldX * MOISTURE_FREQUENCY,
      worldZ * MOISTURE_FREQUENCY,
      3,
      2.0,
      0.5,
    );
    return blendMoisture(latValue, n);
  }

  /** Get tile type at a specific world Y (for underground layers). */
  getTileType(worldY: number, surfaceElevation: number): TileTerrainType {
    if (worldY > surfaceElevation) return 'grass'; // Air/above
    if (worldY === surfaceElevation) return this.classifySurface(surfaceElevation);
    if (worldY >= surfaceElevation - 3) return 'dirt';
    return 'stone';
  }

  /**
   * Surface classification without a per-column moisture lookup: water tracks
   * the real elevation; land uses a neutral mid-latitude/mid-moisture class.
   */
  private classifySurface(surfaceElevation: number): TileTerrainType {
    if (surfaceElevation <= 0) return 'water';
    return classifyEarthBiome(45, surfaceElevation, 0.5);
  }
}

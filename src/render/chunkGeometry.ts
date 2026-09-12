/**
 * Chunk geometry builder - converts chunk heightmaps into Three.js BufferGeometry.
 *
 * All mesh vertices use RAW heightmap corner values (no interpolation/averaging).
 * Triangles linearly interpolate between corners, which exactly matches the
 * player's bilinear height physics (terrainFollow.ts) and guarantees seamless
 * chunk borders (adjacent chunks sample the identical shared corner value).
 *
 * Architecture: lives in /src/render/; imports Three.js.
 */

import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { WorldChunk } from '../types/world';
import { BIOME_COLORS } from '../sim/world/biomeManager';

const CHUNK_SIZE = 16;
const TILE_SIZE = 1;

/** 8-directional neighbor heightmap bundle for seamless chunk edges. */
export interface NeighborHeightmaps {
  nw: Float32Array | null;
  n: Float32Array | null;
  ne: Float32Array | null;
  w: Float32Array | null;
  e: Float32Array | null;
  sw: Float32Array | null;
  s: Float32Array | null;
  se: Float32Array | null;
}

/** Determine terrain type from elevation for coloring (decoupled from tile data). */
function getTypeFromHeight(h: number): string {
  if (h < 0) return 'water';
  if (h < 5) return 'sand';
  if (h < 50) return 'grass';
  if (h < 200) return 'forest';
  if (h < 500) return 'dirt';
  if (h < 1000) return 'mountain';
  if (h < 1500) return 'stone';
  return 'snow';
}

/**
 * Sample the height at a grid corner. Out-of-bounds corners read from the
 * appropriate neighbor heightmap (seamless borders). If that neighbor is
 * missing, fall back to the clamped own-heightmap edge value so border
 * vertices never collapse to 0. The neighbor-count diff in updateAllChunks
 * triggers a one-time re-mesh once the missing neighbor loads.
 */
function sampleCorner(
  lx: number,
  lz: number,
  heightmap: Float32Array,
  neighbors?: NeighborHeightmaps,
): number {
  if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
    return heightmap[lx * CHUNK_SIZE + lz] || 0;
  }
  const west = lx < 0;
  const east = lx >= CHUNK_SIZE;
  const north = lz < 0;
  const south = lz >= CHUNK_SIZE;
  const clx = Math.max(0, Math.min(CHUNK_SIZE - 1, lx));
  const clz = Math.max(0, Math.min(CHUNK_SIZE - 1, lz));

  if (west && !north && !south && neighbors?.w) {
    return neighbors.w[(CHUNK_SIZE - 1) * CHUNK_SIZE + lz] || 0;
  }
  if (east && !north && !south && neighbors?.e) {
    return neighbors.e[0 * CHUNK_SIZE + lz] || 0;
  }
  if (north && !west && !east && neighbors?.n) {
    return neighbors.n[lx * CHUNK_SIZE + (CHUNK_SIZE - 1)] || 0;
  }
  if (south && !west && !east && neighbors?.s) {
    return neighbors.s[lx * CHUNK_SIZE + 0] || 0;
  }
  if (west && north && neighbors?.nw) {
    return neighbors.nw[(CHUNK_SIZE - 1) * CHUNK_SIZE + (CHUNK_SIZE - 1)] || 0;
  }
  if (east && north && neighbors?.ne) {
    return neighbors.ne[0 * CHUNK_SIZE + (CHUNK_SIZE - 1)] || 0;
  }
  if (west && south && neighbors?.sw) {
    return neighbors.sw[(CHUNK_SIZE - 1) * CHUNK_SIZE + 0] || 0;
  }
  if (east && south && neighbors?.se) {
    return neighbors.se[0 * CHUNK_SIZE + 0] || 0;
  }
  // Neighbor missing: clamp to own edge value (avoids height-0 cliffs)
  return heightmap[clx * CHUNK_SIZE + clz] || 0;
}

/**
 * Build chunk geometry. Every vertex uses the RAW heightmap corner value -
 * no averaging. Triangle interpolation between corners then exactly matches
 * the player's bilinear height physics, and shared corners across chunk
 * borders produce seamless geometry.
 */
export function buildChunkGeometry(
  chunk: WorldChunk,
  heightmap: Float32Array,
  neighbors?: NeighborHeightmaps,
): BufferGeometry {
  const { coordinate } = chunk;
  const cx = coordinate.x * CHUNK_SIZE;
  const cz = coordinate.z * CHUNK_SIZE;

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  // Per-tile surface types for vertex coloring (own chunk only - colors
  // never cross borders, so no neighbor lookups are needed here)
  const surfaceTypes: string[][] = [];
  for (let x = 0; x < CHUNK_SIZE; x++) {
    surfaceTypes[x] = [];
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const h = heightmap[x * CHUNK_SIZE + z] || 0;
      surfaceTypes[x][z] = getTypeFromHeight(h);
    }
  }

  const gridW = CHUNK_SIZE;
  const gridH = CHUNK_SIZE;

  for (let x = 0; x <= gridW; x++) {
    for (let z = 0; z <= gridH; z++) {
      const wx = cx + x * TILE_SIZE;
      const wz = cz + z * TILE_SIZE;

      // RAW corner height - identical value both chunks compute for shared corners
      const height = sampleCorner(x, z, heightmap, neighbors);
      positions.push(wx, height, wz);

      // Vertex color: dominant terrain type of the up-to-4 touching tiles
      const tx = Math.max(0, Math.min(CHUNK_SIZE - 1, x === gridW ? x - 1 : x));
      const tz = Math.max(0, Math.min(CHUNK_SIZE - 1, z === gridH ? z - 1 : z));
      const type = surfaceTypes[tx][tz];
      const color = BIOME_COLORS[type as keyof typeof BIOME_COLORS] || BIOME_COLORS['grass'];
      colors.push(
        ((color >> 16) & 0xff) / 255,
        ((color >> 8) & 0xff) / 255,
        (color & 0xff) / 255,
      );
    }
  }

  for (let x = 0; x < gridW; x++) {
    for (let z = 0; z < gridH; z++) {
      const a = x * (gridH + 1) + z;
      const b = (x + 1) * (gridH + 1) + z;
      const c = x * (gridH + 1) + (z + 1);
      const d = (x + 1) * (gridH + 1) + (z + 1);

      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

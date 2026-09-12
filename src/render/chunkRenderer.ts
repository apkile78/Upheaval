/**
 * Terrain chunk renderer - creates/disposes Three.js meshes for world chunks.
 *
 * Architecture: lives in /src/render/; imports Three.js.
 * Reads chunk data from simulation, renders to scene.
 */

import { BufferGeometry, Mesh, MeshStandardMaterial, Scene, Float32BufferAttribute } from 'three';
import type { WorldChunk, ChunkCoordinate } from '../types/world';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 16;
const TILE_SIZE = 1;

// Terrain type colors
const TERRAIN_COLORS: Record<string, number> = {
  grass:   0x4caf50,
  dirt:    0x8b5e3c,
  stone:   0x757575,
  water:   0x2196f3,
  sand:    0xf4d03f,
  forest:  0x2e7d32,
  mountain:0x607d8b,
  road:    0x555555,
  building:0x9e9e9e,
  swamp:   0x4a4a2a,
  snow:    0xffffff,
  metal:   0x9e9e9e,
};

// ---------------------------------------------------------------------------
// Chunk Renderer
// ---------------------------------------------------------------------------

export class ChunkRenderer {
  private scene: Scene;
  private meshes = new Map<string, Mesh>();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  updateChunkMesh(chunk: WorldChunk): void {
    const key = this.chunkKey(chunk.coordinate);
    this.removeChunkMesh(key);
    const mesh = this.createChunkMesh(chunk);
    this.meshes.set(key, mesh);
    this.scene.add(mesh);
  }

  removeChunkMesh(key: string): void {
    const mesh = this.meshes.get(key);
    if (mesh) {
      mesh.geometry.dispose();
      (mesh.material as { dispose(): void }).dispose();
      this.scene.remove(mesh);
      this.meshes.delete(key);
    }
  }

  updateAllChunks(chunks: WorldChunk[]): void {
    const activeKeys = new Set<string>();
    for (const chunk of chunks) {
      activeKeys.add(this.chunkKey(chunk.coordinate));
    }
    
    for (const [key, mesh] of this.meshes) {
      if (!activeKeys.has(key)) {
        mesh.geometry.dispose();
        (mesh.material as { dispose(): void }).dispose();
        this.scene.remove(mesh);
        this.meshes.delete(key);
      }
    }
    
    for (const chunk of chunks) {
      this.updateChunkMesh(chunk);
    }
  }

  clear(): void {
    for (const [_, mesh] of this.meshes) {
      mesh.geometry.dispose();
      (mesh.material as { dispose(): void }).dispose();
    }
    this.meshes.clear();
  }

  private chunkKey(coord: ChunkCoordinate): string {
    return `${coord.x},${coord.y},${coord.z}`;
  }

  private createChunkMesh(chunk: WorldChunk): Mesh {
    const geometry = this.buildChunkGeometry(chunk);
    const material = new MeshStandardMaterial({
      vertexColors: true,
      side: 1,
      flatShading: true,
      metalness: 0.1,
      roughness: 0.8,
    });
    return new Mesh(geometry, material);
  }

  private buildChunkGeometry(chunk: WorldChunk): BufferGeometry {
    const { tiles, coordinate } = chunk;
    const cx = coordinate.x * CHUNK_SIZE;
    const cz = coordinate.z * CHUNK_SIZE;

    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    // Find surface height for each (x, z) column
    const surfaceHeights: Array<Array<{ height: number; type: string }>> = [];
    for (let x = 0; x < CHUNK_SIZE; x++) {
      surfaceHeights[x] = [];
      for (let z = 0; z < CHUNK_SIZE; z++) {
        let maxY = 0;
        let maxType = 'grass';
        
        for (let y = CHUNK_SIZE - 1; y >= 0; y--) {
          const tile = tiles[x]?.[y]?.[z];
          if (tile && tile.elevation >= 0) {
            if (y + coordinate.y * CHUNK_SIZE > maxY) {
              maxY = y + coordinate.y * CHUNK_SIZE;
              maxType = tile.terrainType;
            }
          }
        }
        
        surfaceHeights[x][z] = { height: maxY, type: maxType };
      }
    }

    const gridW = CHUNK_SIZE;
    const gridH = CHUNK_SIZE;

    for (let x = 0; x <= gridW; x++) {
      for (let z = 0; z <= gridH; z++) {
        const wx = cx + x * TILE_SIZE;
        const wz = cz + z * TILE_SIZE;
        
        let height = 0;
        if (x > 0 && x <= gridW && z > 0 && z <= gridH) {
          const h00 = surfaceHeights[x - 1]?.[z - 1]?.height ?? 0;
          const h10 = surfaceHeights[x]?.[z - 1]?.height ?? 0;
          const h01 = surfaceHeights[x - 1]?.[z]?.height ?? 0;
          const h11 = surfaceHeights[x]?.[z]?.height ?? 0;
          height = Math.max(h00, h10, h01, h11);
        } else {
          const nx = Math.max(0, Math.min(gridW - 1, x - 1));
          const nz = Math.max(0, Math.min(gridH - 1, z - 1));
          height = surfaceHeights[nx]?.[nz]?.height ?? 0;
        }

        positions.push(wx, height, wz);

        let color = TERRAIN_COLORS['grass'];
        if (x > 0 && x <= gridW && z > 0 && z <= gridH) {
          const t00 = surfaceHeights[x - 1]?.[z - 1]?.type ?? 'grass';
          const t10 = surfaceHeights[x]?.[z - 1]?.type ?? 'grass';
          const t01 = surfaceHeights[x - 1]?.[z]?.type ?? 'grass';
          const t11 = surfaceHeights[x]?.[z]?.type ?? 'grass';
          
          const types = [t00, t10, t01, t11];
          const counts: Record<string, number> = {};
          for (const t of types) {
            counts[t] = (counts[t] || 0) + 1;
          }
          let maxType = 'grass';
          let maxCount = 0;
          for (const [t, c] of Object.entries(counts)) {
            if (c > maxCount) {
              maxCount = c;
              maxType = t;
            }
          }
          color = TERRAIN_COLORS[maxType] || TERRAIN_COLORS['grass'];
        }

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

        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }
}

import { chunkRng, valueNoise2D } from "./rng.js";  
import { loadDiff, saveDiff } from "./storage.js";  
  
// ---------- constants ----------  
export const CHUNK_SIZE = 32;  
export const N_LAYERS = 8;             // capped vertical stack (milestone 6, option A)  
const AREA = CHUNK_SIZE * CHUNK_SIZE;  
  
// tile values  
export const AIR = 0;  
export const FLOOR = 1;  
export const WALL = 2;  
export const STAIRS = 3;  
export const TREE = 4;
  
// ---------- generation ----------  
export function generateChunkTiles(seed, cx, cz) {  
  const layers = [];  
  for (let L = 0; L < N_LAYERS; L++) layers.push(new Uint8Array(AREA));  
  const rng = chunkRng(seed, cx, cz);  
  const l0 = layers[0];  
  
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {  
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {  
      const wx = cx * CHUNK_SIZE + lx;  
      const wz = cz * CHUNK_SIZE + lz;  
      const i = lz * CHUNK_SIZE + lx;  
      l0[i] = FLOOR;  
  
      // low-frequency biome field -> smooth bands (autocorrelated)  
      const b = valueNoise2D(seed, wx * 0.02, wz * 0.02);  
      if (b >= 0.40 && b < 0.68) {  
        // forest: scatter trees, denser toward the band center  
        const density = 1 - Math.abs((b - 0.54) / 0.14); // 0..1  
        if (rng() < 0.05 + 0.20 * density) l0[i] = TREE;  
      }  
      // b < 0.40 = field (bare floor); b >= 0.68 = city (buildings below)  
    }  
  }  
  return layers;  
}
  
// ---------- world ---------- 
//---solid trees---
isSolid(tx, tz, level) {  
  const t = this.getTile(tx, tz, level);  
  return t === WALL || t === TREE;  
}

export class World {  
  constructor(seed, gl, makeMesh) {  
    this.seed = seed >>> 0;  
    this.gl = gl;  
    this.makeMesh = makeMesh;      // (Float32Array) -> { vao, count }  
    this.chunks = new Map();       // "cx,cz" -> chunk  
  }  
  
  key(cx, cz) { return cx + "," + cz; }  
  get maxLevel() { return N_LAYERS - 1; }  
  
  getChunk(cx, cz) {  
    const k = this.key(cx, cz);  
    let c = this.chunks.get(k);  
    if (c) return c;  
  
    c = {  
      cx, cz,  
      tiles: generateChunkTiles(this.seed, cx, cz), // array[L] of Uint8Array  
      diff: {},                                     // encodedIndex -> tileValue  
      diffLoaded: false,  
      meshes: new Array(N_LAYERS).fill(null),       // meshes[L] = {floorMesh,wallMesh,stairsMesh}  
    };  
    this.chunks.set(k, c);  
  
    // option A: baseline is live now, apply saved diff when it resolves  
    loadDiff(k).then((saved) => {  
      if (saved) {  
        for (const idx in saved) {  
          const enc = +idx;  
          const L = Math.floor(enc / AREA);  
          const local = enc % AREA;  
          if (c.tiles[L]) c.tiles[L][local] = saved[idx];  
        }  
        c.diff = saved;  
        c.meshes.fill(null); // force re-bake with the applied diff  
      }  
      c.diffLoaded = true;  
    });  
  
    return c;  
  }  
  
  // encode (level, local) into the single per-chunk diff key space  
  encode(level, local) { return level * AREA + local; }  
  
  getTile(tx, tz, level) {  
    if (level < 0 || level >= N_LAYERS) return AIR;  
    const cx = Math.floor(tx / CHUNK_SIZE), cz = Math.floor(tz / CHUNK_SIZE);  
    const c = this.getChunk(cx, cz);  
    const lx = tx - cx * CHUNK_SIZE, lz = tz - cz * CHUNK_SIZE;  
    return c.tiles[level][lz * CHUNK_SIZE + lx];  
  }  
  
  isSolid(tx, tz, level) {  
    return this.getTile(tx, tz, level) === WALL;  
  }  
  
  setTile(tx, tz, level, value) {  
    if (level < 0 || level >= N_LAYERS) return;  
    const cx = Math.floor(tx / CHUNK_SIZE), cz = Math.floor(tz / CHUNK_SIZE);  
    const c = this.getChunk(cx, cz);  
    const lx = tx - cx * CHUNK_SIZE, lz = tz - cz * CHUNK_SIZE;  
    const local = lz * CHUNK_SIZE + lx;  
  
    c.tiles[level][local] = value;  
    c.diff[this.encode(level, local)] = value;  
    c.meshes[level] = null;                 // dirty -> re-bake this layer  
    saveDiff(this.key(cx, cz), c.diff);     // async fire-and-forget  
  }  
  
  // build geometry (floats: x,y,z, u,v, shade) for one layer of one chunk  
  buildLayerMeshData(c, level) {  
    const floor = [], wall = [], stairs = [], roof = [];  
    const tiles = c.tiles[level];  
    const baseX = c.cx * CHUNK_SIZE, baseZ = c.cz * CHUNK_SIZE;  
  
    const pushQuad = (arr, verts, shade) => {  
      // verts: [ [x,y,z,u,v] x4 ], emit two triangles  
      const idx = [0, 1, 2, 0, 2, 3];  
      for (const j of idx) {  
        const v = verts[j];  
        arr.push(v[0], v[1], v[2], v[3], v[4], shade);  
      }  
    };  
  
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {  
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {  
        const t = tiles[lz * CHUNK_SIZE + lx];  
        const x = lx, z = lz; // local coords; chunk world-offset handled below  
  
        if (t === FLOOR || t === STAIRS) {  
          // flat floor quad slightly above 0 to avoid z-fighting  
          pushQuad(floor, [  
            [x,     0.02, z    , 0, 0],  
            [x + 1, 0.02, z    , 1, 0],  
            [x + 1, 0.02, z + 1, 1, 1],  
            [x,     0.02, z + 1, 0, 1],  
          ], 1.0);  
        }  
  
        if (t === STAIRS) {  
          // short marker box (0..0.5) so stairs are visible; tinted yellow in draw()  
          const y1 = 0.5;  
          pushQuad(stairs, [[x,y1,z,0,0],[x+1,y1,z,1,0],[x+1,y1,z+1,1,1],[x,y1,z+1,0,1]], 1.0);  
          pushQuad(stairs, [[x,0,z,0,0],[x+1,0,z,1,0],[x+1,y1,z,1,1],[x,y1,z,0,1]], 0.7);  
          pushQuad(stairs, [[x,0,z+1,0,0],[x+1,0,z+1,1,0],[x+1,y1,z+1,1,1],[x,y1,z+1,0,1]], 0.7);  
          pushQuad(stairs, [[x,0,z,0,0],[x,0,z+1,1,0],[x,y1,z+1,1,1],[x,y1,z,0,1]], 0.6);  
          pushQuad(stairs, [[x+1,0,z,0,0],[x+1,0,z+1,1,0],[x+1,y1,z+1,1,1],[x+1,y1,z,0,1]], 0.6);  
        }  
  
        if (t === WALL || t == TREE) {  
          // top face -> separate roof mesh so it can be hidden on the current floor  
          pushQuad(roof, [[x,1,z,0,0],[x+1,1,z,1,0],[x+1,1,z+1,1,1],[x,1,z+1,0,1]], 1.0);  
          // exposed side faces only (cull against solid neighbours in same layer)  
          const solid = (nx, nz) =>  
            this.isSolid(baseX + nx, baseZ + nz, level);  
          if (!solid(lx, lz - 1)) // north  
            pushQuad(wall, [[x,0,z,0,0],[x+1,0,z,1,0],[x+1,1,z,1,1],[x,1,z,0,1]], 0.7);  
          if (!solid(lx, lz + 1)) // south  
            pushQuad(wall, [[x,0,z+1,0,0],[x+1,0,z+1,1,0],[x+1,1,z+1,1,1],[x,1,z+1,0,1]], 0.7);  
          if (!solid(lx - 1, lz)) // west  
            pushQuad(wall, [[x,0,z,0,0],[x,0,z+1,1,0],[x,1,z+1,1,1],[x,1,z,0,1]], 0.6);  
          if (!solid(lx + 1, lz)) // east  
            pushQuad(wall, [[x+1,0,z,0,0],[x+1,0,z+1,1,0],[x+1,1,z+1,1,1],[x+1,1,z,0,1]], 0.6);  
        }  
      }  
    }  
  
    return {  
      floorMesh: this.makeMesh(new Float32Array(floor)),  
      wallMesh: this.makeMesh(new Float32Array(wall)),  
      roofMesh: this.makeMesh(new Float32Array(roof)),  
      stairsMesh: this.makeMesh(new Float32Array(stairs)),  
    };  
  }  
  
  ensureMesh(c) {  
    for (let L = 0; L < N_LAYERS; L++) {  
      if (!c.meshes[L]) c.meshes[L] = this.buildLayerMeshData(c, L);  
    }  
  }  
  
  // load/mesh chunks in radius, flush+unload the rest  
  update(px, pz, radius) {  
    const pcx = Math.floor(px / CHUNK_SIZE), pcz = Math.floor(pz / CHUNK_SIZE);  
    for (let dz = -radius; dz <= radius; dz++)  
      for (let dx = -radius; dx <= radius; dx++) {  
        const c = this.getChunk(pcx + dx, pcz + dz);  
        this.ensureMesh(c);  
      }  
    for (const [k, c] of this.chunks) {  
      if (Math.abs(c.cx - pcx) > radius + 1 || Math.abs(c.cz - pcz) > radius + 1) {  
        if (Object.keys(c.diff).length) saveDiff(k, c.diff); // flush before drop  
        this.chunks.delete(k);  
      }  
    }  
  }  
  
  loadedChunks(px, pz, radius) {  
    const pcx = Math.floor(px / CHUNK_SIZE), pcz = Math.floor(pz / CHUNK_SIZE);  
    const out = [];  
    for (let dz = -radius; dz <= radius; dz++)  
      for (let dx = -radius; dx <= radius; dx++) {  
        const c = this.chunks.get(this.key(pcx + dx, pcz + dz));  
        if (c && c.meshes[0]) out.push(c);  
      }  
    return out;  
  }  
}

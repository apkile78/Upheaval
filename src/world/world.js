import { chunkRng, valueNoise2D } from "./rng.js";  
import { loadDiff, saveDiff } from "./storage.js";  
  
export const CHUNK_SIZE = 16;  
export const N_LAYERS = 8;                 // capped vertical stack (option A)  
export const EMPTY = 0, FLOOR = 1, WALL = 2, STAIRS = 3;  
  
// ---- deterministic generation: returns N_LAYERS flat Uint8Arrays ----  
function generateChunkLayers(seed, cx, cz) {  
  const layers = [];  
  for (let z = 0; z < N_LAYERS; z++) layers.push(new Uint8Array(CHUNK_SIZE * CHUNK_SIZE));  
  const rng = chunkRng(seed, cx, cz);  
  const scale = 0.12;  
  let stairPlaced = false;  
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {  
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {  
      const wx = cx * CHUNK_SIZE + lx, wz = cz * CHUNK_SIZE + lz;  
      const n = valueNoise2D(seed, wx * scale, wz * scale);  
      const idx = lz * CHUNK_SIZE + lx;  
      // ground floor (layer 0): same blobby buildings as before  
      let ground = n > 0.62 ? WALL : FLOOR;  
      if (ground === FLOOR && rng() < 0.02) ground = WALL;  
      layers[0][idx] = ground;  
      // second floor (layer 1): only over the interior of big building masses  
      if (n > 0.72) layers[1][idx] = WALL;  
      else if (n > 0.62) layers[1][idx] = FLOOR;  
      // one stairway per chunk connecting ground -> second floor  
      if (!stairPlaced && ground === FLOOR && layers[1][idx] === FLOOR) {  
        layers[0][idx] = STAIRS;  
        stairPlaced = true;  
      }  
    }  
  }  
  return layers;  
}  
  
// ---- mesh helpers (vertex = pos(3), uv(2), shade(1) = stride 6) ----  
const TOP = 0.85, SIDE = 0.65;  
  
// quad from a corner + two edge vectors -> two triangles  
function pushQuad(a, x, y, z, ux, uy, uz, vx, vy, vz, shade) {  
  const p = (px, py, pz, u, v) => a.push(px, py, pz, u, v, shade);  
  p(x, y, z, 0, 0);  
  p(x + ux, y + uy, z + uz, 1, 0);  
  p(x + ux + vx, y + uy + vy, z + uz + vz, 1, 1);  
  p(x, y, z, 0, 0);  
  p(x + ux + vx, y + uy + vy, z + uz + vz, 1, 1);  
  p(x + vx, y + vy, z + vz, 0, 1);  
}  
  
// build geometry for ONE layer of a chunk (exposed-face culling within that layer)  
function buildLayerMeshData(world, c, level) {  
  const floorData = [], wallData = [], stairsData = [];  
  const baseX = c.cx * CHUNK_SIZE, baseZ = c.cz * CHUNK_SIZE;  
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {  
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {  
      const wx = baseX + lx, wz = baseZ + lz;  
      const t = c.layers[level][lz * CHUNK_SIZE + lx];  
      if (t === EMPTY) continue;  
      if (t === WALL) {  
        pushQuad(wallData, lx, 1, lz, 1, 0, 0, 0, 0, 1, TOP);         // top  
        if (world.getTile(wx - 1, wz, level) !== WALL)  
          pushQuad(wallData, lx, 0, lz, 0, 0, 1, 0, 1, 0, SIDE);  
        if (world.getTile(wx + 1, wz, level) !== WALL)  
          pushQuad(wallData, lx + 1, 0, lz + 1, 0, 0, -1, 0, 1, 0, SIDE);  
        if (world.getTile(wx, wz - 1, level) !== WALL)  
          pushQuad(wallData, lx + 1, 0, lz, -1, 0, 0, 0, 1, 0, SIDE);  
        if (world.getTile(wx, wz + 1, level) !== WALL)  
          pushQuad(wallData, lx, 0, lz + 1, 1, 0, 0, 0, 1, 0, SIDE);  
      } else if (t === STAIRS) {  
        pushQuad(stairsData, lx, 0.06, lz, 1, 0, 0, 0, 0, 1, TOP);  
      } else { // FLOOR  
        pushQuad(floorData, lx, 0.02, lz, 1, 0, 0, 0, 0, 1, TOP);  
      }  
    }  
  }  
  return {  
    floorData: new Float32Array(floorData),  
    wallData: new Float32Array(wallData),  
    stairsData: new Float32Array(stairsData),  
  };  
}  
  
export class World {  
  constructor(seed, gl, makeMesh) {  
    this.seed = seed;  
    this.gl = gl;  
    this.makeMesh = makeMesh;  
    this.chunks = new Map();  
  }  
  key(cx, cz) { return cx + "," + cz; }  
  
  getChunk(cx, cz) {  
    const k = this.key(cx, cz);  
    let c = this.chunks.get(k);  
    if (!c) {  
      c = {  
        cx, cz,  
        layers: generateChunkLayers(this.seed, cx, cz),  
        diff: {},                              // z-encoded localIndex -> tileValue  
        diffLoaded: false,  
        meshes: new Array(N_LAYERS).fill(null), // per-layer {floorMesh,wallMesh,stairsMesh}  
      };  
      this.chunks.set(k, c);  
      // async: apply saved diff over the baseline when it resolves (option A)  
      loadDiff(k).then((saved) => {  
        if (saved) {  
          for (const idx in saved) {  
            const i = +idx;  
            const z = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE));  
            c.layers[z][i - z * CHUNK_SIZE * CHUNK_SIZE] = saved[idx];  
          }  
          c.diff = saved;  
          c.meshes = new Array(N_LAYERS).fill(null); // force re-bake with diff applied  
        }  
        c.diffLoaded = true;  
      });  
    }  
    return c;  
  }  
  
  getTile(tx, tz, level) {  
    if (level < 0 || level >= N_LAYERS) return EMPTY;  
    const cx = Math.floor(tx / CHUNK_SIZE), cz = Math.floor(tz / CHUNK_SIZE);  
    const c = this.getChunk(cx, cz);  
    const lx = tx - cx * CHUNK_SIZE, lz = tz - cz * CHUNK_SIZE;  
    return c.layers[level][lz * CHUNK_SIZE + lx];  
  }  
  
  isSolid(tx, tz, level) { return this.getTile(tx, tz, level) === WALL; }  
  
  setTile(tx, tz, level, value) {  
    const cx = Math.floor(tx / CHUNK_SIZE), cz = Math.floor(tz / CHUNK_SIZE);  
    const c = this.getChunk(cx, cz);  
    const lx = tx - cx * CHUNK_SIZE, lz = tz - cz * CHUNK_SIZE;  
    const local = lz * CHUNK_SIZE + lx;  
    const idx = level * CHUNK_SIZE * CHUNK_SIZE + local;  
    c.layers[level][local] = value;  
    c.diff[idx] = value;  
    c.meshes[level] = null;              // re-bake only the changed layer  
    saveDiff(this.key(cx, cz), c.diff);  // fire-and-forget persist  
  }  
  
  ensureMesh(c) {  
    for (let z = 0; z < N_LAYERS; z++) {  
      if (c.meshes[z]) continue;  
      const { floorData, wallData, stairsData } = buildLayerMeshData(this, c, z);  
      c.meshes[z] = {  
        floorMesh: this.makeMesh(floorData),  
        wallMesh: this.makeMesh(wallData),  
        stairsMesh: this.makeMesh(stairsData),  
      };  
    }  
  }  
  
  update(px, pz, radius) {  
    const pcx = Math.floor(px / CHUNK_SIZE), pcz = Math.floor(pz / CHUNK_SIZE);  
    for (let dz = -radius; dz <= radius; dz++)  
      for (let dx = -radius; dx <= radius; dx++)  
        this.ensureMesh(this.getChunk(pcx + dx, pcz + dz));  
    for (const [k, c] of this.chunks)  
      if (Math.abs(c.cx - pcx) > radius + 1 || Math.abs(c.cz - pcz) > radius + 1) {  
        if (Object.keys(c.diff).length) saveDiff(k, c.diff);  
        this.chunks.delete(k); // (later: also delete GL buffers here)  
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

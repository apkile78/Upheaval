import { chunkRng, valueNoise2D } from "./rng.js";  
  
export const CHUNK_SIZE = 16;  
export const EMPTY = 0, FLOOR = 1, WALL = 2;  
  
// ---- deterministic tile generation for one chunk ----  
function generateChunkTiles(seed, cx, cz) {  
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);  
  const rng = chunkRng(seed, cx, cz);  
  const scale = 0.12; // lower = bigger building masses  
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {  
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {  
      const wx = cx * CHUNK_SIZE + lx, wz = cz * CHUNK_SIZE + lz;  
      const n = valueNoise2D(seed, wx * scale, wz * scale);  
      let t = n > 0.62 ? WALL : FLOOR;          // blobby building masses (noise)  
      if (t === FLOOR && rng() < 0.02) t = WALL; // scattered rubble (per-chunk PRNG)  
      tiles[lz * CHUNK_SIZE + lx] = t;  
    }  
  }  
  return tiles;  
}  
  
// ---- mesh face templates (vertex = pos(3), uv(2), shade(1)) ----  
const UV = [[0, 1], [1, 1], [1, 0], [0, 0]];  
const FLOOR_FACE = [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]]; // flat, y=0  
const TOP_FACE   = [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]]; // wall top, y=1  
const WALL_FACES = [  
  { dx: 1,  dz: 0,  shade: 0.75, c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] }, // +X  
  { dx: -1, dz: 0,  shade: 0.60, c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] }, // -X  
  { dx: 0,  dz: 1,  shade: 0.85, c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] }, // +Z  
  { dx: 0,  dz: -1, shade: 0.50, c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] }, // -Z  
];  
  
function pushFace(arr, ox, oy, oz, corners, shade) {  
  for (const [a, b, c] of [[0, 1, 2], [0, 2, 3]])  
    for (const i of [a, b, c]) {  
      const v = corners[i];  
      arr.push(ox + v[0], oy + v[1], oz + v[2], UV[i][0], UV[i][1], shade);  
    }  
}  
  
// Bake ONE mesh per chunk (floor + wall), only emitting wall faces exposed to non-wall.  
function buildChunkMeshData(world, chunk) {  
  const floor = [], wall = [];  
  const baseX = chunk.cx * CHUNK_SIZE, baseZ = chunk.cz * CHUNK_SIZE;  
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {  
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {  
      const t = chunk.tiles[lz * CHUNK_SIZE + lx];  
      if (t === EMPTY) continue;  
      const wx = baseX + lx, wz = baseZ + lz;  
      pushFace(floor, wx, 0.02, wz, FLOOR_FACE, 0.9);  
      if (t === WALL) {  
        pushFace(wall, wx, 0, wz, TOP_FACE, 1.0);  
        for (const f of WALL_FACES)  
          if (world.getTile(wx + f.dx, wz + f.dz) !== WALL)  
            pushFace(wall, wx, 0, wz, f.c, f.shade);  
      }  
    }  
  }  
  return { floorData: new Float32Array(floor), wallData: new Float32Array(wall) };  
}  
  
export class World {  
  constructor(seed, gl, makeMesh) {  
    this.seed = seed >>> 0;  
    this.gl = gl;  
    this.makeMesh = makeMesh;      // (Float32Array) => { vao, count }  
    this.chunks = new Map();       // "cx,cz" -> { cx, cz, tiles, floorMesh, wallMesh }  
  }  
  key(cx, cz) { return cx + "," + cz; }  
  
  getChunk(cx, cz) {  
    const k = this.key(cx, cz);  
    let c = this.chunks.get(k);  
    if (!c) {  
      c = { cx, cz, tiles: generateChunkTiles(this.seed, cx, cz), floorMesh: null, wallMesh: null };  
      this.chunks.set(k, c);  
    }  
    return c;  
  }  
  getTile(tx, tz) {  
    const cx = Math.floor(tx / CHUNK_SIZE), cz = Math.floor(tz / CHUNK_SIZE);  
    const c = this.getChunk(cx, cz);  
    const lx = tx - cx * CHUNK_SIZE, lz = tz - cz * CHUNK_SIZE;  
    return c.tiles[lz * CHUNK_SIZE + lx];  
  }  
  isSolid(tx, tz) { return this.getTile(Math.floor(tx), Math.floor(tz)) === WALL; }  
  
  ensureMesh(c) {  
    if (c.floorMesh) return;  
    const { floorData, wallData } = buildChunkMeshData(this, c);  
    c.floorMesh = this.makeMesh(floorData);  
    c.wallMesh = this.makeMesh(wallData);  
  }  
  
  // Load/mesh chunks in a radius; drop far ones. Call once per frame.  
  update(px, pz, radius) {  
    const pcx = Math.floor(px / CHUNK_SIZE), pcz = Math.floor(pz / CHUNK_SIZE);  
    for (let dz = -radius; dz <= radius; dz++)  
      for (let dx = -radius; dx <= radius; dx++)  
        this.ensureMesh(this.getChunk(pcx + dx, pcz + dz));  
    for (const [k, c] of this.chunks)  
      if (Math.abs(c.cx - pcx) > radius + 1 || Math.abs(c.cz - pcz) > radius + 1)  
        this.chunks.delete(k); // (later: also delete GL buffers here)  
  }  
  
  loadedChunks(px, pz, radius) {  
    const pcx = Math.floor(px / CHUNK_SIZE), pcz = Math.floor(pz / CHUNK_SIZE);  
    const out = [];  
    for (let dz = -radius; dz <= radius; dz++)  
      for (let dx = -radius; dx <= radius; dx++) {  
        const c = this.chunks.get(this.key(pcx + dx, pcz + dz));  
        if (c && c.floorMesh) out.push(c);  
      }  
    return out;  
  }  
}

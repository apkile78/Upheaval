import { cyrb53, mulberry32, valueNoise2D } from "./rng.js";  
  
const CHUNK = 32;   // keep in sync with CHUNK_SIZE in world.js  
  
// biome band at a chunk's center (matches generateChunkTiles thresholds)  
function biomeAt(seed, cx, cz) {  
  const wx = cx * CHUNK + CHUNK / 2, wz = cz * CHUNK + CHUNK / 2;  
  const b = valueNoise2D(seed, wx * 0.02, wz * 0.02);  
  if (b < 0.40) return "field";  
  if (b < 0.68) return "forest";  
  return "city";  
}  
  
// deterministic per-chunk roll, independent of chunkRng so worldgen edits don't shift it  
function cellRng(seed, cx, cz) {  
  return mulberry32(cyrb53(`bldg:${cx},${cz}`, seed));  
}  
  
// returns { id } for a building occupying this chunk cell, or null  
export function buildingAt(seed, cx, cz) {  
  if (biomeAt(seed, cx, cz) !== "city") return null;   // houses only in city for now  
  const r = cellRng(seed, cx, cz)();  
  return r < 0.5 ? { id: "house" } : null;              // ~half of city cells  
}  
  
// deterministic loot/mobs for a chunk — spawned once, never renewed  
export function chunkSpawns(seed, cx, cz) {  
  const bld = buildingAt(seed, cx, cz);  
  if (!bld) return [];  
  const rng = cellRng(seed, cx, cz);  
  const baseX = cx * CHUNK, baseZ = cz * CHUNK;  
  const out = [];  
  // one loot item near house center (level 0)  
  out.push({ kind: "item", id: rng() < 0.5 ? "apple" : "scrap",  
             x: baseX + CHUNK / 2 + 0.5, z: baseZ + CHUNK / 2 + 0.5, level: 0 });  
  return out;  
}

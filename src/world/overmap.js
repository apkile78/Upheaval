import { cyrb53, mulberry32, valueNoise2D } from "./rng.js";  
  
const CHUNK = 32;   // keep in sync with CHUNK_SIZE in world.js  
const R = 16;       // region size in chunks (smallest OK: holds a 7x13 base w/ margin)  
  
// generic, extensible schema — later this moves to buildings.json  
const BUILDINGS = {  
  house:   { cls: "city",  w: 1, h: 1,  chance: 0.5  },  
  milbase: { cls: "field", w: 7, h: 13, chance: 0.35, spacing: 5 },  
};  
  
export function biomeAt(seed, cx, cz) {  
  const wx = cx * CHUNK + CHUNK / 2, wz = cz * CHUNK + CHUNK / 2;  
  const b = valueNoise2D(seed, wx * 0.02, wz * 0.02);  
  if (b < 0.40) return "field";  
  if (b < 0.68) return "forest";  
  return "city";  
}  
  
function cellRng(seed, cx, cz)  { return mulberry32(cyrb53(`bldg:${cx},${cz}`, seed)); }  
function regRng(seed, rx, rz, s){ return mulberry32(cyrb53(`${s}:${rx},${rz}`, seed)); }  
  
// grid roads: arterials everywhere (connect regions), dense streets inside cities.  
// a grid is connective by construction, so every building touches the network.  
const ARTERIAL = 96, CITY_ST = 16;  
export function isRoadTile(wx, wz, biome) {  
  if (((wx % ARTERIAL) + ARTERIAL) % ARTERIAL === 0) return true;  
  if (((wz % ARTERIAL) + ARTERIAL) % ARTERIAL === 0) return true;  
  if (biome === "city") {  
    if (((wx % CITY_ST) + CITY_ST) % CITY_ST === 0) return true;  
    if (((wz % CITY_ST) + CITY_ST) % CITY_ST === 0) return true;  
  }  
  return false;  
}  
  
// does region (rx,rz) *want* a mil base, and where is its anchor chunk?  
function milbaseCandidate(seed, rx, rz) {  
  const def = BUILDINGS.milbase;  
  if (regRng(seed, rx, rz, "mb")() >= def.chance) return null;  
  const a = regRng(seed, rx, rz, "mba");  
  const ax = rx * R + Math.floor(a() * (R - def.w));  
  const az = rz * R + Math.floor(a() * (R - def.h));  
  if (biomeAt(seed, ax, az) !== "field") return null;   // fields only  
  return { ax, az, w: def.w, h: def.h, prio: a() };  
}  
  
// keep a candidate only if it outranks every candidate within `spacing` regions  
function milbaseFor(seed, rx, rz) {  
  const me = milbaseCandidate(seed, rx, rz);  
  if (!me) return null;  
  const S = BUILDINGS.milbase.spacing;  
  for (let dz = -S; dz <= S; dz++)  
    for (let dx = -S; dx <= S; dx++) {  
      if (!dx && !dz) continue;  
      const o = milbaseCandidate(seed, rx + dx, rz + dz);  
      if (o && o.prio > me.prio) return null;  
    }  
  return me;  
}  
  
// what building (if any) covers chunk (cx,cz)? returns slice offsets for multi-chunk  
export function buildingAt(seed, cx, cz) {  
  const rx = Math.floor(cx / R), rz = Math.floor(cz / R);  
  // mil-base footprint can cross a region border, so check this region + 8 neighbours  
  for (let dz = -1; dz <= 1; dz++)  
    for (let dx = -1; dx <= 1; dx++) {  
      const mb = milbaseFor(seed, rx + dx, rz + dz);  
      if (mb && cx >= mb.ax && cx < mb.ax + mb.w && cz >= mb.az && cz < mb.az + mb.h)  
        return { id: "milbase", w: mb.w, h: mb.h, sliceX: cx - mb.ax, sliceZ: cz - mb.az };  
    }  
  if (biomeAt(seed, cx, cz) === "city" && cellRng(seed, cx, cz)() < BUILDINGS.house.chance)  
    return { id: "house" };  
  return null;  
}  
  
// deterministic loot/mobs — spawned once, never renewed  
export function chunkSpawns(seed, cx, cz) {  
  const bld = buildingAt(seed, cx, cz);  
  if (!bld) return [];  
  const rng = cellRng(seed, cx, cz);  
  const bx = cx * CHUNK + CHUNK / 2 + 0.5, bz = cz * CHUNK + CHUNK / 2 + 0.5;  
  if (bld.id === "house")  
    return [{ kind: "item", id: rng() < 0.5 ? "apple" : "scrap", x: bx, z: bz, level: 0 }];  
  if (bld.id === "milbase" && bld.sliceX === 0 && bld.sliceZ === 0)   // anchor slice only  
    return [{ kind: "mob", id: "migo", x: bx, z: bz, level: 0 },  
            { kind: "item", id: "scrap", x: bx + 1, z: bz, level: 0 }];  
  return [];  
}

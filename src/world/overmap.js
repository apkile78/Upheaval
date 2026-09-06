import { cyrb53, mulberry32, valueNoise2D } from "./rng.js";  
  
const CHUNK = 32;   // keep in sync with CHUNK_SIZE in world.js  
const R = 16;       // region size in chunks (mil-base placement grid)  
  
// ---------- tunables ----------  
export const BIOME_FREQ = 0.006;   // base field/forest noise; lower = bigger patches  
const CITY_CHANCE   = 0.55;        // chance a region rolls a city candidate  
const CITY_SPACING  = 2;          // min regions between accepted cities  
const MAX_ROAD_DIST = 20;          // max regions apart two cities may be road-linked  
const ROAD_HALF     = 1.5;         // highway half-width in tiles (=> ~3 tiles wide)  
const CITY_ST       = 8;           // intra-city street spacing in tiles  
  
// generic, extensible schema — later this moves to buildings.json  
const BUILDINGS = {  
  house:   { cls: "city",  w: 1, h: 1,  chance: 0.5  },  
  milbase: { cls: "field", w: 7, h: 13, chance: 0.35, spacing: 5 },  
};  
  
function cellRng(seed, cx, cz)  { return mulberry32(cyrb53(`bldg:${cx},${cz}`, seed)); }  
function regRng(seed, rx, rz, s){ return mulberry32(cyrb53(`${s}:${rx},${rz}`, seed)); }  
  
// ---------- base terrain (before cities are carved in) ----------  
function underlyingForest(seed, cx, cz) {  
  const wx = cx * CHUNK + CHUNK / 2, wz = cz * CHUNK + CHUNK / 2;  
  return valueNoise2D(seed, wx * BIOME_FREQ, wz * BIOME_FREQ) >= 0.55;  
}  
  
// ---------- city nodes: one jittered candidate per region ----------  
function cityCandidate(seed, rx, rz) {  
  const r = regRng(seed, rx, rz, "city");  
  if (r() >= CITY_CHANCE) return null;  
  
  const cx = rx * R + Math.floor(r() * R);   // centre in chunk coords  
  const cz = rz * R + Math.floor(r() * R);  
  
  const big = r() < 0.12;                     // rare large city  
  const nBlobs = big ? 4 + Math.floor(r() * 7)    // 4..10 circles  
                     : 1 + Math.floor(r() * 4);   // 1..4 circles  
  const prio = r();  
  
  // only the largest cities may border forest; small ones need clear (field) land  
  if (underlyingForest(seed, cx, cz) && !big) return null;  
  
  const blobs = [];  
  for (let i = 0; i < nBlobs; i++) {  
    const rad = big ? 5 + Math.floor(r() * 8)     // 5..12 chunks  
                    : 3 + Math.floor(r() * 4);    // 3..6 chunks  
    const ang = r() * Math.PI * 2;  
    const off = i === 0 ? 0 : rad * (0.6 + r() * 0.8);   // overlap into a cluster  
    blobs.push({ x: cx + Math.cos(ang) * off, z: cz + Math.sin(ang) * off, rad });  
  }  
  return { cx, cz, blobs, prio };  
}  
  
// accept a city only if it outranks every candidate within CITY_SPACING regions  
function cityFor(seed, rx, rz) {  
  const me = cityCandidate(seed, rx, rz);  
  if (!me) return null;  
  for (let dz = -CITY_SPACING; dz <= CITY_SPACING; dz++)  
    for (let dx = -CITY_SPACING; dx <= CITY_SPACING; dx++) {  
      if (!dx && !dz) continue;  
      const o = cityCandidate(seed, rx + dx, rz + dz);  
      if (o && o.prio > me.prio) return null;  
    }  
  return me;  
}  
  
// deterministic -> memoize so window scans stay cheap  
const _cityCache = new Map();  
function cityForCached(seed, rx, rz) {  
  const k = rx + "," + rz;  
  let v = _cityCache.get(k);  
  if (v === undefined) { v = cityFor(seed, rx, rz); _cityCache.set(k, v); }  
  return v;  
}  
  
function nearbyCities(seed, cx, cz, pad) {  
  const rx = Math.floor(cx / R), rz = Math.floor(cz / R);  
  const out = [];  
  for (let dz = -pad; dz <= pad; dz++)  
    for (let dx = -pad; dx <= pad; dx++) {  
      const c = cityForCached(seed, rx + dx, rz + dz);  
      if (c) out.push(c);  
    }  
  return out;  
}  
  
// is chunk (cx,cz) inside any city blob? (blob reach < 2 regions, so pad=2)  
export function cityAt(seed, cx, cz) {  
  const cities = nearbyCities(seed, cx, cz, 2);  
  for (const c of cities)  
    for (const b of c.blobs) {  
      const dx = cx + 0.5 - b.x, dz = cz + 0.5 - b.z;  
      if (dx * dx + dz * dz <= b.rad * b.rad) return true;  
    }  
  return false;  
}  
  
// ---------- biome: cities carved into a field/forest base ----------  
export function biomeAt(seed, cx, cz) {  
  if (cityAt(seed, cx, cz)) return "city";  
  return underlyingForest(seed, cx, cz) ? "forest" : "field";  
}  
  
// ---------- roads: highways between cities + streets inside them ----------  
function pointSegDist2(px, pz, ax, az, bx, bz) {  
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;  
  let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;  
  t = Math.max(0, Math.min(1, t));  
  const qx = ax + t * dx, qz = az + t * dz;  
  const ex = px - qx, ez = pz - qz;  
  return ex * ex + ez * ez;  
}  
  
// build a per-chunk road predicate once; cheap per-tile afterwards  
export function buildRoadTester(seed, cx, cz) {  
  const pad = MAX_ROAD_DIST + 2;  
  const cities = nearbyCities(seed, cx, cz, pad);  
  
  // inter-city highway segments (endpoints in tile coords)  
  const maxD = MAX_ROAD_DIST * R;   // in chunks  
  const segs = [];  
  for (let i = 0; i < cities.length; i++)  
    for (let j = i + 1; j < cities.length; j++) {  
      const a = cities[i], b = cities[j];  
      const dx = a.cx - b.cx, dz = a.cz - b.cz;  
      if (dx * dx + dz * dz <= maxD * maxD)  
        segs.push([a.cx * CHUNK + CHUNK / 2, a.cz * CHUNK + CHUNK / 2,  
                   b.cx * CHUNK + CHUNK / 2, b.cz * CHUNK + CHUNK / 2]);  
    }  
  
  const H2 = ROAD_HALF * ROAD_HALF;  
  return function isRoad(wx, wz) {  
    for (const s of segs)  
      if (pointSegDist2(wx, wz, s[0], s[1], s[2], s[3]) <= H2) return true;  
    // street grid only inside a city blob  
    const px = wx / CHUNK, pz = wz / CHUNK;  
    for (const c of cities)  
      for (const b of c.blobs) {  
        const dx = px - b.x, dz = pz - b.z;  
        if (dx * dx + dz * dz <= b.rad * b.rad) {  
          if (((wx % CITY_ST) + CITY_ST) % CITY_ST === 0) return true;  
          if (((wz % CITY_ST) + CITY_ST) % CITY_ST === 0) return true;  
        }  
      }  
    return false;  
  };  
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
  
// what building (if any) covers chunk (cx,cz)?  
export function buildingAt(seed, cx, cz) {  
  const rx = Math.floor(cx / R), rz = Math.floor(cz / R);  
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

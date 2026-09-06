import { cyrb53, mulberry32, valueNoise2D } from "./rng.js";  
  
const CHUNK = 32;             // keep in sync with CHUNK_SIZE in world.js  
const R = 16;                 // region size in chunks  
  
// ---- tunables ----  
const CITY_SPACING  = 10;     // min regions between city centers  
const CITY_CHANCE   = 0.9;    // per-region roll BEFORE spacing thinning  
const MAX_ROAD_DIST = 20;     // regions; connect cities within this (double spacing)  
const MAX_BLOB_RAD  = 12;     // largest blob radius (chunks)  
const CLUSTER_MAX   = 16;     // max blob-center drift from city center (chunks)  
const ROAD_HALF     = 1;      // road half-width in tiles (=> 3 wide)  
const CITY_ST       = 16;     // intra-city street spacing (tiles)  
const CITY_REACH    = Math.ceil((CLUSTER_MAX + MAX_BLOB_RAD) / R) + 1;  
  
export const BIOME_FREQ = 0.006;  
  
const BUILDINGS = {  
  house:   { cls: "city",  w: 1, h: 1,  chance: 0.5  },  
  milbase: { cls: "field", w: 7, h: 13, chance: 0.35, spacing: 5 },  
};  
  
function cellRng(seed, cx, cz)  { return mulberry32(cyrb53(`bldg:${cx},${cz}`, seed)); }  
function regRng(seed, rx, rz, s){ return mulberry32(cyrb53(`${s}:${rx},${rz}`, seed)); }  
  
// underlying (city-free) land type at a chunk  
function underlyingForest(seed, cx, cz) {  
  const wx = cx * CHUNK + CHUNK / 2, wz = cz * CHUNK + CHUNK / 2;  
  return valueNoise2D(seed, wx * BIOME_FREQ, wz * BIOME_FREQ) >= 0.5;  
}  
  
// ---------- city nodes ----------  
function cityCandidate(seed, rx, rz) {  
  const r = regRng(seed, rx, rz, "cty");  
  if (r() >= CITY_CHANCE) return null;  
  const cx = rx * R + Math.floor(r() * R);  
  const cz = rz * R + Math.floor(r() * R);  
  return { rx, rz, cx, cz, prio: r() };  
}  
  
function cityBlobs(seed, node) {  
  const r = mulberry32(cyrb53(`blob:${node.rx},${node.rz}`, seed));  
  let n = 1 + Math.floor(r() * 4);              // common 1..4  
  if (r() < 0.12) n += 1 + Math.floor(r() * 6); // rare large -> up to ~10  
  const blobs = [];  
  for (let i = 0; i < n; i++) {  
    let rad = 3 + Math.floor(r() * 3);          // small 3..5  
    if (r() < 0.30) rad = 8 + Math.floor(r() * 5); // big 8..12  
    let ox = 0, oz = 0;  
    if (i > 0) {                                 // grow from an existing blob so they connect  
      const base = blobs[Math.floor(r() * i)];  
      const ang = r() * Math.PI * 2;  
      const dist = Math.floor((base.rad + rad) * (0.5 + r() * 0.4));  
      ox = (base.cx - node.cx) + Math.round(Math.cos(ang) * dist);  
      oz = (base.cz - node.cz) + Math.round(Math.sin(ang) * dist);  
      ox = Math.max(-CLUSTER_MAX, Math.min(CLUSTER_MAX, ox));  
      oz = Math.max(-CLUSTER_MAX, Math.min(CLUSTER_MAX, oz));  
    }  
    blobs.push({ cx: node.cx + ox, cz: node.cz + oz, rad });  
  }  
  return blobs;  
}  
  
const _cityCache = new Map();  
export function cityNode(seed, rx, rz) {  
  const k = `${seed}:${rx},${rz}`;  
  if (_cityCache.has(k)) return _cityCache.get(k);  
  let node = cityCandidate(seed, rx, rz);  
  if (node) {  
    const S = CITY_SPACING;  
    outer:  
    for (let dz = -S; dz <= S; dz++)  
      for (let dx = -S; dx <= S; dx++) {  
        if (!dx && !dz) continue;  
        const o = cityCandidate(seed, rx + dx, rz + dz);  
        if (o && o.prio > node.prio) { node = null; break outer; }  
      }  
  }  
  if (node) {  
    node.blobs = cityBlobs(seed, node);  
    node.large = node.blobs.length >= 5 || node.blobs.some(b => b.rad >= 8);  
    if (!node.large && underlyingForest(seed, node.cx, node.cz)) node = null; // small cities avoid forest  
  }  
  _cityCache.set(k, node);  
  return node;  
}  
  
export function cityAt(seed, cx, cz) {  
  const rx = Math.floor(cx / R), rz = Math.floor(cz / R);  
  for (let dz = -CITY_REACH; dz <= CITY_REACH; dz++)  
    for (let dx = -CITY_REACH; dx <= CITY_REACH; dx++) {  
      const node = cityNode(seed, rx + dx, rz + dz);  
      if (!node) continue;  
      for (const b of node.blobs) {  
        const ddx = cx - b.cx, ddz = cz - b.cz;  
        if (ddx * ddx + ddz * ddz <= b.rad * b.rad) return node;  
      }  
    }  
  return null;  
}  
  
// ---------- biome: cities nested inside a field/forest base ----------  
export function biomeAt(seed, cx, cz) {  
  if (cityAt(seed, cx, cz)) return "city";  
  return underlyingForest(seed, cx, cz) ? "forest" : "field";  
}  
  
// ---------- roads: connect city nodes within MAX_ROAD_DIST ----------  
function pointSegDist2(px, pz, ax, az, bx, bz) {  
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;  
  let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;  
  t = Math.max(0, Math.min(1, t));  
  const qx = ax + t * dx, qz = az + t * dz;  
  const ex = px - qx, ez = pz - qz;  
  return ex * ex + ez * ez;  
}  
  
// build a per-chunk road predicate once (cheap per-tile afterwards)  
export function buildRoadTester(seed, cx, cz) {  
  const isCity = biom
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

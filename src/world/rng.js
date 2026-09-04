// Minecraft-style seeding: string/number/blank -> deterministic 32-bit seed,  
// per-chunk PRNG, and a seamless value-noise field for terrain.  
  
// cyrb53: hash any string to a 32-bit integer.  
export function cyrb53(str, seed = 0) {  
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;  
  for (let i = 0; i < str.length; i++) {  
    const ch = str.charCodeAt(i);  
    h1 = Math.imul(h1 ^ ch, 2654435761);  
    h2 = Math.imul(h2 ^ ch, 1597334677);  
  }  
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);  
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);  
  return (h1 >>> 0);  
}  
  
// Turn whatever the player typed into a world seed.  
// - blank/null  -> random hidden seed  
// - number text -> used directly  
// - any text    -> hashed  
export function hashSeed(input) {  
  if (input === null || input === undefined || input === "") {  
    return (Math.floor(Math.random() * 0xffffffff)) >>> 0;  
  }  
  const asNum = Number(input);  
  if (Number.isFinite(asNum) && String(input).trim() !== "") {  
    return (asNum >>> 0);  
  }  
  return cyrb53(String(input));  
}  
  
// mulberry32: fast seeded PRNG -> function returning [0,1).  
export function mulberry32(a) {  
  return function () {  
    a |= 0; a = (a + 0x6D2B79F5) | 0;  
    let t = Math.imul(a ^ (a >>> 15), 1 | a);  
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;  
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;  
  };  
}  
  
// Deterministic per-chunk RNG from (worldSeed, cx, cz).  
export function chunkRng(worldSeed, cx, cz) {  
  const mixed = cyrb53(`${cx},${cz}`, worldSeed);  
  return mulberry32(mixed);  
}  
  
// Hash two ints -> [0,1), used by value noise.  
function hash2(seed, ix, iz) {  
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ seed;  
  h = Math.imul(h ^ (h >>> 13), 1274126177);  
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;  
}  
  
function smooth(t) { return t * t * (3 - 2 * t); }  
  
// Seamless 2D value noise sampled at world coords -> [0,1).  
export function valueNoise2D(seed, x, z) {  
  const x0 = Math.floor(x), z0 = Math.floor(z);  
  const fx = x - x0, fz = z - z0;  
  const v00 = hash2(seed, x0,     z0);  
  const v10 = hash2(seed, x0 + 1, z0);  
  const v01 = hash2(seed, x0,     z0 + 1);  
  const v11 = hash2(seed, x0 + 1, z0 + 1);  
  const sx = smooth(fx), sz = smooth(fz);  
  const a = v00 + (v10 - v00) * sx;  
  const b = v01 + (v11 - v01) * sx;  
  return a + (b - a) * sz;  
}

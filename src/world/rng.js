// cyrb53 string hash -> integer. Text, numbers, anything works.  
export function cyrb53(str, seed = 0) {  
  str = String(str);  
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;  
  for (let i = 0; i < str.length; i++) {  
    const ch = str.charCodeAt(i);  
    h1 = Math.imul(h1 ^ ch, 2654435761);  
    h2 = Math.imul(h2 ^ ch, 1597334677);  
  }  
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);  
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);  
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);  
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);  
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);  
}  
  
// Minecraft-style: blank -> random hidden seed; text/number -> deterministic 32-bit seed.  
export function hashSeed(input) {  
  if (input === undefined || input === null || String(input).trim() === "") {  
    return (Math.random() * 0x100000000) >>> 0;  
  }  
  return cyrb53(String(input).trim()) >>> 0; // reduce to uint32 for JS-safe math  
}  
  
// mulberry32: one 32-bit seed -> deterministic stream of floats in [0,1).  
export function mulberry32(a) {  
  return function () {  
    a |= 0; a = (a + 0x6d2b79f5) | 0;  
    let t = Math.imul(a ^ (a >>> 15), 1 | a);  
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;  
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;  
  };  
}  
  
// Mix world seed with chunk coords -> per-chunk seed, then a PRNG.  
export function chunkSeed(worldSeed, cx, cz) {  
  let h = worldSeed >>> 0;  
  h = Math.imul(h ^ (cx | 0), 2654435761);  
  h = Math.imul(h ^ (cz | 0), 2246822507);  
  h ^= h >>> 15;  
  return h >>> 0;  
}  
export function chunkRng(worldSeed, cx, cz) {  
  return mulberry32(chunkSeed(worldSeed, cx, cz));  
}  
  
// Seamless value noise sampled at WORLD coords (no chunk seams).  
function hash2i(seed, x, z) {  
  let h = seed >>> 0;  
  h = Math.imul(h ^ (x | 0), 374761393);  
  h = Math.imul(h ^ (z | 0), 668265263);  
  h ^= h >>> 15;  
  return (h >>> 0) / 4294967296;  
}  
export function valueNoise2D(seed, x, z) {  
  const x0 = Math.floor(x), z0 = Math.floor(z);  
  const fx = x - x0, fz = z - z0;  
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);  
  const n00 = hash2i(seed, x0, z0),     n10 = hash2i(seed, x0 + 1, z0);  
  const n01 = hash2i(seed, x0, z0 + 1), n11 = hash2i(seed, x0 + 1, z0 + 1);  
  const nx0 = n00 + (n10 - n00) * sx;  
  const nx1 = n01 + (n11 - n01) * sx;  
  return nx0 + (nx1 - nx0) * sz;  
}

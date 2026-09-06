import { hashSeed } from "./world/rng.js";  
import { World } from "./world/world.js";  
import { gl, makeMesh } from "./gl/renderer.js";  
  
export const worldSeed = hashSeed(new URLSearchParams(location.search).get("seed"));  
export const world = new World(worldSeed, gl, makeMesh);  
export const player = { x: 0.5, z: 0.5, level: 0, speed: 4, r: 0.3, hp: 100, maxHp: 100, hurtCd: 0, dead: false, hunger: 100, thirst: 100 };

export function collides(x, z, level, r) {  
  for (let tz = Math.floor(z - r); tz <= Math.floor(z + r); tz++)  
    for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++)  
      if (world.isSolid(tx, tz, level)) return true;  
  return false;  
}  
  
export const player = { x: 0.5, z: 0.5, level: 0, speed: 4, r: 0.3, hp: 100, maxHp: 100, hurtCd: 0, dead: false };  
// nudge spawn to first open tile so we don't start inside a wall  
for (let i = 0; i < 4096 && collides(player.x, player.z, player.level, player.r); i++) {  
  player.x += 1;  
  if (player.x > 64) { player.x = 0.5; player.z += 1; }  
}  
  
export const inventory = [];

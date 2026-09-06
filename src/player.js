import { hashSeed } from "./world/rng.js";  
import { World } from "./world/world.js";  
import { gl, makeMesh } from "./gl/renderer.js";  
  
export const worldSeed = hashSeed(new URLSearchParams(location.search).get("seed"));  
export const world = new World(worldSeed, gl, makeMesh);  
export const player = { x: 0.5, z: 0.5, level: 0, speed: 4, r: 0.3, hp: 100, maxHp: 100, hurtCd: 0, dead: false, hunger: 100, maxHunger: 100, thirst: 100, maxThirst: 100, stairCd: 0 };

export function collides(x, z, level, r) {  
  for (let tz = Math.floor(z - r); tz <= Math.floor(z + r); tz++)  
    for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++)  
      if (world.isSolid(tx, tz, level)) return true;  
  return false;  
}  
  
// nudge spawn to first open tile so we don't start inside a wall  
// nudge spawn to an open tile whose 4 neighbors are also open (no tree box)  
function spawnOk(x, z) {  
  if (collides(x, z, player.level, player.r)) return false;  
  const tx = Math.floor(x), tz = Math.floor(z);  
  return !world.isSolid(tx + 1, tz, player.level)  
      && !world.isSolid(tx - 1, tz, player.level)  
      && !world.isSolid(tx, tz + 1, player.level)  
      && !world.isSolid(tx, tz - 1, player.level);  
}  
for (let i = 0; i < 8192 && !spawnOk(player.x, player.z); i++) {  
  player.x += 1;  
  if (player.x > 128) { player.x = 0.5; player.z += 1; }  
}
  
export const inventory = [];

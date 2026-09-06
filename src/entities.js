import { player, collides, inventory } from "./player.js";  
  
export const entities = [];  
  
export function spawnItem(x, z, level, itemId) {  
  entities.push({ kind: "item", x, z, level, itemId, r: 0.25 });  
}  
export function spawnMob(x, z, level, mobId) {  
  const def = MONSTERS.data[mobId];  
  entities.push({ kind: "mob", x, z, level, mobId, r: 0.3, hp: def.hp, speed: def.speed, dmg: def.dmg });  
}

export function spawnFollower(x, z, level) {  
  entities.push({ kind: "follower", x, z, level, r: 0.3, speed: 3.5 });  
}  

export const MONSTERS = {};  
export const ITEMS = {};  
  
export async function loadData() {  
  MONSTERS.data = await (await fetch("./src/data/monsters.json")).json();  
  ITEMS.data    = await (await fetch("./src/data/items.json")).json();  
}

const ATTACK_RANGE = 1.2;  
const ATTACK_DMG = 5;  
export function attack() {  
  let best = -1, bestD = ATTACK_RANGE * ATTACK_RANGE;  
  for (let i = 0; i < entities.length; i++) {  
    const e = entities[i];  
    if (e.kind !== "mob" || e.level !== player.level) continue;  
    const d = (e.x - player.x) ** 2 + (e.z - player.z) ** 2;  
    if (d < bestD) { bestD = d; best = i; }  
  }  
  if (best >= 0) {  
    const e = entities[best];  
    e.hp -= ATTACK_DMG;  
    if (e.hp <= 0) entities.splice(best, 1);  
  }  
}  

export function useItem(id) {  
  const idx = inventory.indexOf(id);  
  if (idx < 0) return;  
  const def = ITEMS.data[id];  
  if (!def) return;  
  let used = false;  
  if (def.food)  { player.hunger = Math.min(player.maxHunger, player.hunger + def.food); used = true; }  
  if (def.water) { player.thirst = Math.min(player.maxThirst, player.thirst + def.water); used = true; }  
  if (def.heal)  { player.hp     = Math.min(player.maxHp,     player.hp     + def.heal);  used = true; }  
  if (used) inventory.splice(idx, 1);   // consume one  
}

function handleDeath() {  
  // find nearest follower on the same floor to possess  
  let best = -1, bestD = Infinity;  
  for (let i = 0; i < entities.length; i++) {  
    const e = entities[i];  
    if (e.kind !== "follower" || e.level !== player.level) continue;  
    const d = (e.x - player.x) ** 2 + (e.z - player.z) ** 2;  
    if (d < bestD) { bestD = d; best = i; }  
  }  
  if (best >= 0) {  
    const f = entities[best];  
    player.x = f.x; player.z = f.z; player.level = f.level;  
    player.hp = player.maxHp; player.hurtCd = 1.0;   // brief grace after swap  
    entities.splice(best, 1);   // that follower is now "you"  
  } else {  
    player.dead = true;   // no one left to control -> real game over  
  }  
}  
  
// item pickup + mob chase + contact damage  
export function updateEntities(dt) {  
  // pickup: walk over an item on your floor to collect it  
  for (let i = entities.length - 1; i >= 0; i--) {  
    const e = entities[i];  
    if (e.kind !== "item" || e.level !== player.level) continue;  
    const d2 = (e.x - player.x) ** 2 + (e.z - player.z) ** 2;  
    if (d2 < (player.r + e.r) ** 2) {  
      inventory.push(e.itemId);   // everything goes to inventory; consume later with E  
      entities.splice(i, 1);  
    }
  }

    // survival: hunger/thirst drain over time; empty ones chip hp  
  player.hunger = Math.max(0, player.hunger - 0.5 * dt);  
  player.thirst = Math.max(0, player.thirst - 0.7 * dt);  
  if (player.hunger <= 0) player.hp -= 2 * dt;  
  if (player.thirst <= 0) player.hp -= 2 * dt;  
  if (player.hp <= 0) { player.hp = 0; handleDeath(); }
    
  }  
  
  // mobs: chase the player on the same floor  
  for (const e of entities) {  
    if (e.kind !== "mob" || e.level !== player.level) continue;  
    let mx = player.x - e.x, mz = player.z - e.z;  
    const md = Math.hypot(mx, mz);  
    if (md > 0.001) {  
      mx /= md; mz /= md;  
      const mstep = e.speed * dt;  
      const nx = e.x + mx * mstep;  
      if (!collides(nx, e.z, e.level, e.r)) e.x = nx;  
      const nz = e.z + mz * mstep;  
      if (!collides(e.x, nz, e.level, e.r)) e.z = nz;  
    }  
    // contact damage  
    if (md < e.r + player.r + 0.05 && player.hurtCd <= 0) {  
      player.hp -= e.dmg;;  
      player.hurtCd = 0.6;   // seconds between bites  
      if (player.hp <= 0) {  
        player.hp = 0;  
        handleDeath();  
      }  
    }  
  }  

import * as m4 from "./math/mat4.js";  
import { CHUNK_SIZE, STAIRS, loadBuildings } from "./world/world.js";  
import { beginFrame, setViewProj, draw, quad, floorTex, wallTex, whiteTex } from "./gl/renderer.js";  
import { player, world, collides, worldSeed, inventory } from "./player.js";  
import { cameraEye } from "./camera.js";  
import { keys, invOpen, invSel, omOpen } from "./input.js";
import { entities, spawnItem, spawnMob, spawnFollower, attack, updateEntities, loadData, MONSTERS, ITEMS } from "./entities.js";  
import { chunkSpawns, buildingAt, biomeAt } from "./world/overmap.js";
const RADIUS = 3;  
const LAYER_H = 1.0;    // vertical spacing between floors  
const BAND_BELOW = 2;   // floors below current one to draw (dimmed)    

const hud = document.getElementById("hud");  
let omPanX = 0, omPanZ = 0;

const spawnedChunks = new Set();  
function spawnChunkEntities(c) {  
  const key = c.cx + "," + c.cz;  
  if (spawnedChunks.has(key)) return;   // already spawned -> never again  
  spawnedChunks.add(key);  
  for (const s of chunkSpawns(worldSeed, c.cx, c.cz)) {  
    if (s.kind === "item") spawnItem(s.x, s.z, s.level, s.id);  
    else if (s.kind === "mob") spawnMob(s.x, s.z, s.level, s.id);  
  }  
}

// ---------- update ----------  
function update(dt) {  
  if (player.dead) return;  
  if (player.hurtCd > 0) player.hurtCd -= dt;  
  
  updateEntities(dt);  
  
  if (omOpen) {                       // map open: arrows pan, player frozen  
    const pan = 20 * dt;              // chunks/sec  
    if (keys["ArrowUp"]    || keys["KeyW"]) omPanZ -= pan;  
    if (keys["ArrowDown"]  || keys["KeyS"]) omPanZ += pan;  
    if (keys["ArrowLeft"]  || keys["KeyA"]) omPanX -= pan;  
    if (keys["ArrowRight"] || keys["KeyD"]) omPanX += pan;  
    return;                          // no player movement/stairs while map open  
  }
  
  let dx = 0, dz = 0;  
  if (keys["KeyW"] || keys["ArrowUp"])    dz -= 1;  
  if (keys["KeyS"] || keys["ArrowDown"])  dz += 1;  
  if (keys["KeyA"] || keys["ArrowLeft"])  dx -= 1;  
  if (keys["KeyD"] || keys["ArrowRight"]) dx += 1;  
  
  if (dx || dz) {  
    const len = Math.hypot(dx, dz);  
    dx /= len; dz /= len;  
    const step = player.speed * dt;  
    const nx = player.x + dx * step;  
    if (!collides(nx, player.z, player.level, player.r)) player.x = nx;  
    const nz = player.z + dz * step;  
    if (!collides(player.x, nz, player.level, player.r)) player.z = nz;  
  }  
  // stairs: stepping onto a STAIRS tile moves you between the connected floors  
  if (player.stairCd > 0) player.stairCd -= dt;  
  const here = world.getTile(Math.floor(player.x), Math.floor(player.z), player.level);  
  if (here === STAIRS && player.stairCd <= 0) {  
    const up   = world.getTile(Math.floor(player.x), Math.floor(player.z), player.level + 1);  
    const down = world.getTile(Math.floor(player.x), Math.floor(player.z), player.level - 1);  
    if (up === STAIRS)      { player.level += 1; player.stairCd = 0.5; }  
    else if (down === STAIRS){ player.level -= 1; player.stairCd = 0.5; }  
  }
}  
  
// ---------- render ----------  
function render() {  
  beginFrame();  
  
  const baseY = player.level * LAYER_H;  
  const center = [player.x, baseY + 0.5, player.z];  
  const eye = cameraEye(center);  
  const proj = m4.perspective(Math.PI / 4, innerWidth / innerHeight, 0.1, 100);  
  const view = m4.lookAt(eye, center, [0, 1, 0]);  
  setViewProj(m4.multiply(proj, view));  
  
  // stream + draw a depth band  
  world.update(player.x, player.z, RADIUS); 
  
  const chunks = world.loadedChunks(player.x, player.z, RADIUS);  
  for (const c of chunks) spawnChunkEntities(c);
  
  const lo = Math.max(0, player.level - BAND_BELOW);  
  
  for (let L = lo; L <= player.level; L++) {  
    const yoff = L * LAYER_H;  
    const dim = Math.pow(0.55, player.level - L);  
    for (const c of chunks) {  
      const m = c.meshes[L];  
      if (!m) continue;  
      const xoff = c.cx * CHUNK_SIZE;  
      const zoff = c.cz * CHUNK_SIZE;  
      const model = [1,0,0,0, 0,1,0,0, 0,0,1,0, xoff, yoff, zoff, 1];  
      draw(m.floorMesh,  model, floorTex, [dim, dim, dim]);  
      draw(m.wallMesh,   model, wallTex,  [dim, dim, dim]);  
      if (L < player.level) draw(m.roofMesh, model, wallTex, [dim, dim, dim]);  
      draw(m.stairsMesh, model, whiteTex, [dim, dim * 0.9, 0.2]);  
      draw(m.furnMesh, model, whiteTex, [dim * 0.3, dim * 0.5, dim]);
      draw(m.roadMesh, model, whiteTex, [dim * 0.28, dim * 0.28, dim * 0.30]);
    }  

    
  }  
  
  // camera-facing billboard basis  
  const fwd = m4.norm(m4.sub(eye, center));  
  const right = m4.norm(m4.cross([0, 1, 0], fwd));  
  const up = m4.cross(fwd, right);  
  
  // world entities (items yellow, mobs green, followers blue)  
  for (const ent of entities) {  
    if (ent.level !== player.level) continue;  
    const isMob = ent.kind === "mob";  
    const isFollower = ent.kind === "follower";  
    const ew = (isMob || isFollower) ? 0.7 : 0.4;  
    const eh = (isMob || isFollower) ? 1.1 : 0.4;  
    const ey = ent.level * LAYER_H + ((isMob || isFollower) ? 0.55 : 0.25);  
    const tint = isMob  
      ? (MONSTERS.data[ent.mobId]?.tint || [0.3, 0.8, 0.3])  
      : isFollower ? [0.3, 0.5, 0.9] : [0.9, 0.85, 0.2];
    const bb = [  
      right[0]*ew, right[1]*ew, right[2]*ew, 0,  
      up[0]*eh,    up[1]*eh,    up[2]*eh,    0,  
      fwd[0],      fwd[1],      fwd[2],      0,  
      ent.x,       ey,          ent.z,       1,  
    ];  
    draw(quad, bb, whiteTex, tint);  
  }  
  
  // player billboard  
  const w = 0.7, h = 1.2, px = player.x, py = baseY + 0.6, pz = player.z;  
  const billboard = [  
    right[0]*w, right[1]*w, right[2]*w, 0,  
    up[0]*h,    up[1]*h,    up[2]*h,    0,  
    fwd[0],     fwd[1],     fwd[2],     0,  
    px,         py,         pz,         1,  
  ];  
  draw(quad, billboard, whiteTex, [0.9, 0.2, 0.7]);  
  
  hud.textContent = player.dead  
    ? `YOU DIED — no followers left. reload to restart.`  
    : `seed: ${worldSeed}  floor: ${player.level}  hp: ${Math.ceil(player.hp)}/${player.maxHp}  food: ${Math.round(player.hunger)}  water: ${Math.round(player.thirst)}  items: ${inventory.length}  (WASD move, LMB attack, right-drag orbit, wheel zoom)`;
    
  const inv = document.getElementById("inv");  
  if (invOpen) {  
    const counts = {};  
    for (const id of inventory) counts[id] = (counts[id] || 0) + 1;  
    const ids = Object.keys(counts);  
    const lines = ids.map((id, i) => {  
      const name = ITEMS.data[id] ? ITEMS.data[id].name : id;  
      return `${i === invSel ? "> " : "  "}${i + 1}. ${name} x${counts[id]}`;  
    });  
    inv.textContent = "INVENTORY (I close, 1-9 select, E use)\n\n" +  
      (lines.length ? lines.join("\n") : "(empty)");  
  }

  const om = document.getElementById("overmap");  
  if (omOpen) {  
    const pcx = Math.floor(player.x / CHUNK_SIZE), pcz = Math.floor(player.z / CHUNK_SIZE);  
    const pcx0 = Math.floor(player.x / CHUNK_SIZE), pcz0 = Math.floor(player.z / CHUNK_SIZE);
    const ccx = pcx + omPanX, ccz = pcz + omPanZ;   // view center = you + pan  
    const RAD = 20;                                  // bump for a bigger map  
    let s = "OVERMAP (M close, arrows pan)  @ you  H house  M milbase  # city  ^ forest  . field\n\n";  
    for (let dz = -RAD; dz <= RAD; dz++) {  
      let row = "";  
      for (let dx = -RAD; dx <= RAD; dx++) {  
        const cx = ccx + dx, cz = ccz + dz;  
        if (cx === pcx && cz === pcz) { row += "@"; continue; }  
        const b = buildingAt(worldSeed, cx, cz);  
        if (b) { row += b.id === "milbase" ? "M" : "H"; continue; }  
        const bi = biomeAt(worldSeed, cx, cz);  
        row += bi === "city" ? "#" : bi === "forest" ? "^" : ".";  
      }  
    s += row + "\n";  
  }  
  om.textContent = s;  
}
}  
  
// ---------- fixed-timestep loop ----------  
const STEP = 1 / 60;  
let timeScale = 1;  
let acc = 0, last = performance.now();  
function frame(now) {  
  let dt = (now - last) / 1000; last = now;  
  if (dt > 0.25) dt = 0.25;  
  acc += dt * timeScale;  
  while (acc >= STEP) { update(STEP); acc -= STEP; }  
  render();  
  requestAnimationFrame(frame);  
}  

Promise.all([loadData(), loadBuildings()]).then(() => {  
  spawnFollower(player.x - 3, player.z, player.level);  
  spawnItem(player.x + 3, player.z + 1, player.level, "apple");  
  spawnItem(player.x + 4, player.z - 1, player.level, "water");
  spawnMob(player.x + 5, player.z + 3, player.level, "zombie");  
  requestAnimationFrame(frame);  
});

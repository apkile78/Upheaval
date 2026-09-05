import * as m4 from "./math/mat4.js";  
import { CHUNK_SIZE } from "./world/world.js";  
import { beginFrame, setViewProj, draw, quad, floorTex, wallTex, whiteTex } from "./gl/renderer.js";  
import { player, world, collides, worldSeed, inventory } from "./player.js";  
import { entities, spawnItem, spawnMob, spawnFollower, updateEntities } from "./entities.js";  
import { cameraEye } from "./camera.js";  
import { keys, invOpen } from "./input.js";  
  
const RADIUS = 3;  
const LAYER_H = 1.0;    // vertical spacing between floors  
const BAND_BELOW = 2;   // floors below current one to draw (dimmed)  
  
// initial spawns  
spawnFollower(player.x - 3, player.z, player.level);  
spawnItem(player.x + 2, player.z, player.level, "scrap");  
spawnMob(player.x + 5, player.z + 3, player.level, "zombie");  
  
const hud = document.getElementById("hud");  
  
// ---------- update ----------  
function update(dt) {  
  if (player.dead) return;  
  if (player.hurtCd > 0) player.hurtCd -= dt;  
  
  updateEntities(dt);  
  
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
    const tint = isMob ? [0.3, 0.8, 0.3] : isFollower ? [0.3, 0.5, 0.9] : [0.9, 0.85, 0.2];  
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
    : `seed: ${worldSeed}  floor: ${player.level}  hp: ${player.hp}/${player.maxHp}  items: ${inventory.length}  (WASD move, LMB attack, right-drag orbit, wheel zoom)`;

  const inv = document.getElementById("inv");  
  if (invOpen) {  
    const counts = {};  
    for (const id of inventory) counts[id] = (counts[id] || 0) + 1;  
    const lines = Object.entries(counts).map(([id, n]) => `${id} x${n}`);  
    inv.textContent = "INVENTORY (I to close)\n\n" +  
      (lines.length ? lines.join("\n") : "(empty)");  
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
requestAnimationFrame(frame);  
console.log("alive");

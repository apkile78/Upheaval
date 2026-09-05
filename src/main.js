import * as m4 from "./math/mat4.js";  
import { World, CHUNK_SIZE, FLOOR, STAIRS } from "./world/world.js";  
import { hashSeed } from "./world/rng.js";  
  
// ---------- WebGL2 context ----------  
const canvas = document.getElementById("game");  
const gl = canvas.getContext("webgl2");  
if (!gl) throw new Error("WebGL2 not supported");  
  
// ---------- shaders ----------  
const VERT = `#version 300 es  
layout(location=0) in vec3 a_pos;  
layout(location=1) in vec2 a_uv;  
layout(location=2) in float a_shade;  
uniform mat4 u_viewProj;  
uniform mat4 u_model;  
out vec2 v_uv;  
out float v_shade;  
void main() {  
  v_uv = a_uv;  
  v_shade = a_shade;  
  gl_Position = u_viewProj * u_model * vec4(a_pos, 1.0);  
}`;  
  
const FRAG = `#version 300 es  
precision mediump float;  
in vec2 v_uv;  
in float v_shade;  
uniform sampler2D u_tex;  
uniform vec3 u_tint;  
out vec4 outColor;  
void main() {  
  vec4 t = texture(u_tex, v_uv);  
  if (t.a < 0.5) discard;                 // billboard/sprite cutout  
  outColor = vec4(t.rgb * u_tint * v_shade, 1.0);  
}`;  
  
function compile(type, src) {  
  const s = gl.createShader(type);  
  gl.shaderSource(s, src);  
  gl.compileShader(s);  
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))  
    throw new Error(gl.getShaderInfoLog(s));  
  return s;  
}  
function makeProgram(vs, fs) {  
  const p = gl.createProgram();  
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));  
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));  
  gl.linkProgram(p);  
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))  
    throw new Error(gl.getProgramInfoLog(p));  
  return p;  
}  
const prog = makeProgram(VERT, FRAG);  
const U = {  
  viewProj: gl.getUniformLocation(prog, "u_viewProj"),  
  model: gl.getUniformLocation(prog, "u_model"),  
  tint: gl.getUniformLocation(prog, "u_tint"),  
  tex: gl.getUniformLocation(prog, "u_tex"),  
};  
  
// ---------- textures (procedural, gl.NEAREST for the 8-bit look) ----------  
function makeTexture(size, fill) {  
  const data = new Uint8Array(size * size * 4);  
  for (let y = 0; y < size; y++)  
    for (let x = 0; x < size; x++) {  
      const [r, g, b, a] = fill(x, y);  
      const i = (y * size + x) * 4;  
      data[i] = r; data[i+1] = g; data[i+2] = b; data[i+3] = a;  
    }  
  const tex = gl.createTexture();  
  gl.bindTexture(gl.TEXTURE_2D, tex);  
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);  
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);  
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);  
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);  
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);  
  return tex;  
}  
  
const floorTex = makeTexture(8, (x, y) => {  
  const c = ((x ^ y) & 1) ? 70 : 55;  
  return [c, c + 8, c, 255];  
});  
const wallTex = makeTexture(8, (x, y) => {  
  const edge = (x === 0 || y === 0 || x === 7 || y === 7);  
  return edge ? [90, 70, 60, 255] : [130, 110, 95, 255];  
});  
const whiteTex = makeTexture(2, () => [255, 255, 255, 255]);  
  
// ---------- mesh helpers (format: pos3, uv2, shade1 = 6 floats) ----------  
function makeMesh(floatArray) {  
  const vao = gl.createVertexArray();  
  gl.bindVertexArray(vao);  
  const vbo = gl.createBuffer();  
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);  
  gl.bufferData(gl.ARRAY_BUFFER, floatArray, gl.STATIC_DRAW);  
  const STRIDE = 6 * 4;  
  gl.enableVertexAttribArray(0);  
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE, 0);  
  gl.enableVertexAttribArray(1);  
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE, 3 * 4);  
  gl.enableVertexAttribArray(2);  
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, STRIDE, 5 * 4);  
  gl.bindVertexArray(null);  
  return { vao, count: floatArray.length / 6 };  
}  
  
// a single quad used for the player billboard (unit square in XY, facing +Z)  
const quad = makeMesh(new Float32Array([  
  -0.5, -0.5, 0, 0, 1, 1,  
   0.5, -0.5, 0, 1, 1, 1,  
   0.5,  0.5, 0, 1, 0, 1,  
  -0.5, -0.5, 0, 0, 1, 1,  
   0.5,  0.5, 0, 1, 0, 1,  
  -0.5,  0.5, 0, 0, 0, 1,  
]));  
  
function draw(mesh, model, tex, tint) {  
  if (!mesh || !mesh.count) return;  
  gl.bindVertexArray(mesh.vao);  
  gl.uniformMatrix4fv(U.model, false, new Float32Array(model));  
  gl.uniform3fv(U.tint, tint);  
  gl.bindTexture(gl.TEXTURE_2D, tex);  
  gl.drawArrays(gl.TRIANGLES, 0, mesh.count);  
}  
  
// ---------- world + player ----------  
const worldSeed = hashSeed(new URLSearchParams(location.search).get("seed"));  
const world = new World(worldSeed, gl, makeMesh);  
const RADIUS = 3;  
const LAYER_H = 1.0;    // vertical spacing between floors  
const BAND_BELOW = 2;   // floors below current one to draw (dimmed)  
  
function collides(x, z, level, r) {  
  for (let tz = Math.floor(z - r); tz <= Math.floor(z + r); tz++)  
    for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++)  
      if (world.isSolid(tx, tz, level)) return true;  
  return false;  
}  
  
const player = { x: 0.5, z: 0.5, level: 0, speed: 4, r: 0.3, hp: 100, maxHp: 100, hurtCd: 0, dead: false };  
// nudge spawn to the first open ground tile so we don't start inside a wall  
for (let i = 0; i < 4096 && collides(player.x, player.z, player.level, player.r); i++) {  
  player.x += 1;  
  if (player.x > 64) { player.x = 0.5; player.z += 1; }  
}  
  
// ---------- entities ----------  
// every entity has: kind, x, z, level, and kind-specific fields.  
// items carry an itemId string so they slot into a JSON registry later with no refactor.  
const entities = [];  
function spawnItem(x, z, level, itemId) {  
  entities.push({ kind: "item", x, z, level, itemId, r: 0.25 });  
}  
function spawnMob(x, z, level, mobId) {  
  entities.push({ kind: "mob", x, z, level, mobId, r: 0.3, hp: 10, speed: 1.5 });  
}  
function spawnFollower(x, z, level) {  
  entities.push({ kind: "follower", x, z, level, r: 0.3, speed: 3.5 });  
}  
  
const inventory = [];   // array of itemId strings for now  
  
// drop one test item two tiles in front of spawn so there's something to pick up  
spawnItem(player.x + 2, player.z, player.level, "scrap");  
// spawn one test zombie a few tiles away so there's something that moves  
spawnMob(player.x + 5, player.z + 3, player.level, "zombie");  
// spawn one follower so death has a body to possess (permadeath spine)  
spawnFollower(player.x - 3, player.z, player.level);  
  
// ---------- camera (orbit) ----------  
let camYaw = Math.PI / 4;   // horizontal angle  
let camPitch = 0.9;         // vertical angle (clamped so we never go under ground/char)  
let camDist = 12;           // zoom distance  
const PITCH_MIN = 0.25;     // ~14 deg above horizon, so we can't look up under the char  
const PITCH_MAX = 1.45;     // ~83 deg, nearly top-down but never straight down  
const DIST_MIN = 4, DIST_MAX = 40;  
const SENS = 0.005;  
  
// ---------- input ----------  
const keys = {};  
addEventListener("keydown", (e) => { keys[e.code] = true; });  
addEventListener("keyup",   (e) => { keys[e.code] = false; });  
addEventListener("mousedown", (e) => {  
  if (e.button !== 0) return;   // left click = attack  
  attack();  
});  
  
// right-drag to orbit  
let dragging = false;  
canvas.addEventListener("contextmenu", (e) => e.preventDefault());  
canvas.addEventListener("mousedown", (e) => { if (e.button === 2) dragging = true; });  
addEventListener("mouseup",   (e) => { if (e.button === 2) dragging = false; });  
addEventListener("mousemove", (e) => {  
  if (!dragging) return;  
  camYaw   -= e.movementX * SENS;  
  camPitch += e.movementY * SENS;   // inverted: drag down -> look down  
  camPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, camPitch));  
});  
// wheel to zoom  
canvas.addEventListener("wheel", (e) => {  
  e.preventDefault();  
  camDist += e.deltaY * 0.01;  
  camDist = Math.max(DIST_MIN, Math.min(DIST_MAX, camDist));  
}, { passive: false });  
  
// ---------- combat ----------  
const ATTACK_RANGE = 1.2;  
const ATTACK_DMG = 5;  
function attack() {  
  if (player.dead) return;  
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
    // possess: move the controlled body onto the follower, keep all refs intact  
    const f = entities[best];  
    player.x = f.x; player.z = f.z; player.level = f.level;  
    player.hp = player.maxHp; player.hurtCd = 1.0;  // brief grace after swap  
    entities.splice(best, 1);   // that follower is now "you"  
  } else {  
    player.dead = true;   // no one left to control -> real game over  
  }  
}  
  
// ---------- fixed-timestep loop ----------  
const STEP = 1 / 60;  
let timeScale = 1;   // future: speed up crafting/sleeping  
let acc = 0, last = performance.now();  
  
function update(dt) {  
  if (player.dead) return;  
  if (player.hurtCd > 0) player.hurtCd -= dt;  
  
  let dx = 0, dz = 0;  
  if (keys["KeyW"] || keys["ArrowUp"])    dz -= 1;  
  if (keys["KeyS"] || keys["ArrowDown"])  dz += 1;  
  if (keys["KeyA"] || keys["ArrowLeft"])  dx -= 1;  
  if (keys["KeyD"] || keys["ArrowRight"]) dx += 1;  
  
  // pickup: walk over an item on your floor to collect it  
  for (let i = entities.length - 1; i >= 0; i--) {  
    const e = entities[i];  
    if (e.kind !== "item" || e.level !== player.level) continue;  
    const d2 = (e.x - player.x) ** 2 + (e.z - player.z) ** 2;  
    if (d2 < (player.r + e.r) ** 2) {  
      inventory.push(e.itemId);  
      entities.splice(i, 1);  
    }  
  }  
  
  // mobs: chase the player on the same floor (per-axis collision so they slide on walls)  
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
    // contact damage: if touching the player and cooldown is up, bite  
    if (md < e.r + player.r + 0.05 && player.hurtCd <= 0) {  
      player.hp -= 8;  
      player.hurtCd = 0.6;   // seconds between bites  
      if (player.hp <= 0) {  
        player.hp = 0;  
        handleDeath();  
      }  
    }  
  }  
  
  if (dx || dz) {  
    const len = Math.hypot(dx, dz);  
    dx /= len; dz /= len;  
    const step = player.speed * dt;  
    // per-axis AABB-vs-tile collision so we slide along walls  
    const nx = player.x + dx * step;  
    if (!collides(nx, player.z, player.level, player.r)) player.x = nx;  
    const nz = player.z + dz * step;  
    if (!collides(player.x, nz, player.level, player.r)) player.z = nz;  
  }  
}  
  
function resize() {  
  const w = canvas.clientWidth, h = canvas.clientHeight;  
  if (canvas.width !== w || canvas.height !== h) {  
    canvas.width = w; canvas.height = h;  
  }  
}  
  
const hud = document.getElementById("hud");  
  
function render() {  
  resize();  
  gl.viewport(0, 0, canvas.width, canvas.height);  
  gl.enable(gl.DEPTH_TEST);  
  gl.clearColor(0.07, 0.07, 0.09, 1);  
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);  
  gl.useProgram(prog);  
  gl.activeTexture(gl.TEXTURE0);  
  gl.uniform1i(U.tex, 0);  
  
  // orbit camera around the player, raised to the current floor  
  const baseY = player.level * LAYER_H;  
  const center = [player.x, baseY + 0.5, player.z];  
  const cp = Math.cos(camPitch), sp = Math.sin(camPitch);  
  const eye = [  
    center[0] + camDist * cp * Math.sin(camYaw),  
    center[1] + camDist * sp,  
    center[2] + camDist * cp * Math.cos(camYaw),  
  ];  
  const proj = m4.perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);  
  const view = m4.lookAt(eye, center, [0, 1, 0]);  
  gl.uniformMatrix4fv(U.viewProj, false, new Float32Array(m4.multiply(proj, view)));  
  
  // stream + draw a depth band (current floor + a couple below, dimmed)  
  world.update(player.x, player.z, RADIUS);  
  const chunks = world.loadedChunks(player.x, player.z, RADIUS);  
  const lo = Math.max(0, player.level - BAND_BELOW);  
  for (let L = lo; L <= player.level; L++) {  
    const yoff = L * LAYER_H;  
    const dim = Math.pow(0.55, player.level - L);          // lower floors darker  
    for (const c of chunks) {  
      const m = c.meshes[L];  
      if (!m) continue;  
      // per-chunk world offset: meshes are baked in LOCAL coords, so place  
      // each chunk at its grid position (X/Z) plus the layer height (Y)  
      const xoff = c.cx * CHUNK_SIZE;  
      const zoff = c.cz * CHUNK_SIZE;  
      const model = [1,0,0,0, 0,1,0,0, 0,0,1,0, xoff, yoff, zoff, 1];  
      draw(m.floorMesh,  model, floorTex, [dim, dim, dim]);  
      draw(m.wallMesh,   model, wallTex,  [dim, dim, dim]);  
      if (L < player.level) draw(m.roofMesh, model, wallTex, [dim, dim, dim]); // hide roof of current floor  
      draw(m.stairsMesh, model, whiteTex, [dim, dim * 0.9, 0.2]); // yellow = stairs  
    }  
  }  
  
  const fwd = m4.norm(m4.sub(eye, center));  
  const right = m4.norm(m4.cross([0, 1, 0], fwd));  
  const up = m4.cross(fwd, right);  
  
  // draw world entities (items, mobs, followers) as camera-facing billboards  
  for (const ent of entities) {  
    if (ent.level !== player.level) continue;  
    const isMob = ent.kind === "mob";  
    const isFollower = ent.kind === "follower";  
    const ew = (isMob || isFollower) ? 0.7 : 0.4;  
    const eh = (isMob || isFollower) ? 1.1 : 0.4;  
    const ey = ent.level * LAYER_H + ((isMob || isFollower) ? 0.55 : 0.25);  
    // green mob / blue follower / yellow item  
    const tint = isMob ? [0.3, 0.8, 0.3]  
               : isFollower ? [0.3, 0.5, 0.9]  
               : [0.9, 0.85, 0.2];  
    const bb = [  
      right[0]*ew, right[1]*ew, right[2]*ew, 0,  
      up[0]*eh,    up[1]*eh,    up[2]*eh,    0,  
      fwd[0],      fwd[1],      fwd[2],      0,  
      ent.x,       ey,          ent.z,       1,  
    ];  
    draw(quad, bb, whiteTex, tint);  
  }  
  
  // player billboard (always faces the camera)  
  const w = 0.7, h = 1.2, px = player.x, py = baseY + 0.6, pz = player.z;  
  const billboard = [  
    right[0]*w, right[1]*w, right[2]*w, 0,  
    up[0]*h,    up[1]*h,    up[2]*h,    0,  
    fwd[0],     fwd[1],     fwd[2],     0,  
    px,         py,         pz,         1,  
  ];  
  draw(quad, billboard, whiteTex, [0.9, 0.2, 0.7]);  
  
  // HUD  
  hud.textContent = player.dead  
    ? `YOU DIED — no followers left. reload to restart.`  
    : `seed: ${worldSeed}  floor: ${player.level}  hp: ${player.hp}/${player.maxHp}  items: ${inventory.length}  (WASD move, LMB attack, right-drag orbit, wheel zoom)`;  
}  
  
function frame(now) {  
  let dt = (now - last) / 1000; last = now;  
  if (dt > 0.25) dt = 0.25;   // clamp after tab-out so we don't spiral  
  acc += dt * timeScale;  
  while (acc >= STEP) { update(STEP); acc -= STEP; }  
  render();  
  requestAnimationFrame(frame);  
}  
requestAnimationFrame(frame);  
console.log("alive");

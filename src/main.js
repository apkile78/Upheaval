import * as m4 from "./math/mat4.js";  
import { World, CHUNK_SIZE, FLOOR } from "./world/world.js";  
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
  if (t.a < 0.5) discard;                 // billboard cutout  
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
const floorTex = makeTexture(16, (x, y) => {  
  const c = ((x ^ y) & 1) ? 90 : 70;  
  return [c, c, c + 6, 255];  
});  
const wallTex = makeTexture(16, (x, y) => {  
  const edge = (x === 0 || y === 0 || x === 15 || y === 15);  
  const c = edge ? 60 : 120;  
  return [c, c - 10, c - 20, 255];  
});  
const whiteTex = makeTexture(1, () => [255, 255, 255, 255]);  
  
// ---------- quad mesh (for player billboard) ----------  
function makeMeshFromData(data) {  
  const vao = gl.createVertexArray();  
  gl.bindVertexArray(vao);  
  const vbo = gl.createBuffer();  
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);  
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);  
  const stride = 6 * 4; // pos(3) + uv(2) + shade(1)  
  gl.enableVertexAttribArray(0);  
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);  
  gl.enableVertexAttribArray(1);  
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 3 * 4);  
  gl.enableVertexAttribArray(2);  
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 5 * 4);  
  gl.bindVertexArray(null);  
  return { vao, count: data.length / 6 };  
}  
// makeMesh: passed into World so chunks can bake their own geometry  
function makeMesh(floatArray) {  
  return makeMeshFromData(new Float32Array(floatArray));  
}  
// unit quad centered at origin on XY, facing +Z, for billboards  
const quad = makeMeshFromData(new Float32Array([  
  //  x     y    z    u  v   shade  
  -0.5, -0.5, 0,   0, 1,  1,  
   0.5, -0.5, 0,   1, 1,  1,  
   0.5,  0.5, 0,   1, 0,  1,  
  -0.5, -0.5, 0,   0, 1,  1,  
   0.5,  0.5, 0,   1, 0,  1,  
  -0.5,  0.5, 0,   0, 0,  1,  
]));  
  
// ---------- world ----------  
const worldSeed = hashSeed(new URLSearchParams(location.search).get("seed"));  
const hud = document.getElementById("hud");  
if (hud) hud.textContent = "WASD move · R/F stairs up/down · G smash · seed: " + worldSeed;  
const world = new World(worldSeed, gl, makeMesh);  
const RADIUS = 3; // chunks loaded in each direction around the player  
  
// ---------- player ----------  
function collides(x, z, r) {  
  for (let tz = Math.floor(z - r); tz <= Math.floor(z + r); tz++)  
    for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++)  
      if (world.isSolid(tx, tz, player.level)) return true;  
  return false;  
}  
const player = { x: 0.5, z: 0.5, level: 0, speed: 4, r: 0.3 };  
// nudge spawn to the first open tile so we don't start inside a wall  
for (let i = 0; i < 4096 && collides(player.x, player.z, player.r); i++) {  
  player.x += 1;  
  if (player.x > 64) { player.x = 0.5; player.z += 1; }  
}  
  
// ---------- input ----------  
const keys = {};  
addEventListener("keydown", (e) => { keys[e.code] = true; });  
addEventListener("keyup",   (e) => { keys[e.code] = false; });  
  
// stairs: R = up, F = down (only when standing on a stairs tile)  
addEventListener("keydown", (e) => {  
  const tx = Math.floor(player.x), tz = Math.floor(player.z);  
  if (world.getTile(tx, tz, player.level) === /* STAIRS */ 3) {  
    if (e.code === "KeyR" && player.level < world.maxLevel - 1) player.level++;  
    if (e.code === "KeyF" && player.level > 0) player.level--;  
  }  
});  
  
// wall-smash test key (verifies persistence): clear nearest solid tile  
addEventListener("keydown", (e) => {  
  if (e.code === "KeyG") {  
    const px = Math.floor(player.x), pz = Math.floor(player.z);  
    let best = null, bestD = Infinity;  
    for (let tz = pz - 1; tz <= pz + 1; tz++)  
      for (let tx = px - 1; tx <= px + 1; tx++)  
        if (world.isSolid(tx, tz, player.level)) {  
          const d = (tx + 0.5 - player.x) ** 2 + (tz + 0.5 - player.z) ** 2;  
          if (d < bestD) { bestD = d; best = [tx, tz]; }  
        }  
    if (best) world.setTile(best[0], best[1], player.level, FLOOR);  
  }  
});  
  
// ---------- fixed-timestep loop ----------  
const STEP = 1 / 60;  
let timeScale = 1;   // future: speed up crafting/sleeping  
let acc = 0, last = performance.now();  
  
function update(dt) {  
  let dx = 0, dz = 0;  
  if (keys["KeyW"] || keys["ArrowUp"])    dz -= 1;  
  if (keys["KeyS"] || keys["ArrowDown"])  dz += 1;  
  if (keys["KeyA"] || keys["ArrowLeft"])  dx -= 1;  
  if (keys["KeyD"] || keys["ArrowRight"]) dx += 1;  
  if (dx || dz) {  
    const len = Math.hypot(dx, dz);  
    dx = dx / len * player.speed * dt;  
    dz = dz / len * player.speed * dt;  
    // per-axis so we slide along walls instead of sticking  
    if (!collides(player.x + dx, player.z, player.r)) player.x += dx;  
    if (!collides(player.x, player.z + dz, player.r)) player.z += dz;  
  }  
}  
  
function resize() {  
  const w = canvas.clientWidth, h = canvas.clientHeight;  
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }  
}  
  
function draw(mesh, model, tex, tint) {  
  gl.bindVertexArray(mesh.vao);  
  gl.bindTexture(gl.TEXTURE_2D, tex);  
  gl.uniformMatrix4fv(U.model, false, new Float32Array(model));  
  gl.uniform3fv(U.tint, tint);  
  gl.drawArrays(gl.TRIANGLES, 0, mesh.count);  
}  
  
function render() {  
  resize();  
  gl.viewport(0, 0, canvas.width, canvas.height);  
  gl.enable(gl.DEPTH_TEST);  
  gl.clearColor(0.07, 0.07, 0.09, 1);  
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);  
  gl.useProgram(prog);  
  gl.activeTexture(gl.TEXTURE0);  
  gl.uniform1i(U.tex, 0);  
  
  const LAYER_H = 1.0;   // vertical spacing between floors  
  const BAND_BELOW = 2;  // how many floors below to draw  
  
  // fixed-angle camera that follows the player, raised to their floor  
  const baseY = player.level * LAYER_H;  
  const center = [player.x, baseY + 0.5, player.z];  
  const eye = [center[0] + 6, baseY + 9, center[2] + 6];  
  const proj = m4.perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);  
  const view = m4.lookAt(eye, center, [0, 1, 0]);  
  gl.uniformMatrix4fv(U.viewProj, false, new Float32Array(m4.multiply(proj, view)));  
  
  // stream + draw a depth band of layers (current floor + a couple below, dimmed)  
  world.update(player.x, player.z, RADIUS);  
  const chunks = world.loadedChunks(player.x, player.z, RADIUS);  
  const lo = Math.max(0, player.level - BAND_BELOW);  
  for (let L = lo; L <= player.level; L++) {  
    const yoff = L * LAYER_H;  
    const model = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,yoff,0,1]; // translate on Y  
    const dim = Math.pow(0.55, player.level - L);          // lower floors darker  
    for (const c of chunks) {  
      const m = c.meshes[L];  
      if (!m) continue;  
      if (m.floorMesh.count)  draw(m.floorMesh,  model, floorTex, [dim, dim, dim]);  
      if (m.wallMesh.count)   draw(m.wallMesh,   model, wallTex,  [dim, dim, dim]);  
      if (m.stairsMesh.count) draw(m.stairsMesh, model, whiteTex, [dim, dim * 0.9, 0.2]);  
    }  
  }  
  
  // player as a billboard that always faces the fixed camera  
  const fwd = m4.norm(m4.sub(eye, center));  
  const right = m4.norm(m4.cross([0, 1, 0], fwd));  
  const up = m4.cross(fwd, right);  
  const w = 0.7, h = 1.2, px = player.x, py = baseY + 0.6, pz = player.z;  
  const billboard = [  
    right[0]*w, right[1]*w, right[2]*w, 0,  
    up[0]*h,    up[1]*h,    up[2]*h,    0,  
    fwd[0],     fwd[1],     fwd[2],     0,  
    px,         py,         pz,         1,  
  ];  
  draw(quad, billboard, whiteTex, [0.9, 0.2, 0.7]);  
}  
  
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

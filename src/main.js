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
out vec3 v_world;  
void main() {  
  v_uv = a_uv;  
  v_shade = a_shade;  
  vec4 world = u_model * vec4(a_pos, 1.0);  
  v_world = world.xyz;  
  gl_Position = u_viewProj * world;  
}`;
  
const FRAG = `#version 300 es  
precision mediump float;  
in vec2 v_uv;  
in float v_shade;  
in vec3 v_world;  
uniform sampler2D u_tex;  
uniform vec3 u_tint;  
uniform float u_cutout;   // 1.0 for walls/roofs, 0.0 otherwise  
uniform vec3 u_eye;  
uniform vec3 u_target;    // player head position  
out vec4 outColor;  
void main() {  
  vec4 t = texture(u_tex, v_uv);  
  if (t.a < 0.5) discard;                 // billboard/sprite cutout  
  if (u_cutout > 0.5) {  
    vec3 ab = u_target - u_eye;  
    float k = clamp(dot(v_world - u_eye, ab) / dot(ab, ab), 0.0, 1.0);  
    vec3 closest = u_eye + k * ab;  
    // only fade fragments in FRONT of the player and near the eye->player line  
    if (k < 0.95 && distance(v_world, closest) < 1.1) {  
      ivec2 p = ivec2(gl_FragCoord.xy);  
      if (((p.x + p.y) & 1) == 0) discard;   // 50% checkerboard see-through  
    }  
  }  
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
  
function draw(mesh, model, tex, tint, cutout = 0) {  
  if (!mesh || !mesh.count) return;  
  gl.bindVertexArray(mesh.vao);  
  gl.uniformMatrix4fv(U.model, false, new Float32Array(model));  
  gl.uniform3fv(U.tint, tint);  
  gl.uniform1f(U.cutout, cutout);  
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
  
const player = { x: 0.5, z: 0.5, level: 0, speed: 4, r: 0.3 };  
// nudge spawn to the first open ground tile so we don't start inside a wall  
for (let i = 0; i < 4096 && collides(player.x, player.z, player.level, player.r); i++) {  
  player.x += 1;  
  if (player.x > 64) { player.x = 0.5; player.z += 1; }  
}  
  
// ---------- input ----------  
const keys = {};  

// ---------- orbit camera ----------  
let camYaw   = Math.PI / 4;   // matches your old diagonal default  
let camPitch = 0.9;           // radians above the horizon (~51°)  
let camDist  = 12;            // ~ hypot(6,9,6) from your old offset  
  
const PITCH_MIN = 0.15;       // just above horizon — never see under the ground  
const PITCH_MAX = 1.50;       // just under straight-down (π/2 ≈ 1.5708)

let dragging = false, lastX = 0, lastY = 0;  
addEventListener("contextmenu", (e) => e.preventDefault()); // so right-drag doesn't open menu  
addEventListener("mousedown", (e) => { if (e.button === 2) { dragging = true; lastX = e.clientX; lastY = e.clientY; } });  
addEventListener("mouseup",   (e) => { if (e.button === 2) dragging = false; });  
addEventListener("mousemove", (e) => {  
  if (!dragging) return;  
  camYaw   -= (e.clientX - lastX) * 0.005;  
  camPitch -= (e.clientY - lastY) * 0.005;  
  camPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, camPitch)); // the clamp  
  lastX = e.clientX; lastY = e.clientY;  
});  
addEventListener("wheel", (e) => {  
  camDist = Math.max(4, Math.min(30, camDist + Math.sign(e.deltaY)));  
}, { passive: true });

addEventListener("keydown", (e) => {  
  keys[e.code] = true;  
});  
addEventListener("keyup", (e) => { keys[e.code] = false; });

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
    dx /= len; dz /= len;  
    const step = player.speed * dt;  
    // per-axis AABB-vs-tile collision so we slide along walls  
  const nx = player.x + dx * step;  
    if (!collides(nx, player.z, player.level, player.r)) player.x = nx;  
    else console.log("blocked X", Math.floor(nx), Math.floor(player.z), "L", player.level);  
    const nz = player.z + dz * step;  
    if (!collides(player.x, nz, player.level, player.r)) player.z = nz;  
    else console.log("blocked Z", Math.floor(player.x), Math.floor(nz), "L", player.level);  
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
  gl.uniform3fv(U.eye, new Float32Array(eye));  
  gl.uniform3fv(U.target, new Float32Array([player.x, baseY + 1.0, player.z]));
  
  // camera

  const baseY  = player.level * LAYER_H;  
  const center = [player.x, baseY + 0.5, player.z];  
  
  const horiz = camDist * Math.cos(camPitch);   // horizontal reach  
  const vert  = camDist * Math.sin(camPitch);   // height above center  
  const eye = [  
    center[0] + horiz * Math.sin(camYaw),  
    center[1] + vert,  
    center[2] + horiz * Math.cos(camYaw),  
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
      draw(m.wallMesh,   model, wallTex,  [dim, dim, dim], 1);  
      if (L < player.level) draw(m.roofMesh, model, wallTex, [dim, dim, dim], 1);  
      draw(m.stairsMesh, model, whiteTex, [dim, dim * 0.9, 0.2]);  
    }  
  }
  
  // player billboard (always faces the fixed camera)  
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
  
  // HUD  
  hud.textContent = `seed: ${worldSeed}  floor: ${player.level}  (WASD move, R/F stairs, G smash)`;  
}  
  
// ---------- fixed-timestep loop ----------  
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

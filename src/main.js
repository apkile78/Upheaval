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
  if (t.a < 0.5) discard;                       // billboard transparency  
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
function makeProgram(vsrc, fsrc) {  
  const p = gl.createProgram();  
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vsrc));  
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsrc));  
  gl.linkProgram(p);  
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))  
    throw new Error(gl.getProgramInfoLog(p));  
  return p;  
}  
const prog = makeProgram(VERT, FRAG);  
const U = {  
  viewProj: gl.getUniformLocation(prog, "u_viewProj"),  
  model:    gl.getUniformLocation(prog, "u_model"),  
  tint:     gl.getUniformLocation(prog, "u_tint"),  
  tex:      gl.getUniformLocation(prog, "u_tex"),  
};  
  
// ---------- texture helper (8-bit: NEAREST, no smoothing) ----------  
function makeTexture(gl, pixels, w, h) {  
  const tex = gl.createTexture();  
  gl.bindTexture(gl.TEXTURE_2D, tex);  
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);  
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);  
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);  
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);  
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);  
  gl.bindTexture(gl.TEXTURE_2D, null);  
  return tex;  
}  
  
// ---------- mesh helpers ----------  
function makeMesh(data) {  
  const vao = gl.createVertexArray();  
  gl.bindVertexArray(vao);  
  const vbo = gl.createBuffer();  
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);  
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);  
  const stride = 6 * 4; // pos(3) + uv(2) + shade(1)  
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);  
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);  
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 20);  
  gl.bindVertexArray(null);  
  return { vao, count: data.length / 6 };  
}  
  
function quadMesh() {  
  const v = [[-.5,-.5,0],[.5,-.5,0],[.5,.5,0],[-.5,.5,0]];  
  const uv = [[0,1],[1,1],[1,0],[0,0]];  
  const d = [];  
  for (const [a,b,c] of [[0,1,2],[0,2,3]])  
    for (const i of [a,b,c]) d.push(v[i][0], v[i][1], v[i][2], uv[i][0], uv[i][1], 1.0);  
  return makeMesh(new Float32Array(d));  
}  
const quad = quadMesh();  
  
// ---------- textures (procedural 8-bit) ----------  
function genTex(w, h, fn) {  
  const p = new Uint8Array(w * h * 4);  
  for (let y = 0; y < h; y++)  
    for (let x = 0; x < w; x++) {  
      const [r, g, b, a] = fn(x, y);  
      const i = (y * w + x) * 4;  
      p[i]=r; p[i+1]=g; p[i+2]=b; p[i+3]=a;  
    }  
  return makeTexture(gl, p, w, h);  
}  
const floorTex = genTex(8, 8, (x, y) => ((x + y) & 1 ? [90,90,95,255] : [70,70,75,255]));  
const wallTex  = genTex(8, 8, (x, y) => (y % 4 === 0 || (x + (y < 4 ? 0 : 2)) % 4 === 0)  
                                          ? [60,40,35,255] : [140,80,60,255]);  
const whiteTex = genTex(1, 1, () => [255,255,255,255]);  
  
// ---------- world (chunked, seeded, persistent) ----------  
const worldSeed = hashSeed(new URLSearchParams(location.search).get("seed"));  
document.getElementById("hud").textContent = "WASD to move, G to smash — seed: " + worldSeed;  
const world = new World(worldSeed, gl, makeMesh);  
const RADIUS = 3; // chunks loaded in each direction around the player  
  
function collides(x, z, r) {  
  for (let tz = Math.floor(z - r); tz <= Math.floor(z + r); tz++)  
    for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++)  
      if (world.isSolid(tx, tz)) return true;  
  return false;  
}  
  
const player = { x: 0.5, z: 0.5, speed: 4, r: 0.3 };  
// nudge spawn to the first open tile so we don't start inside a wall  
for (let i = 0; i < 4096 && collides(player.x, player.z, player.r); i++) {  
  player.x += 1;  
  if (player.x > 64) { player.x = 0.5; player.z += 1; }  
}  
  
// ---------- input ----------  
const keys = {};  
addEventListener("keydown", (e) => (keys[e.code] = true));  
addEventListener("keyup",   (e) => (keys[e.code] = false));  
  
// wall-smash test key: clear the nearest solid tile around the player  
addEventListener("keydown", (e) => {  
  if (e.code === "KeyG") {  
    const px = Math.floor(player.x), pz = Math.floor(player.z);  
    let best = null, bestD = Infinity;  
    for (let tz = pz - 1; tz <= pz + 1; tz++)  
      for (let tx = px - 1; tx <= px + 1; tx++)  
        if (world.isSolid(tx, tz)) {  
          const d = (tx + 0.5 - player.x) ** 2 + (tz + 0.5 - player.z) ** 2;  
          if (d < bestD) { bestD = d; best = [tx,

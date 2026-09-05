import * as m4 from "../math/mat4.js";  
  
export const canvas = document.getElementById("game");  
export const gl = canvas.getContext("webgl2");  
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
  if (t.a < 0.5) discard;  
  outColor = vec4(t.rgb * u_tint * v_shade, 1.0);  
}`;  
  
function compile(type, src) {  
  const s = gl.createShader(type);  
  gl.shaderSource(s, src);  
  gl.compileShader(s);  
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));  
  return s;  
}  
function makeProgram(vs, fs) {  
  const p = gl.createProgram();  
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));  
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));  
  gl.linkProgram(p);  
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));  
  return p;  
}  
const prog = makeProgram(VERT, FRAG);  
const U = {  
  viewProj: gl.getUniformLocation(prog, "u_viewProj"),  
  model: gl.getUniformLocation(prog, "u_model"),  
  tint: gl.getUniformLocation(prog, "u_tint"),  
  tex: gl.getUniformLocation(prog, "u_tex"),  
};  
  
// ---------- textures ----------  
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
  
export const floorTex = makeTexture(8, (x, y) => {  
  const c = ((x ^ y) & 1) ? 70 : 55;  
  return [c, c + 8, c, 255];  
});  
export const wallTex = makeTexture(8, (x, y) => {  
  const edge = (x === 0 || y === 0 || x === 7 || y === 7);  
  return edge ? [90, 70, 60, 255] : [130, 110, 95, 255];  
});  
export const whiteTex = makeTexture(2, () => [255, 255, 255, 255]);  
  
// ---------- meshes ----------  
export function makeMesh(floatArray) {  
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
  
export const quad = makeMesh(new Float32Array([  
  -0.5, -0.5, 0, 0, 1, 1,  
   0.5, -0.5, 0, 1, 1, 1,  
   0.5,  0.5, 0, 1, 0, 1,  
  -0.5, -0.5, 0, 0, 1, 1,  
   0.5,  0.5, 0, 1, 0, 1,  
  -0.5,  0.5, 0, 0, 0, 1,  
]));  
  
export function draw(mesh, model, tex, tint) {  
  if (!mesh || !mesh.count) return;  
  gl.bindVertexArray(mesh.vao);  
  gl.uniformMatrix4fv(U.model, false, new Float32Array(model));  
  gl.uniform3fv(U.tint, tint);  
  gl.bindTexture(gl.TEXTURE_2D, tex);  
  gl.drawArrays(gl.TRIANGLES, 0, mesh.count);  
}  
  
function resize() {  
  const w = canvas.clientWidth, h = canvas.clientHeight;  
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }  
}  
export function beginFrame() {  
  resize();  
  gl.viewport(0, 0, canvas.width, canvas.height);  
  gl.enable(gl.DEPTH_TEST);  
  gl.clearColor(0.07, 0.07, 0.09, 1);  
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);  
  gl.useProgram(prog);  
  gl.activeTexture(gl.TEXTURE0);  
  gl.uniform1i(U.tex, 0);  
}  
export function setViewProj(mat) {  
  gl.uniformMatrix4fv(U.viewProj, false, new Float32Array(mat));  
}

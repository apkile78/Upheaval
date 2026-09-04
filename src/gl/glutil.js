export function initGL(canvas) {  
  const gl = canvas.getContext("webgl2");  
  if (!gl) throw new Error("WebGL2 not supported in this browser");  
  return gl;  
}  
export function createProgram(gl, vsSrc, fsSrc) {  
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);  
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);  
  const p = gl.createProgram();  
  gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);  
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))  
    throw new Error("Link error: " + gl.getProgramInfoLog(p));  
  return p;  
}  
function compile(gl, type, src) {  
  const s = gl.createShader(type);  
  gl.shaderSource(s, src); gl.compileShader(s);  
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))  
    throw new Error("Shader error: " + gl.getShaderInfoLog(s) + "\n" + src);  
  return s;  
}  
// 8-bit look: NEAREST filtering, no smoothing.  
export function makeTexture(gl, pixels, w, h) {  
  const t = gl.createTexture();  
  gl.bindTexture(gl.TEXTURE_2D, t);  
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);  
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);  
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);  
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);  
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);  
  return t;  
}

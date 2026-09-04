// Hand-written column-major 4x4 matrix + small vec3 helpers. No dependencies.  
  
export function identity() {  
  return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];  
}  
  
// returns a * b (column-major)  
export function multiply(a, b) {  
  const o = new Array(16);  
  for (let c = 0; c < 4; c++) {  
    for (let r = 0; r < 4; r++) {  
      o[c*4 + r] =  
        a[0*4 + r] * b[c*4 + 0] +  
        a[1*4 + r] * b[c*4 + 1] +  
        a[2*4 + r] * b[c*4 + 2] +  
        a[3*4 + r] * b[c*4 + 3];  
    }  
  }  
  return o;  
}  
  
export function translate(x, y, z) {  
  return [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1];  
}  
  
export function scale(x, y, z) {  
  return [x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1];  
}  
  
export function perspective(fovy, aspect, near, far) {  
  const f = 1 / Math.tan(fovy / 2);  
  const nf = 1 / (near - far);  
  return [  
    f / aspect, 0, 0, 0,  
    0, f, 0, 0,  
    0, 0, (far + near) * nf, -1,  
    0, 0, 2 * far * near * nf, 0,  
  ];  
}  
  
export function lookAt(eye, center, up) {  
  const z = norm(sub(eye, center));   // forward (points from center to eye)  
  const x = norm(cross(up, z));       // right  
  const y = cross(z, x);              // true up  
  return [  
    x[0], y[0], z[0], 0,  
    x[1], y[1], z[1], 0,  
    x[2], y[2], z[2], 0,  
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,  
  ];  
}  
  
// ---- vec3 helpers ----  
export function sub(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }  
export function dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }  
export function cross(a, b) {  
  return [  
    a[1]*b[2] - a[2]*b[1],  
    a[2]*b[0] - a[0]*b[2],  
    a[0]*b[1] - a[1]*b[0],  
  ];  
}  
export function norm(v) {  
  const l = Math.hypot(v[0], v[1], v[2]) || 1;  
  return [v[0]/l, v[1]/l, v[2]/l];  
}

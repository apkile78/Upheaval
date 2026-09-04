// Column-major 4x4 matrices + small vec3 helpers. No libraries.  
export function multiply(a, b) {  
  const o = new Array(16);  
  for (let c = 0; c < 4; c++)  
    for (let r = 0; r < 4; r++)  
      o[c * 4 + r] =  
        a[0 * 4 + r] * b[c * 4 + 0] +  
        a[1 * 4 + r] * b[c * 4 + 1] +  
        a[2 * 4 + r] * b[c * 4 + 2] +  
        a[3 * 4 + r] * b[c * 4 + 3];  
  return o;  
}  
export function perspective(fovy, aspect, near, far) {  
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);  
  return [f / aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0];  
}  
export function lookAt(eye, center, up) {  
  const z = norm(sub(eye, center));  
  const x = norm(cross(up, z));  
  const y = cross(z, x);  
  return [  
    x[0], y[0], z[0], 0,  
    x[1], y[1], z[1], 0,  
    x[2], y[2], z[2], 0,  
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,  
  ];  
}  
export function translate(x, y, z) { return [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]; }  
export function scale(x, y, z)     { return [x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1]; }  
  
export const sub  = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];  
export const dot  = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];  
export const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];  
export const norm = (a) => { const l = Math.hypot(a[0],a[1],a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };

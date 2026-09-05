import { canvas } from "./gl/renderer.js";  
  
export const cam = { yaw: Math.PI / 4, pitch: 0.9, dist: 12 };  
const PITCH_MIN = 0.25, PITCH_MAX = 1.45;  
const DIST_MIN = 4, DIST_MAX = 40;  
const SENS = 0.005;  
  
let dragging = false;  
canvas.addEventListener("contextmenu", (e) => e.preventDefault());  
canvas.addEventListener("mousedown", (e) => { if (e.button === 2) dragging = true; });  
addEventListener("mouseup", (e) => { if (e.button === 2) dragging = false; });  
addEventListener("mousemove", (e) => {  
  if (!dragging) return;  
  cam.yaw   -= e.movementX * SENS;  
  cam.pitch += e.movementY * SENS;   // inverted: drag down -> look down  
  cam.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, cam.pitch));  
});  
canvas.addEventListener("wheel", (e) => {  
  e.preventDefault();  
  cam.dist += e.deltaY * 0.01;  
  cam.dist = Math.max(DIST_MIN, Math.min(DIST_MAX, cam.dist));  
}, { passive: false });  
  
export function cameraEye(center) {  
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);  
  return [  
    center[0] + cam.dist * cp * Math.sin(cam.yaw),  
    center[1] + cam.dist * sp,  
    center[2] + cam.dist * cp * Math.cos(cam.yaw),  
  ];  
}

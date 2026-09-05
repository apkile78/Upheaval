import { attack } from "./entities.js";  
  
export const keys = {};  
addEventListener("keydown", (e) => { keys[e.code] = true; });  
addEventListener("keyup",   (e) => { keys[e.code] = false; });  
addEventListener("mousedown", (e) => {  
  if (e.button !== 0) return;   // left click = attack  
  attack();  
});

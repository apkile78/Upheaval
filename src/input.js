import { attack } from "./entities.js";  
  
export const keys = {};  
addEventListener("keydown", (e) => { keys[e.code] = true; });  
addEventListener("keyup",   (e) => { keys[e.code] = false; });  
addEventListener("mousedown", (e) => {  
  if (e.button !== 0) return;   // left click = attack  
  attack();  
});

export let invOpen = false;  
addEventListener("keydown", (e) => {  
  keys[e.code] = true;  
  if (e.code === "KeyI") {  
    invOpen = !invOpen;  
    document.getElementById("inv").style.display = invOpen ? "block" : "none";  
  }  
});

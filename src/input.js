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

export let omOpen = false;  
addEventListener("keydown", (e) => {  
  if (e.code === "KeyM") {  
    omOpen = !omOpen;  
    document.getElementById("overmap").style.display = omOpen ? "block" : "none";  
  }  
});

export let omPanX = 0, omPanZ = 0;  
addEventListener("keydown", (e) => {  
  if (!omOpen) return;  
  const step = 3;  
  if (e.code === "ArrowLeft")  omPanX -= step;  
  if (e.code === "ArrowRight") omPanX += step;  
  if (e.code === "ArrowUp")    omPanZ -= step;  
  if (e.code === "ArrowDown")  omPanZ += step;  
});

import { attack, useItem } from "./entities.js";  
import { inventory } from "./player.js";  
  
export let invSel = 0;  
  
addEventListener("keydown", (e) => {  
  if (!invOpen) return;  
  const ids = [...new Set(inventory)];        // unique types, same order as panel  
  if (e.code.startsWith("Digit")) {  
    const n = Number(e.code.slice(5)) - 1;  
    if (n >= 0 && n < ids.length) invSel = n;  
  }  
  if (e.code === "KeyE" || e.code === "Enter") {  
    const id = ids[invSel];  
    if (id) useItem(id);  
  }  
});

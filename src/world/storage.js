// Minimal IndexedDB wrapper: one object store of chunk diffs keyed by "cx,cz".  
const DB_NAME = "pnavgp-world";  
const STORE = "chunkDiffs";  
let dbPromise = null;  
  
function openDB() {  
  if (dbPromise) return dbPromise;  
  dbPromise = new Promise((resolve, reject) => {  
    const req = indexedDB.open(DB_NAME, 1);  
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);  
    req.onsuccess = () => resolve(req.result);  
    req.onerror = () => reject(req.error);  
  });  
  return dbPromise;  
}  
  
// diff is a plain object { localIndex: tileValue }. Read returns null if none.  
export async function loadDiff(key) {  
  const db = await openDB();  
  return new Promise((resolve, reject) => {  
    const tx = db.transaction(STORE, "readonly");  
    const req = tx.objectStore(STORE).get(key);  
    req.onsuccess = () => resolve(req.result || null);  
    req.onerror = () => reject(req.error);  
  });  
}  
  
export async function saveDiff(key, diff) {  
  const db = await openDB();  
  return new Promise((resolve, reject) => {  
    const tx = db.transaction(STORE, "readwrite");  
    tx.objectStore(STORE).put(diff, key);  
    tx.oncomplete = () => resolve();  
    tx.onerror = () => reject(tx.error);  
  });  
}

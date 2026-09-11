# AI AGENT DEVELOPMENT RULES & CONSTRAINTS

You are an automated software engineering agent working on a 3D CDDA-inspired survival simulation game built with TypeScript, WebGL2, and Web Workers. 

Your top priority is **Maintainability, Performance, and Strict Scope Containment**. Never over-engineer, never introduce unnecessary abstractions, and never break existing functionality.

---

## 1. STRICT OPERATIONAL BOUNDARIES
* **One Feature Per Task:** Focus ONLY on the explicitly assigned task. Do not refactor unrelated files, optimize unasked code, or add "nice-to-have" features.
* **No Unsanctioned Dependencies:** DO NOT modify `package.json` or install new NPM packages under any circumstances without explicit user permission. Use pure TypeScript/JavaScript web standards.
* **File Length Cap:** No single file may exceed **250 lines of code**. If logic grows larger, modularize it into clean helper files in a dedicated sub-folder.
* **Architecture Boundary:** Keep simulation logic (survival math, inventory arrays, AI states) strictly decoupled from the rendering engine (Babylon.js/Three.js). Pure logic lives in `/src/sim/`; visual rendering lives in `/src/render/`.

---

## 2. CODE QUALITY & TYPESCRIPT STANDARDS
* **Strict Type Safety:** Never use `any`. Define explicit interfaces or types in `/src/types/`. 
* **Zero Allocations in Hot Loops:** The render loop and worker tick loops must be garbage-collection friendly. Re-use vector objects and typed arrays rather than instantiating new objects (`new Vector3()`) inside loops.
* **Asynchronous Web Workers:** Heavy calculations (procedural generation, pathfinding, heatmap calculations) MUST be designed to run asynchronously inside Web Workers, sending serialized `ArrayBuffer` payloads to the main thread.

---

## 3. VERIFICATION & TESTING
* **Mandatory Tests:** Every new utility function or system module must include a corresponding unit test file (e.g., `feature.test.ts`).
* **Do Not Delete Tests:** Never modify or delete existing unit tests to make your new code pass. If a test fails, fix your code.
* **Build Integrity:** Before finalizing a task, ensure the TypeScript compiler runs cleanly (`tsc --noEmit`) with zero errors.

---

## 4. WHAT TO DO WHEN STUCK
* If an assignment requires changing core system interfaces, STOP and ask the user for approval first.
* If a bug requires editing more than 3 distinct files outside your assigned module, STOP and explain the issue to the user before proceeding.
# 01. Game Engine & Core Architecture

## Tech Stack & Deployment Target
- **Language**: TypeScript
- **Graphics Framework**: Decoupled 3D Abstraction (Babylon.js / Three.js)
- **Target Backend**: WebGL 2.0 (with automatic WebGPU fallback/upgrade path)
- **Deployment**: Static build hosted on **GitHub Pages**
- **IDE / Dev Environment**: GitHub Codespaces

## Multithreading with Web Workers
To maintain 60+ FPS on main WebGL render loop, heavy background simulations are offloaded to **Web Workers**:

┌──────────────────────────────────────┐       ┌──────────────────────────────────────┐
│         Main Thread (Client)         │       │        Web Worker (Simulation)       │
│  - WebGL2/WebGPU Rendering Pipeline  │◄──────┤  - Procedural Terrain & Noise Math   │
│  - Player Input & Camera Controller  │ Array │  - AI Heatmap Migration Loops        │
│  - Audio & Particle Systems          │Buffer │  - Pathfinding & Item Decay Systems  │
└──────────────────────────────────────┘       └──────────────────────────────────────┘

## Persistent Storage Architecture
- **Primary Cache**: `localForage` wrapper over **IndexedDB** for high-capacity asynchronous chunk/inventory saving without blocking frame renders.
- **Save State Import/Export**: Menu utility serializing world state arrays into single compressed `.json` or `.bin` files for backup across browser session purges.

## Entity Management (Draw Call Optimization)
To support 10,000+ loose items without WebGL context lockups:
1. **Individual Entity (1–19 items)**: Full 3D physical mesh with collision volume.
2. **Instanced Static Mesh (ISM) (20–99 items)**: Single-draw-call instanced mesh cluster with matrix offset transforms.
3. **Aggregated Container Mesh (100+ items)**: Single procedural "Pile/Crate" proxy mesh backed by a non-rendered underlying item data array.
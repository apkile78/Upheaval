> **PROPRIETARY & ALL RIGHTS RESERVED**  
> Copyright (c) 2026 [Your Name]. All rights reserved.  
> Unlawful copying, modification, or distribution of any code or assets in this repository is strictly prohibited.
# Project Overview & Architecture Documentation

Welcome to the Technical Documentation for the 3D CDDA-inspired Survival Simulation Game.

## Key Goals
- **Framework & Runtime**: WebGL2 / WebGPU-ready TypeScript architecture, deployable on **GitHub Pages**.
- **Camera Parity**: Triple-Perspective (1st Person, 3rd Person, Top-Down/Isometric) with dynamic field-of-view and line-of-sight cutaway rendering.
- **World Generation**: 1:1 real-Earth terrain from NOAA ETOPO 2022 elevation data (1 game unit = 1 meter); roads, cities and rivers are follow-up work.
- **Simulation Depth**: Granular body part degradation, layered clothing thermal dynamics, dynamic sound/scent vector propagation, and modular vehicle frame assembly.

## Documentation Index
1. [`01_engine_architecture.md`](./docs/01_engine_architecture.md) - Tech Stack, Web Workers, & Storage Strategy
2. [`02_world_and_terrain_gen.md`](./docs/02_world_and_terrain_gen.md) - Terrain, Multi-Level Subterranean & Flight Physics
3. [`03_graphics_and_rendering.md`](./docs/03_graphics_and_rendering.md) - Photorealism, Line-of-Sight, & Vision Parity
4. [`04_survival_and_body_systems.md`](./docs/04_survival_and_body_systems.md) - Skeletal Damage Overrides, Layered Gear, & Crafting
5. [`05_ai_perception_and_ecology.md`](./docs/05_ai_perception_and_ecology.md) - Sound/Scent Propagation, Hordes, & Factions
6. [`06_vehicles_and_construction.md`](./docs/06_vehicles_and_construction.md) - Modular Frame Vehicles, Micro-Grid Building, & Debris Physics
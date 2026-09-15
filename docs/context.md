# Project Context

Current design decisions and terminology for Upheaval. Keep this short; the
module documents hold the detail.

## What the project is

A CDDA-inspired 3D survival simulation on the web: TypeScript, Three.js/WebGL2,
Vite, deployed to GitHub Pages. Two strict domains:

- `src/sim/` — authoritative world state, terrain contracts, ECS/physics,
  persistence. **Never imports a render engine.**
- `src/render/` — meshes, LOD, camera, ECEF/ENU conversion, DOM HUD.
- `src/types/` — the shared contract layer.
- `src/main.ts` — the only module that wires both domains together.

## Terminology

| Term | Meaning |
|------|---------|
| **Sim unit / world coordinate** | 1 unit = 1 metre. `x` runs east from the antimeridian, `z` runs south from the north pole (equirectangular). |
| **True metre** | A ground metre on the WGS84 ellipsoid. One sim unit equals one true metre north-south and `cos(latitude)` true metres east-west. |
| **Frame anchor** | Snapped (64 m) render-space origin subtracted from world positions so Float32 geometry keeps precision. |
| **Local Earth frame** | ENU (east/up/north) tangent frame around the player, same 64 m snap; all visible geometry and the camera are expressed in it. |
| **Mesh base** | The render origin a cached mesh's vertices were baked against; re-bases translate the mesh rather than rebuild it. |
| **LOD band** | Render-only distance range (near/mid/far/horizon/extended). Never expands simulation range. |
| **Base terrain** | The immutable NOAA ETOPO 2022 elevation data. Player edits belong in a separate persistent change layer (not built yet). |

## Current state

Implemented: real-Earth elevation pipeline (tiled PNG assets, worker decode, LRU
+ bilinear sampling), deferred chunk materialization, near-field chunk meshes, a
two-ring macro LOD shell, sea-level water plane, floating origin, WGS84/ECEF
math plus cube-sphere addressing (not yet wired into the far shell), first/third
person camera, ECS + spatial hash + movement/interaction/health systems, raycast
tile targeting, and a DOM HUD.

Not implemented: inventory/crafting, survival body systems, AI/perception,
vehicles/construction, weather, world-change persistence, high-resolution
terrain, cities/roads/rivers, and save/load inside the game loop.

## Decision log

- **1:1 real Earth, data-driven terrain.** ETOPO 2022 (60 arc-second, public
  domain) replaces procedural continents/basins/rivers; the old generator is
  archived in `/trash`. See [02](02_world_and_terrain_gen.md).
- **Elevation is real metres, sea level = 0.** No vertical rescaling; the water
  plane renders oceans over true bathymetry.
- **Target a WGS84 ellipsoid world with explicit LOD coverage.** See
  [07](07_spherical_earth_and_high_res_plan.md) for the phased plan and the data
  volume limits (a global 1 arc-second source is ~1.68 TB and must live outside
  Git).
- **Sim and render are both true-scale.** Movement converts true metres through
  `metersPerUnitX(lat)`; the X axis is a longitude axis. See
  [08](08_earth_coordinates_and_render_origin.md).
- **A re-base may only translate meshes, never re-bake geometry.** Geometry is
  re-baked on content change only (or when a clip boundary follows the player).
  Near/far cell ownership is an exact partition: cells on the shared ring
  boundary belong to the exclusive ring. See
  [08](08_earth_coordinates_and_render_origin.md).
- **Save/load is localForage + `ISaveController`**
  (`src/sim/storage/saveSystem.ts`), not yet wired into the loop.

## Superseded material

The original design conversation (including an early "infinite East Coast map"
overworld that the real-Earth decision replaced) is archived at
`/trash/docs/context_transcript.md` for provenance. Prefer the module documents
above; they are maintained.

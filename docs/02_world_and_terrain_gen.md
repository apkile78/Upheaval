# 02. World & Terrain Generation

## Infinite East Coast Map Generation
- **Road & Highway Layout**: Hierarchical L-System / Voronoi graph generates state highways, county roads, and city grid blocks prior to chunk materialization.
- **Floating Origin System**: 64-bit precision coordinate system prevents jitter and floating-point errors when flying or traveling tens of thousands of units away from start position.

## Subterranean Node Integration (Hole-Punching)
Non-voxel continuous heightmaps are integrated with subterranean structures (bunkers, sewers, natural caves) using dynamic clipping:
1. Dynamic heightmap clipping shader punches invisible holes in terrain geometry at entrance node bounds.
2. Modular underground pre-fabricated chunks generate procedurally beneath surface hole via Wave Function Collapse (WFC).
3. Seamless spatial audio/lighting transitions avoid loading screens between surface and subterranean zones.

## Flight & Structural Destruction Physics
- **Aero-Sim Dynamics**: Continuous Rigid-Body dynamics modeling drag, thrust, and lift vectors supporting seamless transitions from ground level to high-altitude flight.
- **Deformable Terrain & Object Hitboxes**: Heightmap displacement shaders for ground digging/trenching paired with material-driven hitbox slicing algorithms for furniture and tree destruction.
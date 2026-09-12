# 02. World & Terrain Generation

## Infinite East Coast Map Generation

### Geographical Model
The world generator recreates the eastern seaboard of North America using real geological parameters:

**Regions (east to west):**
| Region | World X Range | Elevation | Biomes |
|--------|--------------|-----------|--------|
| Atlantic Ocean | < 0 | -50 to 0 | Deep water, continental shelf |
| Coastal Beach | 0-50 | 0-5 | Sand, dunes, marsh |
| Coastal Plain | 50-300 | 5-100 | Grassland, farmland, swamp |
| Piedmont | 300-500 | 100-300 | Deciduous forest, rolling hills |
| Appalachian Mountains | 500-800 | 300-2000 | Mixed forest, alpine, snow peaks |
| Interior Plateau | > 800 | 200-500 | Highland forest |

**Real-World Reference Points:**
- Mount Mitchell (highest east of Mississippi): ~2037m
- Appalachian Trail corridor: 500-2000m elevation gradient
- Chesapeake Bay: low-lying wetland/marsh at coastal plain elevation
- Delaware/Hudson river valleys: carved channels through piedmont

### Generation Pipeline
1. **Base Elevation**: Coast-distance function + domain-warped simplex noise
2. **Ridge Formation**: Ridged noise for Appalachian ridgelines
3. **Moisture Map**: Secondary noise for wetland/river placement
4. **Biome Assignment**: Elevation + moisture + region → biome type
5. **Chunk Materialization**: Heightmap → tile matrix + render mesh

### Floating Origin System
64-bit precision coordinate system prevents jitter and floating-point errors when flying or traveling tens of thousands of units away from start position.

### Noise Architecture
- **Base terrain**: 4-octave FBM with domain warping for natural ridgelines
- **Detail**: 2-octave high-frequency noise for surface roughness
- **Ridge noise**: 1-|sin(x)| transform for mountain crests
- **Coast falloff**: Smoothstep gradient from ocean to piedmont

## Biome System

### Elevation-Driven Biomes
| Elevation (m) | Biome | Color | Features |
|---------------|-------|-------|----------|
| < 0 | Deep Water | #1a3a5c | Impassable |
| 0-2 | Shallow Water | #2e6b9e | Passable, swim |
| 2-5 | Beach/Marsh | #c2b280 | Wet, slow movement |
| 5-50 | Coastal Plain | #4a7c3f | Grassland, farmland |
| 50-150 | Wetland | #3d5c3a | Marsh, dense vegetation |
| 150-400 | Piedmont Forest | #2d5a2d | Deciduous, rolling hills |
| 400-800 | Highland Forest | #1e4a1e | Mixed conifer/deciduous |
| 800-1500 | Mountain Forest | #3a5c4a | Dense conifer, rocky |
| 1500-2000 | Alpine | #6b7b6b | Sparse vegetation, bare rock |
| > 2000 | Snow Peak | #f0f0f5 | Permanent snow |

### Moisture Modifiers
- **Low moisture** (<0.3): Dry variants (grassland, scrub)
- **Medium moisture** (0.3-0.6): Standard forest
- **High moisture** (>0.6): Dense forest, wetlands

## Subterranean Node Integration (Hole-Punching)
Non-voxel continuous heightmaps are integrated with subterranean structures (bunkers, sewers, natural caves) using dynamic clipping:
1. Dynamic heightmap clipping shader punches invisible holes in terrain geometry at entrance node bounds.
2. Modular underground pre-fabricated chunks generate procedurally beneath surface hole via Wave Function Collapse (WFC).
3. Seamless spatial audio/lighting transitions avoid loading screens between surface and subterranean zones.

## Rendering Features
- **Vertex coloring**: Per-vertex color by biome + elevation gradient
- **Smooth normals**: Computed via `computeVertexNormals()` for natural lighting
- **Flat shading option**: For stylized low-poly aesthetic
- **Material**: MeshStandardMaterial with vertexColors for PBR lighting
- **Chunk mesh**: Single mesh per chunk (16×16 grid) for performance

## Files
| File | Purpose |
|------|---------|
| `src/sim/world/noise.ts` | Simplex noise + FBM + ridge noise |
| `src/sim/world/biomeManager.ts` | Region/biome lookup by elevation+moisture |
| `src/sim/world/chunkManager.ts` | Chunk generation + heightmap buffers |
| `src/render/chunkRenderer.ts` | Three.js mesh generation from heightmaps |
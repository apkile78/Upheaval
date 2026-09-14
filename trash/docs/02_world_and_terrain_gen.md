# 02. World & Terrain Generation

## Parametric, Seed-Generated Continents

### Core Model
The world is now generated from a seeded continent profile rather than a fixed eastern-seaboard template. The current model owns three layers:

1. **Continent model** (`src/sim/world/continentModel.ts`)
   - Builds a deterministic continent profile from the seed
   - Generates multiple seeded continental footprints, each with a distinct center, radius, and strength
   - Produces a `landmask(x, z)` that is approximately 0 in deep ocean and approximately 1 in the seeded continental interior

2. **Basin model** (`src/sim/world/basinModel.ts`)
   - Partitions each continent footprint into one or more contiguous basins
   - Assigns headwaters, outlets, and basin base levels from the same seed
   - Stores enough metadata for later river and biome routing decisions

3. **Elevation model** (`src/sim/world/elevationModel.ts`)
   - Combines landmask + basin staircase + bounded relief texture
   - Produces a monotone staircase-like cross-section from headwaters toward basin outlet
   - Keeps terrain contiguous by limiting relief to a bounded local band

### Generation Pipeline
1. **Seed → continent profile**: `createContinentModel(seed)`
2. **Seed → procedural basins**: `createBasinModel(profile)`
3. **Seed → staircase elevation**: `createElevationModel(seed)`
4. **Biome assignment**: existing `BiomeManager` uses the landmask and basin-aware elevation values
5. **Chunk materialization**: `ChunkManager` generates terrain tiles from the integrated elevation path

### Landmask Behavior
The landmask is the key Phase 1 fix for the previous interior-water problem:
- Deep ocean samples remain oceanic
- Seeded continent interiors stay land
- Coastal bands remain a smooth transition instead of a single hardcoded coastline

This creates a deterministic world footprint without depending on a recognizable real-world geography.

## Basin & Elevation Semantics

### Basin Properties
Each basin carries:
- a deterministic id
- the continent it belongs to
- a headwater zone and elevation basis
- an outlet type (`ocean`, `endorheic`, or `lake`)
- a dominant biome hint for later biome selection

### Staircase Elevation
The staircase model defines broad, monotone bands by flow distance to the basin outlet. The overall terrain equation is conceptually:

`elevation(x, z) = landmask(x, z) * (basinStaircase(x, z) + reliefTexture(x, z))`

This keeps terrain coherent across the full basin footprint:
- no sporadic water islands in the interior
- no band flipping caused by local noise spikes
- smooth high-level transitions between plains, foothills, and basin base levels

## Existing Systems Still In Use
- `BiomeManager` retains the existing coastal baseline, ridge shaping, and moisture logic
- `RegionMap` continues to classify archetypes but now respects the seeded landmask when deciding whether a sample is truly oceanic
- `RiverGenerator` now uses the landmask to ensure rivers start and terminate within the seeded continent envelope

## Rendering Notes
- Chunk generation remains mesh-based, but the terrain surface now comes from a deterministic continent/basin-aware model
- The render-distance and LOD sub-phase remains a separate concern from the world-model correctness itself

## Files
| File | Purpose |
|------|---------|
| `src/sim/world/continentModel.ts` | Seed-generated continent profile + landmask |
| `src/sim/world/basinModel.ts` | Procedural basins + outlet metadata |
| `src/sim/world/elevationModel.ts` | Staircase elevation + bounded relief texture |
| `src/sim/world/biomeManager.ts` | Integrated elevation lookup with landmask/basin influence |
| `src/sim/world/regionMap.ts` | Region classification aligned to the seeded footprint |
| `src/sim/world/riverGenerator.ts` | River generation aligned to the landmask |

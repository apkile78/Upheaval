# 02. World & Terrain Generation — 1:1 Real Earth

## Overview

The terrain is a **1:1 data-driven copy of the real Earth**. There is no
procedural continent/basin/ridge synthesis any more: elevation comes from the
**NOAA ETOPO 2022 global relief model** (60 arc-second / 1 arc-minute grid,
ice-surface variant, public domain — DOI 10.25921/fd45-gt74), which includes
both land topography and ocean bathymetry.

Scale and projection:

- **1 game unit = 1 meter**, **sea level = 0** (elevation values are real
  meters: Everest ≈ +8050 in the gridded data, Challenger Deep ≈ −10450).
- **Equirectangular projection**: `x = (lon + 180) · 111320`,
  `z = (90 − lat) · 111320`. Longitude wraps at the antimeridian; latitude is
  clamped to ±90°. World extents ≈ 40.07 M × 20.02 M units.
- The chunk grid (16 units = 16 m) and player scale (1.8 m tall) are unchanged;
  the same ground-follow physics and mesh pipeline are reused.

## Data Pipeline (`scripts/`)

1. `scripts/convert-earth-dem.mjs` (run once, output committed):
   - downloads 36 latitude bands (5° each) from NOAA THREDDS **NCSS** as
     NetCDF-3 classic into `.cache/dem/` (resumable),
   - scatters cells into a global **21600 × 10800** Int16 grid by their actual
     latitude/longitude centers (100 % coverage verified),
   - writes **50 tiles** of 2160 × 2160 px as 24-bit RGB PNG where
     `R = high byte`, `G = low byte` of `(elevation + 11000)` — an 8-bit-per-
     channel encoding that survives browser canvas decoding *losslessly*
     (verified by an inflate/de-filter roundtrip in the converter),
   - writes `public/assets/earth/meta.json` and a real-data test fixture
     `tests/fixtures/everest_96.i16` (96 × 96 cells around Everest).
2. `scripts/verify-earth-tiles.mjs` (`npm run data:verify`) reads the **shipped
   PNG tiles** back and validates 12 real-world anchors (Everest, K2, Dead Sea,
   Challenger Deep, Tibetan plateau, Sahara/Aïr, Amazon, North Sea, London,
   Greenland, Mariana arc, mid-Pacific abyssal plain).

Public-domain source data means the only large repo asset is
`public/assets/earth/` (~214 MB total at 1 m vertical precision, ~3–4 MB per
tile; tiles load lazily so a session only fetches the few tiles near the
player).

## Runtime Architecture (`/src/sim/world/earth/`)

| File | Purpose |
|------|---------|
| `earthConfig.ts` | Scale constants (`METERS_PER_DEGREE`, `SEA_LEVEL`), grid/tile layout, asset URLs, spawn lat/lon, LRU size |
| `earthProjection.ts` | Pure `latLonToWorld` / `worldToLatLon`, longitude wrap, latitude clamp |
| `elevationGrid.ts` | `ElevationSource` — tile LRU + deterministic **bilinear** sampling, `isReady` / `requestArea` / `waitForArea`, R/G decode helper |
| `elevationWorker.ts` | Web Worker: PNG bytes → `Int16Array` meters via `createImageBitmap` + `OffscreenCanvas` (transferable result) |
| `elevationLoader.ts` | Boot loader: fetches `meta.json`, spawns the worker, builds the source, warms tiles around the spawn |
| `earthBiome.ts` | Real-Earth biome classifier: latitude belts (ice caps, tundra, subtropics/desert, temperate, tropics) × elevation bands (beach, lowland, montane, tree line, permanent snow) + latitude-shaped moisture |

`BiomeManager` (`src/sim/world/biomeManager.ts`) is now a thin facade over the
source: `getElevation`, `isWater`, `getBiome`, `getTileType`, `getLatLon`, and
the `BIOME_COLORS` palette. `ChunkManager` owns the chunk cache and **defers
chunk materialization** until the elevation tiles covering that chunk (plus a
one-cell bilinear margin) are resident, then generates from the real data.

### Loading behavior
- Boot: `createEarthElevationSource()` → `warmupAround(spawn)` → first chunks.
- While moving: `updateActiveChunks` calls `requestArea` for missing tiles; the
  affected chunks appear a tick or two later (no blocking, no partial terrain).
- LRU keeps 10 tiles (≈ 93 MB) resident; sampling where a tile is missing falls
  back to the nearest resident cell (physics only — chunks never build there).

## Rendering Notes
- Terrain meshes are unchanged (vertex-colored, flat-shaded triangles from the
  chunk heightmap); color bands in `chunkGeometry.ts` were recalibrated to real
  meters (water < 0, beach < 3, lowland < 150, forest < 1500, dirt < 2800,
  mountain < 3800, stone < 4600, snow above).
- `waterPlane.ts` draws a translucent sea-level plane that follows the player so
  oceans over the real bathymetry read correctly (visible when the local
  surface is at/below ~3 m).
- Below-sea-level land (e.g. Death Valley) renders as water because v1 uses the
  simple `DEM ≤ 0 → water` rule; real lakes above sea level (Great Lakes) render
  as land. Both are documented limitations, fixable later with a water-body
  mask / connected-ocean flood fill.

## Removed Systems (archived in `/trash`)
The previous procedural world generator — seeded continents/landmask
(`continentModel`), drainage basins (`basinModel`), staircase elevation
(`elevationModel`), macro heightmap (`macroHeightmap`), river tracing and tile
carving (`riverGenerator`, `riverCarve`), region archetypes (`regionMap`), the
ridge/domain-warp noise machinery, plus all of their tests — is preserved under
`/trash/` (not compiled, not imported). Rivers, region labels, cities, roads,
and LOD/render-distance work are follow-up tasks.

## Files
| File | Purpose |
|------|---------|
| `public/assets/earth/meta.json` | Grid + tile layout, elevation offset, global min/max |
| `public/assets/earth/tiles/r{row}_c{col}.png` | 50 elevation tiles (R/G-packed int16 meters) |
| `scripts/convert-earth-dem.mjs` | One-off NOAA ETOPO download → tiled PNG assets |
| `scripts/verify-earth-tiles.mjs` | Real-world anchor verification of shipped tiles |
| `scripts/dem/netcdf3.mjs` | Dependency-free NetCDF-3 classic reader |
| `scripts/dem/pngio.mjs` | Dependency-free PNG encoder/decoder (Paeth RGB) |
| `tests/fixtures/everest_96.i16` | Real-data fixture for unit tests |

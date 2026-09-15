# 07. Spherical Earth, View Distance & High-Resolution Terrain Plan

## Purpose

The active terrain is intended to represent the real Earth at 1:1 scale. The
next rendering milestone is to make that Earth WGS84-compatible, provide
continuous terrain coverage at the intended view distances, and move toward a
global 1 arc-second source without pretending that the raw asset belongs in
ordinary Git history.

This is a rendering and terrain-data plan. The simulation remains independent
of Three.js and must continue to consume world-space terrain contracts rather
than render meshes.

## Important Separation

A spherical Earth does not automatically fix view-distance gaps. Three
separate problems must be solved independently:

1. **World shape:** equirectangular ground must become a curved Earth surface.
2. **Coverage:** near and far LOD tiles must cover every distance band without
   holes or overlaps.
3. **Resolution:** the current global elevation source must be replaced over
   time by a globally addressable high-resolution source.

4. **Persistence:** the accurate base terrain and every player/world change
   must survive sessions, updates, and tile eviction.

The existing view problem is primarily a coverage/LOD problem. A sphere makes
long-distance curvature physically correct, but it cannot fill a missing tile
or repair a bad LOD boundary by itself.

## Proposed World Model

Use the WGS84 reference ellipsoid as the authoritative Earth shape. A sphere
may be used as a temporary approximation in isolated rendering tests, but it
must not become a second terrain datum.

- semi-major axis `a = 6378137 m`
- inverse flattening `1/f = 298.257223563`
- `1 game unit = 1 meter`
- latitude, longitude, and orthometric elevation remain authoritative
- rendering converts geodetic samples to Earth-centered, Earth-fixed (ECEF)
   coordinates and then to a local ENU tangent frame
- simulation owns geographic terrain and persistent world state, with no
   Three.js dependency

WGS84 is not impossible here. The hard parts are coordinate conversion,
vertical-datum normalization, local-origin rebasing, and LOD continuity, not
the ellipsoid formula itself.

## Why a Sphere Helps

At eye height around `1.7 m`, the geometric horizon is roughly `4.6 km` away.
A hill or mountain remains visible much farther away because its elevation
raises its horizon distance. Earth curvature drops the surface by about:

- `2.8 m` at `6 km`
- `31 m` at `20 km`
- `196 m` at `50 km`

This gives the renderer a physically meaningful far field. A flat map can
show distant terrain, but it cannot represent the horizon and curvature
correctly.

## Render Coverage Targets

Use explicit distance bands with guaranteed coverage. Do not select tiles only
because their centers fall inside a radius.

| Band | Distance | Geometry target | Purpose |
|------|----------|-----------------|---------|
| Near | `0-300 m` | 1 m grid / gameplay terrain | feet, collision visuals, structures |
| Mid | `300 m-1 km` | 4-8 m samples | readable local terrain |
| Far | `1-8 km` | 16-32 m samples | normal field visibility |
| Horizon | `8-20 km` | 64-128 m samples | terrain silhouettes and curvature |
| Extended | `20-35 km` | 128-512 m samples | scope and elevated terrain |

The normal view should target a clear terrain radius of `6-8 km`, with a
curved horizon shell to `20 km`. A scope may request the extended band to
`30-35 km`, subject to weather, elevation, and line of sight.

Suggested initial render profile:

```ts
NEAR_TERRAIN_RADIUS = 300
NORMAL_TERRAIN_RADIUS = 8000
HORIZON_TERRAIN_RADIUS = 20000
NORMAL_CAMERA_FAR = 22000
NORMAL_FOG_START = 12000
NORMAL_FOG_END = 20000
SCOPE_TERRAIN_RADIUS = 35000
SCOPE_CAMERA_FAR = 40000
SCOPE_FOG_START = 24000
SCOPE_FOG_END = 38000
```

These are render-only values. Simulation active chunks, collision, AI, and
world updates must not be expanded to match the visual radius.

## LOD Coverage Rules

The current macro shell uses a `96-1100 m` near ring and a `768-3600 m` far
ring. It can disconnect because whole tiles are skipped when they intersect
the near voxel box, and because tile centers are used as the coverage test.

The replacement must:

1. Select tiles by their bounds and the target coverage region.
2. Guarantee coverage from the near terrain edge to the normal terrain radius.
3. Use a transition band with shared boundary vertices or skirts.
4. Prevent duplicate near/far surfaces in the same area.
5. Keep tile edges at the same spherical position and datum.
6. Rebuild or rebase render geometry without changing simulation coordinates.
7. Test radial coverage at arbitrary player positions, not only tile centers.

The first implementation slice now applies the bounds-based selection rule to
the existing flat macro shell, removes the whole-tile near-field exclusion,
extends the normal far shell to `8 km`, and aligns the camera/fog envelope to
the expanded shell. WGS84 conversion, stitched spherical LOD, and persistent
world changes remain later phases in `todo.md`.

A cube-sphere or quadtree cube-sphere is preferred for the far shell. It avoids
the polar singularities and extreme longitudinal stretching of an
 equirectangular mesh. The local near field can still use a tangent-plane
mesh around the player, provided its boundary is converted to the same sphere.

## Data Reality and Storage Cost

The current source is a global 1-arc-minute grid:

- `21600 x 10800` cells
- approximately `233 million` elevation samples
- `Int16` raw storage around `466 MB`
- the committed PNG tiles are approximately `214 MB`

A uniform global high-resolution replacement grows extremely quickly:

| Global spacing | Approximate cells | Int16 raw estimate | Practical assessment |
|----------------|-------------------|--------------------|----------------------|
| 1 arc-minute | 1.85 km at equator | `0.47 GB` | current base dataset |
| 3 arc-second | ~90 m | `186 GB` | too large for normal repo/assets |
| 1 arc-second | ~30 m | `1.68 TB` | viable as external/versioned data, not Git or browser preload |
| 1/3 arc-second | ~10 m | `15 TB` | not viable as a global asset |

Compression may reduce these numbers, but it does not make a multi-terabyte
source practical for Git, GitHub Pages, browser download, or local test
quotas. The project may still target a global 1 arc-second source, but it must
be stored as a separately versioned data artifact or tile service and streamed
by geographic/LOD tile. It is not practical to commit the raw global source
to this repository or preload it in a browser.

## Global High-Resolution Strategy

The project will not divide the world into manually authored territories or
depend on a small set of permanent test regions. The data system must address
the whole globe uniformly:

1. **Base dataset:** retain the current ETOPO-derived source during migration.
2. **Target dataset:** build or acquire a globally tiled 1 arc-second source,
   with a documented vertical datum and reproducible tile index.
3. **Runtime:** stream the global tiles by geographic position and LOD; no
   hand-authored territory list is required.
4. **Migration:** keep parent-resolution tiles available while high-resolution
   tiles are downloading or unavailable.
5. **Local cache:** permit large local caches and external data mounts without
   placing them in Git or the browser bundle.

Every global tile or dataset release should identify:

- geographic bounds
- horizontal spacing and vertical datum
- source and license
- tile size and version
- parent/base dataset
- min/max elevation
- resampling method

The browser should request only the geographic tiles needed for the current
view. A scope prioritizes the reticle tiles, but the same global dataset and
tile contract applies everywhere.

## Persistent Terrain and World Changes

The accurate Earth dataset is immutable base data. Player and game changes are
stored as a persistent, versioned world-change layer keyed to geographic tile
and local feature/entity identifiers. This avoids rewriting the source DEM
while ensuring that terrain and creations remain after cache eviction or a
restart.

The persistence model must support:

- terrain deformation and excavation records
- placed buildings, roads, farms, ports, and infrastructure
- destroyed or moved world objects
- cities and other generated settlements
- vehicles, vehicle parts, ownership, damage, and persistence
- terrain/material changes with timestamps and world version
- deterministic replay or compaction of changes for a tile
- conflict rules when a future base-data release changes an untouched tile

The rendering layer reads a resolved tile snapshot or change stream. The
simulation owns the authoritative changes and persistence format; rendering
must never silently write world state. Save data should be separate from the
base DEM so a data update cannot erase player work.

## Streaming and Cache Design

The renderer should request spherical quadtree tiles by screen relevance and
not by simulation chunk radius. Each tile should have a stable geographic key
and LOD level. The cache should support:

- prioritized requests for the camera center and scope reticle
- cancellation or deprioritization for tiles leaving the view
- separate base and overlay caches
- bounded memory with LRU eviction
- fallback to the parent tile while a child tile loads
- no partial geometry at a tile boundary
- worker-side decode and mesh preparation

The simulation can continue loading only the terrain required for gameplay.
Render-only far tiles must not become collision or AI entities automatically.
When a player-created object enters the simulation range, its authoritative
state must resolve from the persistent world-change layer rather than from a
render cache.

## Suggested Implementation Phases

### Phase 1: Fix continuous flat-world coverage

Before changing the global coordinate model, make the current render shell
continuous from the near terrain to `8 km`. Add coverage tests for arbitrary
player positions and remove the near/macro hole. This provides a clear test
that distinguishes LOD defects from projection defects.

### Phase 2: Introduce WGS84 geographic coordinates

Add pure coordinate utilities for:

- WGS84 latitude/longitude/elevation to Earth-centered position
- Earth-centered position to WGS84 latitude/longitude/elevation
- local ENU tangent frame around the player
- antimeridian and polar handling
- stable local render rebasing

Unit-test known anchors, round trips, horizon distances, and continuity across
tile and cube-face boundaries.

The first WGS84 math slice is implemented in `src/render/earth/wgs84.ts` with
CPU tests covering ECEF/geodetic round trips and ENU meter conversion.

A render-only adapter now maps the existing simulation `x/z` coordinates and
elevation samples into a local ENU frame in `src/render/earth/localFrame.ts`.
Its CPU tests establish the integration contract without changing runtime
terrain consumers yet.

The adapter is now connected to the runtime render path. Near and macro terrain,
the camera, entities, water plane, and selection marker share the same snapped
local ENU frame. Simulation coordinates remain unchanged. Near meshes rebuild
only when the snapped local origin changes; full cube-sphere far-shell stitching
remains a later phase.

The cube-sphere foundation is now also defined in
`src/render/earth/cubeSphere.ts`. It maps six stable faces and UV coordinates
to the WGS84 ellipsoid, supports inverse face/UV selection, and has CPU tests
for face centers, edges, poles, antimeridian-adjacent anchors, elevation, and
stable tile IDs. It is not yet connected to the macro terrain manager; quadtree
selection, parent fallback, and edge stitching remain required before that
replacement.

The high-elevation debug teleport now requests destination chunks immediately,
skips one stale-data grounding step, and keeps the sea-level plane hidden until
the destination height is resident. This prevents an unloaded-area fallback
from presenting a false green/sea-level plane at Everest or pulling the player
down during the transition.

The cube-sphere quadtree addressing foundation is now implemented in
`src/render/earth/cubeSphereQuadtree.ts`. It provides stable face/level/x/y
tile IDs, UV bounds, UV lookup, and parent/child relationships with CPU tests.
Camera-error selection, parent fallback behavior, and runtime far-shell
geometry remain separate implementation steps.

Macro LOD ownership was also tightened: macro tiles crossing the near-field
ownership boundary are excluded, and the far ring begins where the near ring
ends. This removes the direct near/far overlap that produced floating lines and
z-fighting; stitched transition geometry is still required for a seamless
future cube-sphere shell.

The elevation source now enumerates every DEM tile crossed by a requested box.
Previously, stepping from the first cell by one tile width could miss the
neighboring source tile at a boundary, allowing a macro tile to build from
nearest-resident fallback samples and appear as a false flat plane. The far
macro ring also uses the near ring's `256 m` tile boundaries with a coarser
interior grid, removing the previous `256 m`/`1024 m` T-junction at their
transition.

Chunk activation is now transactional around the player: movement requests new
chunks without deleting the current active set, and the active set swaps only
when the new center chunk is ready. Teleports explicitly clear the old active
set before requesting the destination. Macro boundary tiles are retained and
triangle-clipped at the inner radius instead of being discarded wholesale,
which removes the missing radial section while keeping near/far ownership
exclusive.

### Phase 3: Move the far shell to a cube-sphere quadtree

Keep the near gameplay mesh local and use a cube-sphere quadtree for the
`300 m-20 km` visual shell. Add shared edge handling and parent-tile fallback
so loading never creates visible holes.

### Phase 4: Build and stream the global 1 arc-second dataset

Add metadata, conversion tooling, checksums, and tile loading for the global
1 arc-second source. Keep the existing 1 arc-minute data as a fallback until
each high-resolution tile has passed validation. Verify coverage, vertical
datums, antimeridian wrapping, polar behavior, and known real-world anchors.

### Phase 5: Add persistent world changes

Define the simulation-owned world-change schema, tile journal, snapshot and
compaction format, version migration rules, and save/load tests. Ensure a
terrain edit or creation remains after tile eviction, application restart,
base-data migration, and render-cache rebuild.

Add the systems that will consume this layer over time: cities, ports, roads,
buildings, farms, infrastructure, and all classes of vehicles. These are
content and simulation features, not special render-only exceptions.

### Phase 6: Add scope-specific rendering

Add a render-only scope profile that increases the requested terrain radius to
`30-35 km`,
prioritizes reticle tiles, and improves contrast/resolution without changing
simulation range or camera hacks.

## Acceptance Criteria

The spherical/high-resolution system is ready when:

- the visible terrain is continuous from `0` to `8 km` in every direction
- the horizon shell reaches `20 km` without holes or abrupt LOD seams
- the Earth visibly curves and distant terrain follows the horizon
- antimeridian and polar transitions remain continuous
- the player remains correctly grounded on the near mesh
- scope rendering can request `30-35 km` visual tiles independently
- high-resolution tiles are globally addressable rather than territory-managed
- the 1 arc-second dataset has a reproducible external/versioned distribution
- missing high-resolution tiles cleanly fall back to the current global base
- terrain edits and player creations survive restart and data-cache eviction
- no raw multi-terabyte asset is required in Git history or browser preload
- simulation imports no rendering dependencies
- all geometry and data tests run without browser-only WebGL dependencies

## Decision Summary

Use WGS84-compatible ellipsoidal Earth coordinates, but do not use that change
as a substitute for LOD coverage work. Target a globally tiled 1 arc-second
dataset distributed outside ordinary Git history and streamed by LOD. Keep
the current global dataset as the migration fallback. Store all terrain edits
and future creations in a simulation-owned persistent change layer so accurate
base terrain and player work remain permanent. Target `300 m` near terrain,
`6-8 km` normal terrain, `20 km` curved terrain, and `30-35 km` scope terrain.

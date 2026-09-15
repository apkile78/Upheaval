# Upheaval Implementation Plan

This is the master implementation checklist for the real-Earth world, rendering,
data, persistence, and future world-content work.

The project remains split into two strict domains:

- `src/sim/`: authoritative world state, terrain contracts, gameplay, persistence,
  entities, physics, AI, and world changes. No Three.js.
- `src/render/`: visual terrain, LOD, WGS84/ECEF conversion for rendering,
  camera, scope presentation, materials, meshes, and render caches. Rendering
  must never be the authority for world state.

The current committed Earth data remains usable during the migration. The
long-term high-resolution Earth dataset is a separate versioned data product,
not a Git branch containing terabytes of assets.

## Locked Direction

- [ ] Use WGS84-compatible Earth geometry as the authoritative geographic model.
- [ ] Keep `1 game unit = 1 meter`.
- [ ] Keep latitude, longitude, and elevation as authoritative terrain data.
- [ ] Use ECEF plus a local ENU tangent frame for local rendering.
- [ ] Near terrain target: `0-300 m`.
- [ ] Normal clear terrain target: `6-8 km`.
- [ ] Curved horizon target: `20 km`.
- [ ] Scope terrain target: `30-35 km`.
- [ ] Keep simulation range independent from visual render distance.
- [ ] Treat base Earth terrain as immutable source data.
- [ ] Store terrain edits and player/game creations in a persistent simulation-owned
      world-change layer.
- [ ] Do not use procedural terrain enhancement as a substitute for real data.
- [ ] Do not create a manually maintained list of world territories or a small
      permanent set of high-resolution test regions.
- [ ] Target a globally addressable 1 arc-second terrain dataset.
- [ ] Keep large terrain data outside ordinary Git history and browser preload.
- [ ] Add cities, ports, roads, buildings, farms, infrastructure, and vehicles
      as normal persistent simulation content over time.

## Phase 0: Repository and Testing Baseline

Purpose: make the current Earth pipeline easy to test before changing its
coordinate system.

- [ ] Make `npm run serve` reliably build and start the test server.
- [ ] Ensure missing or failed builds prevent stale output from being served.
- [ ] Verify static requests for the app, Earth metadata, and Earth tiles.
- [ ] Keep malformed URLs and directory requests from crashing the server.
- [ ] Run `npm run type-check`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run data:verify`.
- [ ] Add a repeatable browser/WebGL smoke test for Earth boot.
- [ ] Verify the boot path: metadata, worker decode, spawn warmup, chunks,
      macro terrain, player grounding, and first rendered frame.
- [x] Ensure the high-elevation debug teleport requests destination chunks,
      does not ground against stale fallback data, and hides the water plane
      until destination elevation is ready.
- [x] Give macro LOD bands exclusive tile ownership to prevent floating-line
      artifacts from overlapping near and far surfaces.
- [x] Require DEM tile-boundary requests to include every crossed source tile.
- [x] Align near/far macro tile boundaries to avoid T-junctions at the LOD
      transition.
- [x] Keep active chunks until the new center chunk is ready during movement.
- [x] Clip macro boundary triangles instead of dropping whole tiles at the
      near-field boundary.
- [ ] Capture baseline screenshots or diagnostic measurements before LOD changes.

Acceptance:

- A clean checkout can build and serve without manually preparing `dist/`.
- Existing Earth anchor checks pass.
- The browser reaches a visible, grounded player at the configured spawn.
- Existing tests remain meaningful and are not weakened.

## Phase 1: Stabilize Current Terrain Geometry

Purpose: remove defects that must not be carried into spherical rendering.

- [ ] Verify chunk vertices are anchor-relative before Float32 conversion.
- [ ] Verify chunk meshes retain their build anchor during floating-origin rebases.
- [ ] Verify terrain height queries use the same triangle interpolation as the
      rendered mesh.
- [ ] Verify height queries cross chunk boundaries using neighboring samples.
- [ ] Verify player feet use the rendered surface rather than a different
      bilinear surface.
- [ ] Verify chunk borders share identical world-space vertices.
- [ ] Verify missing-neighbor fallback cannot create visible zero-height cliffs.
- [ ] Add focused tests for triangle interpolation and chunk-boundary samples.
- [ ] Add a stationary-player diagnostic proving camera rotation does not alter
      terrain vertex heights or world coordinates.
- [ ] Keep camera changes separate from terrain correctness fixes.

Acceptance:

- The player remains on the visible near terrain while stationary and moving.
- Rotating the camera cannot change the underlying terrain geometry.
- Chunk seams do not create height pops when neighbors become available.
- Earth-scale coordinates do not quantize near-field terrain by Float32 loss.

## Phase 2: Replace the Current View Shell with Continuous Coverage

Purpose: make the current flat render path continuous before introducing Earth
curvature. This isolates LOD bugs from coordinate-system bugs.

Target bands:

```text
0-300 m       near/gameplay terrain
300 m-1 km    mid-resolution terrain
1-8 km        normal far terrain
8-20 km       curved/horizon preparation shell
20-35 km      scope/extended shell
```

- [x] Define render-only distance profile constants in `src/render/`.
- [ ] Keep simulation active chunks at gameplay scale.
- [x] Replace center-distance-only tile selection with bounds-based coverage.
- [x] Remove the whole-tile near-field skip gap.
- [ ] Guarantee coverage around the full near-field boundary.
- [ ] Establish non-overlapping LOD ownership for each distance band.
- [ ] Add transition rings between resolutions.
- [ ] Use shared edge vertices or stitched transition geometry.
- [ ] Use skirts only as a supplementary crack-hiding measure, not as the main
      height-continuity solution.
- [ ] Keep parent LOD visible while child tiles are loading.
- [ ] Dispose only tiles outside the requested visual envelope.
- [x] Extend the current shell to at least `8 km` normal terrain.
- [ ] Add a coarse shell reaching `20 km` before spherical conversion.
- [ ] Set normal camera/fog limits to match actual available terrain.
- [ ] Add scope distance constants without expanding simulation or AI range.
- [ ] Add automated coverage tests for arbitrary player positions, not only tile
      centers or the initial spawn.

Acceptance:

- No holes exist from `0` to `8 km` in cardinal or diagonal directions.
- No band is both visibly duplicated and independently z-fighting.
- Tile loading creates parent fallback rather than empty space.
- Near, mid, and far terrain share the same elevation datum.
- Normal and scope distance profiles are explicit and independently testable.

## Phase 3: Implement WGS84 and Local Earth Rendering

Purpose: replace the global equirectangular render surface with physically
correct Earth geometry while preserving the simulation/render boundary.

### Geographic Math

- [x] Add WGS84 constants:
      `a = 6378137 m`, `1/f = 298.257223563`.
- [x] Implement geodetic latitude/longitude/height to ECEF conversion.
- [x] Implement ECEF to geodetic conversion.
- [x] Implement local ENU basis construction around the player.
- [x] Implement ENU/world-to-local and local-to-world transforms.
- [ ] Handle antimeridian wrapping continuously.
- [ ] Handle polar behavior without longitude discontinuities.
- [ ] Define the vertical datum contract for all terrain sources.
- [ ] Normalize source elevation into the selected datum during preprocessing.
- [x] Add round-trip tests for London, Everest, Cape Town, Tokyo, poles, and
      antimeridian-adjacent points.
- [x] Add tests for ENU orientation and local distances.
- [ ] Add horizon/curvature tests at `6 km`, `20 km`, and `35 km`.

### Render Integration

- [ ] Keep geographic terrain contracts in `src/types/` and `src/sim/`.
- [x] Convert visible terrain to local ENU render coordinates in `src/render/`.
- [x] Keep the floating origin local to the renderer.
- [ ] Ensure elevation is radial relative to the WGS84 surface, not global Y.
- [ ] Convert the near tangent mesh onto the ellipsoid surface.
- [ ] Convert far terrain to the same ellipsoid without double curvature.
- [x] Keep player grounding consistent with the local near mesh.
- [ ] Update water rendering to follow the local geodetic sea-level surface.
- [ ] Remove assumptions that global `Y = 0` is sea level everywhere.
- [x] Verify entities and selection/raycast coordinates use the same local frame.

Acceptance:

- Earth curvature is visible and stable at long distances.
- Local terrain remains meter-stable around the player.
- Antimeridian and polar transitions do not tear or jump.
- The player is grounded on the near ellipsoid surface.
- Simulation code remains free of Three.js imports.

## Phase 4: Cube-Sphere / Quadtree Far Terrain

Purpose: provide efficient, globally continuous far terrain without
polar distortion or an equirectangular horizon.

- [x] Choose cube-sphere face parameterization and tile addressing.
- [ ] Define quadtree LOD levels and geometric error thresholds.
- [x] Define the mapping from geographic samples to cube-sphere tiles.
- [x] Keep tile keys stable across runs and dataset releases.
- [x] Build parent/child relationships for fallback and streaming.
- [ ] Generate shared or stitchable tile edges.
- [ ] Support neighboring tiles at different LOD levels.
- [ ] Add transition geometry or crack-free edge stitching.
- [ ] Add frustum, horizon, screen-error, and scope-reticle prioritization.
- [ ] Keep the `300 m` near field local and high detail.
- [ ] Cover `300 m-20 km` with guaranteed far-shell geometry.
- [ ] Cover `20-35 km` on scope/extended requests.
- [ ] Add curved horizon visibility and occlusion behavior.
- [ ] Add tests for cube-face edges, poles, antimeridian, and arbitrary camera
      positions.
- [ ] Add a render diagnostic showing loaded tile keys, LOD levels, gaps, and
      fallback status.

Acceptance:

- The entire visible terrain envelope is continuous at every camera position.
- No cube-face boundary is visible.
- Parent tiles remain until replacement children are ready.
- Far terrain does not enter simulation collision or AI automatically.
- Tile selection is based on render relevance, not simulation chunk radius.

## Phase 5: Global 1 Arc-Second Terrain Dataset

Purpose: move from the current global 1 arc-minute base toward globally
addressable approximately 30 m terrain without creating a multi-terabyte Git
repository or manually maintained regional territories.

### Dataset Contract

- [ ] Select the authoritative global 1 arc-second source or source blend.
- [ ] Confirm source license and redistribution rights.
- [ ] Confirm vertical datum and geoid treatment.
- [ ] Define the canonical sample spacing and grid alignment.
- [ ] Define a global tile index and stable tile IDs.
- [ ] Define tile dimensions and compression.
- [ ] Define min/max elevation metadata.
- [ ] Define checksums and dataset release manifests.
- [ ] Define source provenance for every release.
- [ ] Define missing/void-cell behavior.
- [ ] Define how bathymetry, ice, and land data are combined.

### Build and Distribution

- [ ] Extend or replace the Earth conversion pipeline for 1 arc-second input.
- [ ] Generate a reproducible global tile pyramid.
- [ ] Generate lower LOD parents from the high-resolution source.
- [ ] Validate known global anchors and coverage percentages.
- [ ] Validate antimeridian and polar tiles.
- [ ] Store large source/derived tiles in versioned object storage or a tile
      service, not a Git branch.
- [ ] Keep manifests, schemas, converters, checksums, and tiny fixtures in Git.
- [ ] Support resumable downloads and partial dataset mirrors.
- [ ] Support local external data mounts and persistent developer caches.
- [ ] Keep the current 1 arc-minute tiles as migration fallback.
- [ ] Document how a developer obtains or mounts the dataset.
- [ ] Document storage, bandwidth, and quota requirements before bulk transfer.

### Runtime Loading

- [ ] Add a global tile provider independent from simulation chunks.
- [ ] Stream tiles by camera visibility, distance, LOD, and scope reticle.
- [ ] Keep parent LOD visible during child download.
- [ ] Add bounded but configurable render-tile caches.
- [ ] Add worker-side decode and mesh preparation.
- [ ] Add retries, cancellation/deprioritization, and failure telemetry.
- [ ] Fall back cleanly to the current global base for unavailable tiles.
- [ ] Never allow missing high-resolution data to create a visual hole.

Acceptance:

- The whole world is addressable through one uniform tile system.
- No hand-authored list of territories is required.
- A missing high-resolution tile falls back to a valid parent/base tile.
- Dataset versions and checksums make terrain reproducible.
- No raw multi-terabyte dataset is committed to Git or preloaded in a browser.

## Phase 6: Persistent World-Change Layer

Purpose: make the accurate Earth permanent and make every player/game change
survive cache eviction, restart, updates, and future content systems.

### Authority and Identity

- [ ] Define the immutable base terrain dataset identity and version.
- [ ] Define stable geographic tile coordinates for change records.
- [ ] Define local coordinates within a tile.
- [ ] Define stable IDs for every persistent world object.
- [ ] Define world/save identity and schema version.
- [ ] Define timestamps, ownership, provenance, and change ordering.
- [ ] Define deterministic conflict behavior for simultaneous changes.
- [ ] Define migration behavior when base terrain data is updated.

### Terrain Changes

- [ ] Store excavation, fill, deformation, grading, and surface-material edits.
- [ ] Store water/shoreline modifications if gameplay supports them.
- [ ] Resolve base DEM plus changes into simulation terrain snapshots.
- [ ] Ensure changes are independent of render tile eviction.
- [ ] Ensure changes do not mutate the immutable base dataset.
- [ ] Add journal replay and compaction.
- [ ] Add snapshot generation for frequently accessed tiles.
- [ ] Add save/load tests across cache clears and process restarts.

### Persistent World Objects

- [ ] Buildings and foundations.
- [ ] Roads, paths, bridges, and rail infrastructure.
- [ ] Farms, fields, vegetation changes, and land use.
- [ ] Cities and generated settlements.
- [ ] Ports, docks, maritime infrastructure, and shore changes.
- [ ] Vehicles, vehicle frames, parts, inventories, damage, and ownership.
- [ ] Destroyed, moved, repaired, or replaced objects.
- [ ] World events and generated content with reproducible identity.

### Render Integration

- [ ] Render resolved simulation snapshots without owning them.
- [ ] Rebuild render meshes after persistent changes arrive.
- [ ] Keep far render tiles aware of persistent changes where visible.
- [ ] Keep render caches disposable.
- [ ] Ensure reload/restart reconstructs the same visible world.
- [ ] Add diagnostics comparing simulation state and rendered state.

Acceptance:

- A terrain edit remains after restart.
- A building, port, city object, or vehicle remains after render cache eviction.
- Base-data updates do not erase untouched or modified world state.
- Rendering can be rebuilt from simulation state without data loss.

## Phase 7: Scope and Long-Distance Vision

Purpose: make optics improve all requested visual qualities without changing
simulation authority or hiding terrain defects.

- [ ] Add normal render profile: `6-8 km` clear terrain and `20 km` curved
      horizon.
- [ ] Add scope profile: `30-35 km` visual terrain envelope.
- [ ] Add optical magnification and reticle behavior.
- [ ] Add scope-specific tile prioritization around the reticle.
- [ ] Add higher LOD requests around inspected terrain.
- [ ] Add higher-resolution data requests around the reticle.
- [ ] Add distant entity visibility rules separate from simulation activation.
- [ ] Add atmospheric haze, weather, contrast, and light attenuation.
- [ ] Add line-of-sight and terrain occlusion using the appropriate render/data
      representation.
- [ ] Add binocular/scope distinctions if the equipment system needs them.
- [ ] Verify scope never makes terrain geometry move or rewrite itself.

Acceptance:

- Scope improves magnification, contrast, terrain distinction, entity visibility,
      atmospheric clarity, and relevant terrain LOD.
- Scope does not expand simulation chunks or mutate world state.
- Distant terrain remains curved and continuous.

## Phase 8: Future World Content

Purpose: add the world systems that depend on the stable Earth, terrain, and
persistence foundations.

- [ ] Cities and settlement generation with stable identities.
- [ ] Ports, harbors, docks, and maritime routes.
- [ ] Roads, railways, bridges, and infrastructure networks.
- [ ] Buildings and interiors with persistent construction/destruction.
- [ ] Farms, vegetation, land use, and ecological succession.
- [ ] All vehicle categories and vehicle physics.
- [ ] Vehicle storage, parts, damage, fuel, ownership, and persistence.
- [ ] Rivers, lakes, coastlines, and water-body classification.
- [ ] Weather and atmospheric visibility effects.
- [ ] Flight and high-altitude terrain visibility.
- [ ] World streaming for entities and simulation regions.
- [ ] Save migration and long-term world-version compatibility.

Every feature in this phase must use the persistent simulation world layer and
must not be implemented as render-only decoration.

## Cross-Cutting Verification

- [ ] `npm run type-check` remains clean.
- [ ] `npm test` remains green.
- [ ] `npm run build` remains green.
- [ ] Earth-data verification remains green.
- [ ] Every new pure utility has focused tests.
- [ ] Every new persistent system has save/load tests.
- [ ] Every new render geometry system has CPU-side geometry/coverage tests.
- [ ] Browser smoke tests cover worker loading and WebGL boot.
- [ ] Browser tests cover camera rotation without terrain-coordinate changes.
- [ ] Browser tests cover movement across LOD boundaries.
- [ ] Browser tests cover high-resolution tile fallback.
- [ ] Browser tests cover scope radius and reticle prioritization.
- [ ] Tests cover antimeridian, poles, WGS84 round trips, and ECEF/ENU frames.
- [ ] Tests cover render cache eviction followed by exact world reconstruction.
- [ ] Tests cover persistent terrain edits and object restoration after restart.
- [ ] Tests cover dataset version migration and checksum validation.
- [ ] No simulation module imports Three.js or render-only state.
- [ ] No render cache is treated as authoritative persistent state.
- [ ] No large terrain source is accidentally committed to Git.
- [ ] No implementation silently falls back to procedural terrain.

## Implementation Order and Gates

The phases are intentionally ordered. Do not start global high-resolution
streaming before the coordinate and tile contracts are stable.

1. Phase 0: baseline and testability.
2. Phase 1: current terrain correctness.
3. Phase 2: continuous flat LOD coverage.
4. Phase 3: WGS84/ECEF/ENU coordinate foundation.
5. Phase 4: cube-sphere/quadtree far terrain.
6. Phase 5: global 1 arc-second data product and streaming.
7. Phase 6: persistent world changes.
8. Phase 7: scope and long-distance vision.
9. Phase 8: cities, ports, vehicles, and other future content.

Required gates:

- Phase 1 cannot pass until near terrain and grounding agree.
- Phase 2 cannot pass until there are no tested LOD coverage gaps.
- Phase 4 cannot pass until WGS84 conversion and local rebasing are tested.
- Phase 5 cannot pass until the tile manifest, datum, and distribution plan are
  reproducible.
- Phase 6 cannot pass until render eviction cannot destroy world state.
- Phase 8 content cannot pass until it uses stable persistent identities.

## Open Decisions Before Implementation

These are the remaining decisions that should be explicitly recorded when
implementation begins:

- [ ] Choose the authoritative global 1 arc-second source or source blend.
- [ ] Choose object-storage/tile-service provider and access policy.
- [ ] Choose the precise vertical datum and geoid conversion process.
- [ ] Choose the canonical cube-sphere tile addressing scheme.
- [ ] Choose the persistent storage backend and offline/local behavior.
- [ ] Choose journal format versus snapshot-first storage for each world layer.
- [ ] Choose how multiplayer/future synchronization affects world changes, if
      multiplayer is later enabled.
- [ ] Choose the maximum local cache size and browser storage policy.
- [ ] Choose weather profiles for the normal and scope visibility distances.
- [ ] Choose whether the first WGS84 implementation replaces the current map
      immediately or runs behind a validation/debug switch.

## Definition of Done for the Foundation

The foundation is complete when the application can render a continuous,
WGS84-compatible real Earth from `0` to `20 km`, extend to `35 km` under scope,
stream globally addressable high-resolution tiles with parent fallback, and
reconstruct all persistent terrain changes and world objects after render cache
eviction or restart. Simulation and rendering remain strictly separated, and
no raw multi-terabyte terrain source is required in Git history or browser
preload.

## Deferred Investigation: Green Plane at High Elevation

- [ ] Reproduce the remaining green surface at Everest after a clean build.
- [ ] Identify the exact mesh/material/tile key producing it with a render
      diagnostic; do not assume it is the water plane.
- [ ] Compare its source elevation, local ENU coordinates, and triangle bounds
      against the near and macro terrain meshes.
- [ ] Check whether it is an engine-level terrain-generation artifact that will
      disappear when the spherical/cube-sphere terrain replaces the current
      planar shell.
- [ ] If it survives the terrain migration, fix it at the owning terrain/data
      layer rather than masking it with camera or visibility settings.

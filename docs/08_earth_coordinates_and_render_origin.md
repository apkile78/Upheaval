# 08. Earth Coordinates, Scale, and the Render Origin

## Purpose

This document records the coordinate, scale, and floating-origin decisions that
the near-field renderer and the simulation must agree on, and the fixes that
made them true. It complements [07](07_spherical_earth_and_high_res_plan.md)
(which is the plan) with the current implementation contract.

Three separate contracts live here:

1. **Scale:** how many true ground metres one simulation unit covers.
2. **Face convention:** how cube-sphere face UV maps to the WGS84 ellipsoid.
3. **Render origin:** when geometry may be re-baked and when it must only be
   re-seated.

## 1. Simulation / render scale contract

**Decision (sim + render both true-scale).** One simulation unit is one true
ground metre along the meridian (Z) axis. The X axis is an equirectangular
longitude axis, so one unit covers `cos(latitude)` true ground metres
east-west. A movement step of `d` true metres therefore needs `d / cos(lat)`
world units along X.

Implementation:

- `metersPerUnitX(lat)` in `src/sim/world/earth/earthProjection.ts` returns
  `max(cos(lat), MIN_EAST_SCALE)` with `MIN_EAST_SCALE = cos(85°) = 0.0871557`,
  which bounds the polar stretch instead of dividing by zero.
- `latitudeAt(worldZ)` gives an allocation-free latitude for hot paths.
- `updatePlayerMovement` in `src/sim/playerController.ts` treats the input
  direction as unit-length in true metres, applies `MOVE_SPEED * dt` as a true
  distance, and scales only the X component by `1 / metersPerUnitX(lat)`.

Rationale: the renderer already converts world coordinates to true-metre ENU
(`src/render/earth/localFrame.ts`). Before this change the sim advanced a
uniform distance per tick while the render space compressed east-west distances
by `cos(lat)`, so the visible ground speed depended on latitude (≈0.62× at
London, 0.5× at 60°) and east/west terrain was anisotropic relative to
north/south.

Consequences:

- Ground speed is now uniform and physically meaningful in every direction.
- The 1 arc-minute source still has anisotropic cells on the ground (a cell is
  `1 arc-minute` in both axes, so it is narrower in true metres at high
  latitude). That is a property of the data, not of the movement code.
- Simulation physics that consumes sim-space distances (collision bounds, AI
  ranges, spatial hashing) still uses uniform sim units. Those systems are
  dormant today; when they activate, they should convert through the same
  helper rather than assuming 1 unit = 1 true metre east-west.

Verification: `tests/earthScale.test.ts` converts a movement step through the
render ENU frame and asserts the ground distance equals `SPEED * dt` within 1 %
for east, north, and diagonal steps at 0/24.5/45/60/75/85°, that east and north
steps agree with each other, and that the unscaled (pre-fix) east step is
measurably wrong at 60°.

## 2. Cube-sphere face convention (fixed)

The six faces in `src/render/earth/cubeSphere.ts` use one canonical
parameterization: **negative faces flip `u`**.

| Face | Cube direction |
|------|----------------|
| `+x` | `( 1,  v,  u)` |
| `-x` | `(-1,  v, -u)` |
| `+y` | `( u,  1,  v)` |
| `-y` | `(-u, -1,  v)` |
| `+z` | `( u,  v,  1)` |
| `-z` | `(-u,  v, -1)` |

**Cause of the defect.** `geodeticToCubeSphere` (the inverse) returned
`u = x / |z|` for the `-z` face, but the canonical forward mapping expects
`u = -x / |z|`. The `-z` face was therefore not self-inverse: a point at
`lat -89.999, lon -179.999` rebuilt to `lon -0.001` (the X component came back
with the wrong sign). Every other face already followed the flip rule.

**Fix.** `u: -direction.x / az` in the `-z` branch, with a comment naming the
convention. One line; no other face changed.

**Why this convention and not the other.** Flipping `u` on negative faces keeps
adjacent faces agreeing on their shared geometric edge, which is what makes
tiled cube-sphere terrain seam-free. Changing `faceUvToCube` instead would have
made the round trip pass while breaking edge continuity.

Verification: `tests/cubeSphere.test.ts` now covers, in addition to the existing
anchors (London, Everest, antimeridian, south polar):

- each of the six faces round trips through its own inverse over a 5×5 interior
  UV grid (this is the check that fails if the convention is inverted again);
- twelve shared-edge pairs (one per cube edge) sampled from both sides produce
  identical ECEF points, which locks the convention in the forward direction.

Note: `cubeSphere.ts` and `cubeSphereQuadtree.ts` are not yet wired into the
runtime render path. They are the foundation for the phase-4 far shell.

## 3. Render origin and re-base rule

World coordinates span ±20 Mm, so the renderer keeps a snapped floating origin
(`frameAnchor`, 64 m) plus a local ENU frame (`currentLocalEarthFrame`, same
snap). Render geometry is baked relative to the origin active at build time.

**Rule: a re-base may only translate meshes; it must never re-bake geometry.**

- `src/render/meshBase.ts` stores, per mesh, the origin its vertices were baked
  against (`captureMeshBase`), and re-seats it with `applyMeshBase` by
  translating the mesh to the build origin's position inside the current frame
  (`frameOriginWithin` in `localFrame.ts`).
- `ChunkRenderer.updateAllChunks` already rebuilt only for content changes;
  the re-base path now only calls `syncAnchor()`. Previously `main.ts` cleared
  every chunk mesh and rebuilt all of them on each 64 m anchor step.
- `MacroTerrainManager` re-bakes only rings marked `rebakeOnRebase`. The near
  ring is marked `true` because its clip boundary follows the player and cannot
  be translated; the far ring is `false` (no clip) and is now baked once per
  tile and re-seated, removing ~3 000 mesh rebuilds per re-base.
- **Boundary ownership (`tileOverlapsRing`).** Translation-only re-seating is
  only seam-free if the two rings never draw the same cell. The rule: a cell
  exactly on the shared inner/outer boundary belongs to the ring that owns by
  exclusion (`exclusiveInner`, the far ring); the non-exclusive ring's outer
  test is therefore strict. Both rings share one 256 m cell grid, so together
  they partition every cell inside the far outer radius — no gap, no
  double-drawn surface. (To keep files under the line cap, `macroGeometry.ts`
  now holds only the ring math; tile geometry moved to `macroTileBuilder.ts`.)
- `macroBuildTag()` is the pure decision function behind that policy, so the
  behavior is unit-testable without a WebGL context.

**Residual error.** Translation-only re-basing ignores the ENU basis rotation
between the two origins. That residual is `|P| × Δθ` with
`Δθ ≈ ANCHOR_SNAP / earth radius = 1.0e-5 rad`:

| Distance from origin | Measured re-seat error |
|----------------------|------------------------|
| ≤ 100 m (near field) | < 1 mm |
| ~1.6 km | ~1.6 mm |
| ~1.75 km | ~22 mm |

Verification: `tests/meshBase.test.ts` re-seats baked geometry across a full
anchor step and compares it with a fresh bake in anchor space and in ENU space,
asserting sub-millimetre error within 100 m, centimetre-scale error at macro
distance, and that the error grows with distance. `tests/macroTerrain.test.ts`
locks the re-bake policy per ring and sweeps the near/far cell-ownership
partition over anchor phases (including a tile-corner-aligned player, which
previously double-claimed boundary cells). Final validation for this change:
`tsc --noEmit` clean, all 12 test files pass, `npm run build` succeeds.

**Not done here.** Geometry is still re-baked when content changes or when the
near ring's clip moves, and the ENTITY renderer still allocates one ENU vector
per visible entity per frame (`entityRenderer.update`). Both are follow-ups.


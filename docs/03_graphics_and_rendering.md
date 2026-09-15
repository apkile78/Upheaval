# 03. Graphics, Rendering & Vision Pipeline

> **Status: design intent.** None of the pipeline below is implemented yet; the
> current renderer is Three.js with vertex-colored flat-shaded terrain, fog, and
> a two-perspective camera (see [08](08_earth_coordinates_and_render_origin.md)).

## Photorealistic Visual Target
- Physically Based Rendering (PBR) pipeline utilizing dynamic Global Illumination (GI) and directional moonlight phase calculations.
- Volumetric weather layers (fog, rain density, wetness shaders, snow accumulation).

## Dynamic Line-of-Sight (LoS) & Cutaway System
- **Vision Parity**: Shared raycasted vision cone origin across both implemented
  viewports (first-person and third-person, keys `1` / `2`). A dynamic isometric
  /top-down viewport was removed in the render pass that introduced the floating
  origin; reintroducing it would need the same vision origin.
- **Cutaway Occlusion (Option B)**:
  - Spaces outside direct line-of-sight or field-of-view render in complete darkness / pitch-black cutaway volumes.
  - Structure walls slice downward dynamically based on camera distance so geometry never obstructs player's actual line-of-sight.
- **Tactical Lighting**: Volumetric headlight/flashlight cones double as spatial vectors in the AI perception engine, alerting nearby entities.
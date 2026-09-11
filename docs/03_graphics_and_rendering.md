# 03. Graphics, Rendering & Vision Pipeline

## Photorealistic Visual Target
- Physically Based Rendering (PBR) pipeline utilizing dynamic Global Illumination (GI) and directional moonlight phase calculations.
- Volumetric weather layers (fog, rain density, wetness shaders, snow accumulation).

## Dynamic Line-of-Sight (LoS) & Cutaway System
- **Vision Parity**: Shared raycasted vision cone origin across all 3 viewports:
  - **First-Person**
  - **Third-Person**
  - **Dynamic Isometric / Top-Down**
- **Cutaway Occlusion (Option B)**:
  - Spaces outside direct line-of-sight or field-of-view render in complete darkness / pitch-black cutaway volumes.
  - Structure walls slice downward dynamically based on camera distance so geometry never obstructs player's actual line-of-sight.
- **Tactical Lighting**: Volumetric headlight/flashlight cones double as spatial vectors in the AI perception engine, alerting nearby entities.
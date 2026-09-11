# 04. Survival, Body, & Material Simulation

## Skeletal Rigging & Localized Damage Overrides
- Built around a standard **60+ Bone Humanoid Rig** (glTF/glBLAS compliant).
- Localized health pools (Head, Torso, Left/Right Arm, Left/Right Leg) directly apply bone-weight transform overrides:
  - **Leg Injury**: Blends procedural limping weights on lower spine/leg bones; slows movement speed.
  - **Arm Injury**: Scales weapon sway, recoil transforms, and reload duration multipliers.

## Layered Gear & Thermal Dynamics
- **4-Layer Matrix**: `Inner Layer` -> `Middle Layer (Insulation)` -> `Outer Armor` -> `Strapped Gear`.
- Gear friction model computes insulation, water-retention/wetness, wind resistance, weight, and stamina penalties dynamically.

## Crafting Engine
- **Menu-Driven**: Searchable UI querying local tools, environmental heat sources (campfires/ovens), and inventory items.
- **3D Blueprint World Placement**: Large-scale structures/vehicle installations place transparent 3D ghost meshes into world grid requiring real-time material feeds.
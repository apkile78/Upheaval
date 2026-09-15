# 06. Vehicles, Base Building, & Physics

> **Status: design intent.** Nothing in this module is implemented yet: no
> vehicle, construction, or debris system exists in `src/sim/` today.

## Modular Vehicle Frames
- Built on interconnected structural frame grids.
- Individual components (engines, battery banks, solar arrays, seating, armor plates, tires) exist as detachable sub-meshes with distinct weight, health, and functionality.

## Micro-Grid Base Building
- **Placement**: Micro-grid aligned snapping for walls, barricades, doors, and furniture.
- **Structural Integrity**: Load-bearing physics checks require foundation/pillar support. Destroying ground-level supports triggers structural collapse of higher floors.

## Physical Debris Slicing
- Structural destruction breaks objects/walls into material-based physical rigid-body debris chunks when impacted by explosives, heavy weapons, or high-speed vehicle crashes.
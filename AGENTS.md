# Upheaval Agent Guide

## Start Here

Before changing code, read [the agent rules](docs/AGENT_RULES.md) and the relevant module document:

- [Engine architecture](docs/01_engine_architecture.md)
- [World and terrain generation](docs/02_world_and_terrain_gen.md)
- [Graphics and rendering](docs/03_graphics_and_rendering.md)
- [Survival and body systems](docs/04_survival_and_body_systems.md)
- [AI, perception, and ecology](docs/05_ai_perception_and_ecology.md)
- [Vehicles and construction](docs/06_vehicles_and_construction.md)
- [Spherical Earth and high-resolution terrain](docs/07_spherical_earth_and_high_res_plan.md)

Use [project context](docs/context.md) for current design decisions and terminology. Treat the documentation as part of the project, not as background reading.

## Documentation Is Required

For every substantive request, update `/docs` before finishing. This includes:

- fixes: record the cause, the chosen solution, and any verification result;
- confirmed ideas or design decisions: record the decision, rationale, and affected systems;
- unresolved questions: record the question, relevant trade-offs, and the information needed to answer it.

Prefer the existing relevant document. Create a focused new Markdown file when no existing document fits, then link it from the appropriate index or module document. Keep entries concise and link to existing detail rather than duplicating it. A request may skip a documentation edit only when it is genuinely mechanical and has no behavioral, design, or project-knowledge impact.

## Architecture Boundaries

- Keep simulation code in `src/sim/` independent of Three.js and other render dependencies.
- Keep rendering code in `src/render/`; shared contracts belong in `src/types/`.
- Preserve the established module boundaries and keep source files small; ask before expanding a change across more than three unrelated files.
- Do not introduce `any`; define explicit types in `src/types/` or the owning module.
- Do not add dependencies or modify `package.json` without explicit user approval.
- Avoid allocations in render and simulation hot loops; reuse vectors, buffers, and typed arrays where the surrounding code does so.

## Verification

Use the scripts in [package.json](package.json):

```sh
npm run type-check
npm test
npm run build
```

Run the narrowest relevant check first, then the broader checks when the change affects shared behavior. Add or update a focused test for new utility or system behavior. Never delete or weaken existing tests to make a change pass.

## Working Style

Keep each task narrowly scoped, preserve unrelated user changes, and avoid speculative refactors. When a core interface or architectural boundary must change, explain the impact and get approval before proceeding. Use the existing docs and nearby implementations as the source of truth; update them when the source of truth changes.
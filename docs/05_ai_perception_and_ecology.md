# 05. AI, Perception, & Horde Mechanics

## Multi-Vector Sensory Propagation
- **Sound Propagation**: Expanding noise spheres calculate acoustic dampening when traveling through physical walls, doors, or open terrain.
- **Scent Vectors**: Scent nodes drift downwind based on dynamic weather vectors, letting scent-tracking threats pursue over distances.
- **Sensory Weather Modifiers**: Rain dampens footstep acoustic range and cleans scent trails; fog cuts line-of-sight distance.

## Off-Screen Horde Migration (Heatmaps)
- To preserve WebGL2 performance, off-screen zombies collapse into low-cost background statistical **Heatmap Arrays**.
- Migrating hordes follow sound vectors/urban density nodes and instantiate back into full 3D physical entities when entering active camera chunks.

## Threat Spectrum & Faction Ecosystem
- **Grounded Infected**: Focus on slow/fast, decaying, and physically plausible infected types (no supernatural acid/armored mutations at core start).
- **Advanced NPC & Wildlife AI**: Autonomous animal ecology and high-tier human NPC survivor AI capable of looting, squad combat, building defenses, and attacking infected independently.
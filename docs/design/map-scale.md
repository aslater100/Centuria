# Map Scale Limits — design rule

**Each stage of the game plays on a hard-bounded map. Growth never
stretches the current canvas; it promotes you to the next, more abstract
one (the spine, GDD §2).** This is both a performance budget and a
readability guarantee — every tier's map fits in the player's head.

| Stage | Canvas | Hard limits | Why this size |
|---|---|---|---|
| **Tier 1 — Town** | 64×64 tiles (`world.ts: MAP_W/MAP_H`) | ≤150 individually simulated settlers (soft cap at 60, `TUNING`) | One screen-and-a-bit of pannable space; A* and per-agent sim stay trivially cheap; a town that "fills" the map is *supposed* to expand outward, not sprawl |
| **Tier 1.5/2 — Region** | 64×64 cells over 0–100 coords (`worldgen.ts: REGION_N`) | **≤9 settlements** (`region.ts: MAX_SETTLEMENTS`) incl. expeditions; expedition reach 18 cells | 9 = the 3-towns-×-3-states promotion arithmetic (GDD §2.2); one region cell ≈ one town map; the whole State is legible on one screen |
| **Tier 3 — Nation** *(planned)* | continental view of ~6–8 regions rendered as **provinces**, never cells | ≤9 settlements per region stands; ~12 provinces per nation; rival nations get the same budget | The nation map aggregates regions the way the region map aggregated tile maps — same flip, one level up |

Rules that follow:

1. **No infinite scroll, ever.** If a map feels full, that pressure is the
   game working as designed — the release valve is promotion (or, at
   Tier 3, diplomacy and war over *other* people's bounded land).
2. **New canvases are generated, not grown:** when Tier 3 arrives, the
   world's other regions are generated from the same seed at Proclamation
   — the existing region map is never resized.
3. **Every limit is a named constant** with this doc referenced, never a
   magic number: `MAP_W`/`MAP_H`, `REGION_N`, `MAX_SETTLEMENTS`,
   `TUNING.hardCapPop`.
4. **Budgets are coupled:** map size × entity caps are the performance
   contract that keeps the deep sim affordable (GDD §2.4's flip exists
   for exactly this reason). Changing one means re-validating the other
   in the headless harness.

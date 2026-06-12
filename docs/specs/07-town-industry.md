# Milestone 7 — Town Industry & Infrastructure (v0.25.0)

Twelve tech-gated buildings turn the Town-Hall research tree (v0.24.0) from a
list of unlockables into working systems: raw extraction, three production
chains, health and defence infrastructure, stone-grade housing, and faster
research. Every building is gated behind a town tech; nothing here is buildable
on day one.

## Buildings (tech → building)

| Tech | Building | Provides |
|---|---|---|
| Carpentry | Sawmill | wood → timber (2:1) |
| Prospecting | Mine | clay/ore from **mine zones** (rock tiles) |
| Brickwork | Kiln | clay → brick (2:1) |
| Blacksmithing | Blacksmith | iron ore + coal → iron → tools |
| Animal Husbandry | Animal Pen | livestock on **pasture zones** → dairy/day |
| Herbalism | Herb Garden | herbs on a 6-day timer |
| Germ Theory | Apothecary | herbs → medicine |
| First Aid | Well | colony-wide infection reduction |
| Fortification | Watchtower | logs a raid warning N days early |
| Commerce | Warehouse | bulk raw-goods storage |
| Stone Masonry | Longhouse | communal stone housing (cap 12) |
| Schooling | Schoolhouse | +25% town research per building |

## Production chains

Three chains run off the shared `craft`/`smelt`/`mine`/`ranch` work kinds.
A building enqueues one job at a time, capped by an output ceiling so settlers
don't grind raw stock to zero:

- **Timber:** Sawmill, `wood ≥ cost+10 && timber < 20`.
- **Brick:** Kiln, `clay ≥ 2 && brick < 30`.
- **Metal:** Blacksmith smelts `2 ore + 1 coal → 1 iron` (gated on Iron
  Smelting), then `2 iron → 1 tools`. The **first tools batch** logs a notice;
  any tools in stock speed *all* construction by 20% (`buildSpeedMult`).
- **Medicine:** Apothecary `2 herbs → 1 medicine`. Medicine in stock × clinic
  rest = +50% heal rate, consuming one unit per full recovery.

## Zones

`flax`, `pasture`, `mine` join farm/stockpile/wall as paintable tiles
(`ZoneKind` already carried the fields from the v0.23 foundations).

- **Flax** is a *perennial* soil crop: it grows year-round (8-day cycle) and is
  exempt from the winter-kill and drought loops. Harvest → 3 flax. With Textile
  Farming, the tailor spins flax into clothes instead of eating grain — and the
  clothes job now fires on **either** flax **or** spare grain (the generation
  guard used to gate on grain alone, starving flax-rich/grain-poor colonies of
  clothing).
- **Pasture** caps an Animal Pen's herd at `min(penCap, pastureTiles × 2)`.
- **Mine** paints only on rock; each tile holds 20 charges. A charge yields clay
  (or, with Iron Mining, a clay/ore/coal roll). Exhausted veins revert to grass.

## Tech mechanics (research that changes numbers, not just menus)

Crop Rotation +20% grain yield · Militia Training +2 effective combat ·
Repeating Arms +10 raid damage · Literacy +2 skill cap · Iron Smelting opens
the metal chain · Textile Farming reroutes clothing onto flax.

## Lesson

Wiring a building's *execution* (the tailor can spin flax) without its *task
generation* (the job only fired when grain was plentiful) is a silent dead
feature — it type-checks, ships, and quietly never runs. Smoke-test the trigger
condition, not just the effect. Caught here by a 20-check headless harness run
before merge.

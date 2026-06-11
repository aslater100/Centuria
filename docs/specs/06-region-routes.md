# Milestone 6b Spec — Region Routes: Corridors, Caravans & Upkeep

Implements §3 of the transportation design (docs/design/transportation.md):
movement between towns stops being free. Routes are first-class objects laid
along real terrain corridors; everything that moves between settlements —
grain, migrants, the charter itself — now rides the network.

## Corridors (worldgen)

- `RegionMap.cellCost(x, y)`: plains 1, forest 1.3, hills 1.8, marsh 2.2,
  mountains 3.5, river 3 (1 + 2 bridge surcharge), sea/lake impassable
  (ferries are a later era).
- `RegionMap.corridor(a, b)`: A* over the 64×64 cell grid (binary heap,
  manhattan heuristic, **Float64 distances** — the 6a mixed-precision
  lesson, applied). Pass-finding through valleys emerges from the cost
  field; mountain roads are gloriously expensive, which is the point.
- Corridors between fixed towns never change, so `RegionSim` memoizes them
  (the UI prices roads every frame).

## Routes (region sim)

`Route { a, b, kind, condition 0–100, path: cells[], terrainCost, freight }`

| Kind | Gate | Build cost | Capacity (food/mo) | Maintenance |
|---|---|---|---|---|
| Trail | auto on founding | free | 60 | none; −2 condition/storm-day, footfall regrows +0.1/day |
| Wagon road | State + treasury | £2 × terrain cost | 200 | £0.2/cell/mo from the treasury |

- **Effective capacity = capacity × condition/100.** Condition floors at 15:
  a rotted route is still a walkable track (a road at the floor carries less
  than a healthy trail — the unmaintained empire rots, GDD's long-lag decay
  made local).
- **Unpaid maintenance** (empty treasury) drops road condition 6/month and
  logs the rutting-over.
- **Trails are blazed automatically** when an expedition founds a town
  (origin → new town), so the network is a tree by construction; if water
  truly separates two towns the chord stands in (peddler boats).

## Everything rides the network

- **Caravans clamp to capacity:** monthly transfers route through the graph
  (BFS hop-path); the amount sent = min(need, surplus, remaining capacity
  along every leg). Freight is recorded per route (the overlay's number).
  A famine behind a goat trail is now possible — and fixable with money.
  With **no route at all**, smugglers move the grain at 30% efficiency.
- **Migration** between unconnected towns drops to a 30% trickle.
- **The charter requirement is real** (GDD §2.2): `charterEligible()` now
  demands every settlement reachable through the route graph, and the
  Statehood banner calls out unconnected towns.

## UI

- Region map draws routes along their actual corridors — dotted trails,
  solid roads, line brightness = condition — instead of the old hub chords.
- Settlement panel gains a ROUTES section: status per neighbor and a build
  button priced by the land, with the itemized bill in the tooltip
  ("£38: 12 plains, 6 hills, 1 river crossing"). Roads need the State.
- State panel gains the freight readout (food moved per route, last
  caravan season).

## Tests (9 new; 61 total passing)

Corridor contiguity/land-only/admissibility, auto-blazed trails, the
trail→road capacity ceiling, condition→capacity loss, the smuggler
fallback, the State gate on building, treasury charge + double-build
rejection, funded-vs-starved maintenance, and the charter connectivity
gate.

## Deferred to 6c

Rail (tech gate ~1912, stations, art), the full storm-damage/repair event
loop, militia response bonus over connected routes, animated wagon dots on
busy routes.

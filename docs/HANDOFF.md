# Session Handoff — 2026-06-11 (post-M6b)

## Where things stand

- **Merged:** PR A (0.1 stabilization), PR B (tile-paint zones), PR #10
  (Electron desktop app + release pipeline), PR #11 / B2 (economy
  buildings), PR #12 / C (gates, wildlife, armed pawns, menu, save/load,
  SFX — v0.3.0).
- **This PR (M6b):** region routes — A* corridors over the terrain,
  trail/road Route objects with condition & maintenance, capacity-clamped
  caravans, the charter's "all towns connected" gate made real, route
  rendering + build UI. Version bumped to 0.4.0. Spec:
  docs/specs/06-region-routes.md.

## Release (pending — needs the user)

No `v*` tag has ever been pushed, so no desktop release exists yet. The
session tooling cannot push tags (403) or dispatch workflows (403). After
merging this PR, either:

- `git tag v0.4.0 main && git push origin v0.4.0`, or
- run the **Release** workflow on `main` via workflow_dispatch.

One `v0.4.0` release supersedes everything earlier (0.2/0.3 were never
tagged).

## Ship loop

After each merged gameplay PR: bump `package.json` version in the PR,
then push the matching `v*` tag after merge.

## User's standing instructions

- Each task = its own draft PR. User merges and play-tests themselves.
- Be frugal with tokens; tests run in CI (test.yml). Run only targeted
  local tests when diagnosing.
- Goal: "fully fleshed out game based on everything planned."

## The plan from here

**Next committed milestone: 6c** (docs/design/transportation.md §6) —
rail era (tech gate ~1912, stations, art), the storm-damage/repair event
loop, militia-response bonus over connected routes. After 6c the
transportation design is complete and the field is open again; ideas
consistent with the GDD: combat polish (ranged weapons, a smithy),
animal husbandry, town-tier fishing jobs, region-tier save/load (the
in-game menu disables saving after the flip), music/ambience, more event
variety.

## Architecture notes for M6b

- `RegionMap.cellCost` / `RegionMap.corridor` (worldgen.ts): A* over
  region cells, Float64 distances (the 6a precision lesson). Water is
  impassable; river cells cost 3 (bridge surcharge).
- `RegionSim.routes: Route[]`; specs in `ROUTE_SPECS` (region.ts). Trails
  auto-blaze in `updateExpeditions` via `blazeTrail`; roads via
  `roadCost`/`buildRoad` (State + treasury gated). Corridors memoized in
  `corridorBetween` — the panel prices roads every frame.
- Effective capacity = capacity × condition/100, floor 15. Daily wear in
  `weatherRoutes` (storms), monthly upkeep in `maintainRoutes` (called
  from `monthlyEconomy`).
- `caravans()` is now **public** (tests drive a caravan season directly)
  and clamps to min remaining capacity along the BFS hop-path
  (`routePath`); no-route fallback is 30%. `migrate()` checks
  connectivity. `charterEligible()` requires `connectedToAll()`.
- Region tier still has no save/load — `sim.serialize()` is town-tier
  only; the in-game menu disables saving after the flip.
- Test note: route logs consume RNG draws, so region RNG sequences
  shifted vs. 0.3.0 — full suite (61 tests) re-run and green, including
  the 60-day survival test.

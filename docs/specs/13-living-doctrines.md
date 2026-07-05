# Spec 13 — Living rival doctrines (two-sided composition war)

**Goal:** close the last-named Mechanics gap for a defensible 10 on combat *depth*. Spec 11
landed the combined-arms counter triangle in the province resolver and retrofitted the main
player-war path (`tickPlayerWar`), but the enemy there was `rivalWarComposition(year)` — a single
**static, era-only stub, identical for every rival**, with terrain forced to `undefined`. The
"tactical duel" in the path players actually live in was therefore *player choice vs. a scripted
constant*. This spec makes that duel **genuinely two-sided and per-opponent**.

## Scope — Phase 1 only (schema-free, NOT a Hard Stop)

No save-schema change, no new serialized field, no new RNG draw. Pure functions over existing
rival state. Phase 2 (reactive doctrine memory that adapts mid-war) requires a persisted field →
a save-schema Hard Stop → held for separate explicit sign-off.

### §A — differentiated rival doctrine (`rivalComposition`)

New pure function `rivalComposition(rv, year)` in `systems/military.ts`, layered on top of the
existing era baseline `rivalWarComposition(year)` (kept — the era arms + baseline counts):

- `offense = (weights.expansion + weights.risk) / 20` ∈ [0,1], with **0.5 = neutral**.
- Per-arm multiplier on the era-base counts:
  - `militia   = max(0.25, 1 + (0.5 − offense) · 0.8)` — cautious isolationists mass infantry.
  - `cavalry   = max(0.25, 1 + (offense − 0.5) · 0.8)` — aggressive powers field shock/mobility.
  - `artillery = max(0.25, 1 + (offense − 0.5) · 0.5)` — aggressive powers invest in guns.
- A neutral temperament (offense = 0.5) returns the era base **unchanged** (all mults = 1), so
  `rivalComposition` is a strict generalization of the old stub.

Effect: a **Hegemon** (expansion 9, risk 7 → offense 0.8) fields a shock/gun-heavy force; a
**Hermit Kingdom** (expansion 2, risk 2 → offense 0.2) masses defensive militia. Because the
counter triangle is militia→cavalry→artillery→militia, the player's optimal counter now **differs
by opponent** — militia+cavalry balance against the Hegemon's horse/guns, artillery against the
Hermit's infantry mass. Rival temperament is read off `weights` (archetypes are presets over
`weights`; named rivals carry custom weights), so it generalizes beyond the five archetypes.

### §B — theater terrain in the main war

`tickPlayerWar` passed `biome = undefined` to `compositionMult`. It now passes the **home
theater**: the biome of the player's largest settlement (`playerHomeBiome`, by `popOf`). Rivals
are off-map (compass only, no map position), so the decisive terrain is the player's own ground —
the land the nation musters and defends on. Terrain reweights *both* sides' land power
symmetrically (rough ground favors infantry, open ground favors cavalry), adding a second, fair
consideration to the player's counter decision. Deterministic.

## Determinism & byte-identity

- No war active → `tickPlayerWar` returns early → `serialize-determinism` untouched.
- Empty `w.units` (abstract/pre-unit war) → `compositionMult(mine=[], …) = 1`, so the player side
  is unchanged; the rival side keeps whatever combined-arms bonus the era stub already granted.
- With real player units, war-score trajectories **change on purpose** (this is the balance
  change). War-setup tests re-pinned as needed; `npm run sim` ending distribution checked for no
  regression (composition does not drive autoplay endings — climate/coalition/revolution do).

## Verification bar

Build ✓ · full suite ✓ · new `tests/living-doctrines.test.ts` (differentiation, neutral =
baseline, per-opponent counter flips a numerically-inferior force, terrain shift) · `npm run sim`
ending distribution unchanged vs. baseline · no new `any` · no schema change.

## Phase 2 (deferred — Hard Stop)

Persist a per-war rival composition that shifts a fraction of its force toward countering the
player's observed mix each month (with lag), so the player scouts → counters → the rival counters
back → the player re-balances: a rock-paper-scissors *tempo* war. Requires `SAVE_SCHEMA_VERSION`
bump + serialize/deserialize + version-pin test updates. Not started; awaits explicit sign-off.

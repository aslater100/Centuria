# Spec 09 — Audit-to-9 design pre-work

Orchestrator-authored specs for the tasks in `centuria-plan.md` that need design judgment.
Implementation agents: use these numbers exactly — do not invent constants.

---

## §M1 — Multi-round battle resolution

Applies to `resolveProvinceBattle` and `resolveArmyGroupBattle` (`src/sim/systems/military.ts`).
Replaces the single `power >= enemy * (0.8 + rng*0.4)` roll with up to **3 attrition rounds**.

**Definitions**
- *Defender* = the side whose faction owns the province (`settlement(provinceId).factionId`);
  if neither owns it, the side that was already stationed there (non-moving) defends; if
  ambiguous, the rival defends (player is marching in).
- *Effective power* per side, per round: same power formula each function uses today
  (morale-weighted; keep the existing `rivalBoost` in `resolveProvinceBattle`), times:
  - **Home-ground modifier**: defender ×1.10.
  - **Fortification modifier**: defender ×1.05 additionally if the province settlement's
    `buildings` include any defensive structure (resolve the actual ids from
    `src/data/buildings.json` / `region_buildings.json` at implementation time — e.g. walls,
    fort; if no such building ids exist, omit this modifier). Cap the combined defender bonus
    at ×1.25.
  - **Supply penalty**: ×0.90 for a side that is under-supplied — provincial armies:
    `army.supply <= 0`; army groups: `army.supply < 0.4` (any army on the side qualifies the
    whole side).

**Round loop** (max 3 rounds)
1. Compute both effective powers. Round winner: attacker wins the round iff
   `attackerPower >= defenderPower * (0.85 + rng.next() * 0.3)` (one RNG draw per round).
2. Round loser: unit counts ×0.85 (min 1 where today's code enforces min 1), morale −8.
   Round winner: counts ×0.95, morale −3. For army groups use `manpower` ×0.85 / ×0.95 and
   the same morale deltas.
3. **Rout check**: if either side's total effective power has fallen below 30% of its
   round-1 starting value, the battle ends immediately; that side loses the battle and takes
   an extra morale −10.
4. Otherwise continue to the next round.

**Battle outcome**: side with more round wins takes the battle (best of 3). Tie after 3
rounds → defender holds, attacker counts as the loser. Then apply exactly the existing
post-battle consequences (loser retreat destination, `relations −5`, `lastBattleWon`,
`wonBattleThisMonth`, casualty log line, filtering dead armies) — the per-round attrition
above **replaces** today's flat winner×0.8/0.9, loser×0.7 casualty multipliers; do not apply
both.

**Invariants / acceptance tests** (`tests/military-battle.test.ts`)
- (a) Across 100 seeded trials at power ratio 1.5:1, the stronger side wins ≥ 70%; at 1:1
  (no defender bonus), each side wins 35–65%.
- (b) No side's unit count / manpower ever goes below 0 or loses more than committed.
- (c) Existing war-materiel / front-line / serialize-determinism tests still pass.

---

## §M2 — Diplomacy counter-offer (player counters a rival offer)

Scope: player-side counter to a standing rival offer in `this.offers`. **No persisted
negotiation state** — the counter resolves immediately inside one action call, so the save
schema is untouched (offers array shape unchanged).

**New RegionSim action** `counterOffer(rivalId: number): { accepted: boolean; gift: number }`
- Precondition: an offer from `rivalId` exists (`offerFor`). No-op `{accepted:false, gift:0}` otherwise.
- The counter's meaning: the player asks for a **signing gift** (sweetener) before accepting
  the treaty. Gift size = `round(50 + rival.pop * 0.01)` £.
- Accept probability, one `aiRng` draw:
  `p = clamp(0.05, 0.9, 0.35 + rival.relations/200 + rival.weights.commerce*0.03 + rival.weights.honor*0.02 - rival.weights.grudge*0.02)`
- **Accepted**: treaty is signed exactly as a normal acceptance of that offer kind, treasury
  += gift, relations +2, log `"<name> agrees to sweeten the accord — <gift> changes hands."`
- **Rejected**: offer withdrawn (removed from `this.offers`), relations −3, log
  `"<name> takes the haggling as an insult and withdraws the offer."`
- Counter is one-shot per offer: since rejection withdraws the offer, no round counter is
  needed.

UI: wire a third button (Accept / **Counter** / Decline) wherever the offer UI renders; if the
offer UI is out of easy reach, expose the action and add the test — UI hookup may be a
follow-up noted in the handoff.

**Tests** (`tests/diplomacy.test.ts`): seeded accept path (treaty present, treasury up,
offer gone) and reject path (no treaty, offer gone, relations −3).

---

## §M3 — Naval blockade

During an active **player war** (`r.playerWar` non-null), sea lanes run a blockade gauntlet.

`blockadeMult = 0.65 + 0.35 * min(1, warships / 6)` where `warships` = player warship count
(`r.playerWar.units` warship entry, as `navalTradeIncome` already reads).

Apply the multiplier in two places:
1. `navalTradeIncome` (`src/sim/systems/naval.ts`): the **sea-lane term only**
   (`seaLanes * perLane * blockadeMult`); harbor base income unaffected.
2. Sea-route capacity: mirror wherever `route-weather.ts` scales sea-leg capacity/condition —
   apply `blockadeMult` to sea routes' effective throughput **only while `playerWar` is
   active**. If route-weather has no clean seam for a second multiplier, scope to (1) only
   and note it in the handoff — do not refactor `effectiveCapacity` in region.ts for this.

**Determinism guard**: when `playerWar` is null the multiplier must be exactly 1 and no extra
RNG may be drawn — peacetime streams stay byte-identical.

**Tests** (`tests/naval-blockade.test.ts`): war + 0 warships → sea-lane income ×0.65;
war + 6 warships → ×1.0; no war → identical to pre-change values.

---

## §R2 — Ideology/coalition layer in elections

`runElection` (`src/sim/systems/elections.ts`) currently uses `avgSat` alone. New formula
(no RNG — keep the file's "no RNG" contract):

```
estateBlend = Σ(faction.power × faction.support) / Σ(faction.power)   // r.factions (3 estates)
electoralApproval = 0.5 * avgSat + 0.5 * estateBlend
```

Use `electoralApproval` (not `avgSat`) for: political capital earned, the
LANDSLIDE/MAJORITY/MINORITY/LOST thresholds, and the legitimacy bonus. Keep the log format,
showing the blended figure. If `r.factions` is empty, fall back to `avgSat` alone.

**Tests** (`tests/elections-coalition.test.ts`): a swing scenario — avgSat 60 but hostile
estates (support ~20, high power) drags the result below the MAJORITY threshold; and the
reverse (avgSat 40, adoring estates) lifts it.

---

## §U6 — Keyboard shortcut map

Existing (unchanged, in `main.ts`): Space pause · 1/2/3 speed · +/− zoom · Ctrl+S save ·
Esc pause menu · T research · P province view · B central bank.

New bindings (in `regionview.ts`, following main.ts's handler pattern; must not fire while
focus is in an `<input>`/`<textarea>` and must not collide with the list above):

| Key | Action |
|---|---|
| `E` | Toggle Economy panel |
| `G` | Toggle State/Government panel |
| `O` | Toggle Overview panel |
| `C` | Open the standalone century graph (U10's entry point) |
| `?` (Shift+/) or `H` | Toggle the WikiPanel help (U3) |

Bind to whatever the actual tab-strip toggle functions are in `regionview.ts` — locate them,
don't invent a new tab system. Add a "Keybindings" section to `WikiPanel` listing the full
table (existing + new).

---

## §U7 / §U8 / §U9 — scopes (from centuria-plan.md, confirmed)

- **U7**: (a) `setVolume(0–1)` on the audio registry + music, sliders next to the existing
  toggles in `titlescreen.ts`; (b) `--ui-scale` CSS custom property, 3-step control;
  (c) crisis-red vs healthy-green: add icon/pattern where hue is the only differentiator.
- **U8**: breakpoints **≤1280px** and **≤1024px** in `src/style.css`; WindowManager panels
  clamp to viewport.
- **U9**: crisis pins + legend on the minimap only. **Fog-of-war stays cut** — do not
  reintroduce it.

---

## §D1 — Hyperinflation loss state — **APPROVED 2026-07-04 (schema change signed off by owner)**

Design (adapted to the actual model — `inflationRate` is hard-clamped at 0.50, so the plan's
"200% annualized" is unreachable; the collapse threshold must live inside the clamp):

- Trigger: `inflationRate >= 0.45` **and** `confidence < 20` at the monthly check.
- Persisted counter `hyperinflationMonths` on `RegionSim` (+ serialize/deserialize +
  save-version bump): increments when the trigger holds, resets to 0 otherwise.
- At 12 consecutive months → currency collapse: game over via the same path as the
  depopulation check (`region.ts:6244-6247`), log a collapse narrative.
- Escape hatches (must be reachable): rate hikes / regime switch / devalue can push
  inflation or confidence back across the line any month and reset the counter.
- Tuning gate before merge: 20-seed × 100-year default sweep must show **zero** collapses;
  a scripted print-regime + supply-shock scenario must collapse within ~3 game-years.

**APPROVED 2026-07-04.** Owner signed off on the `RegionSim` schema change; old saves may be
discarded (see §Save). Field: `hyperinflationMonths: number` (default 0).

## §D2 — Revolution → partition chain — **APPROVED 2026-07-04 (territory/state mutation signed off)**

- After a revolution outcome fires (demographics.ts), if the same settlement's grievance
  stays ≥ the revolt-critical line for 3+ consecutive post-revolution months, roll
  `8% × difficultySettings.crisisFrequency` per month: the settlement secedes (factionId
  reassigned to a rebel faction or the nearest hostile rival), feeding `victory.ts`
  territory checks.
- Persisted post-revolution counter + territory reassignment — **signed off 2026-07-04**.
  Field: `postRevoltGrievanceMonths: Record<number, number>` keyed by settlement id (default `{}`),
  so a per-settlement counter survives save/load. Secession reassigns `settlement.factionId`
  to the nearest hostile rival faction (or a rebel faction if none is hostile); this feeds
  `victory.ts` territory-control checks.
- Tuning gate before merge: the 20-seed × 100-year default sweep must show partition as
  **rare** (not zero — unrest is a real pressure), and a scripted high-grievance scenario must
  reliably partition within a few post-revolution years.

## §Save — schema v2 + save management — **APPROVED 2026-07-04**

Owner decisions: old saves need NOT load; provide delete, load, and a real autosave.

**Schema version (hard cutover, not migration):**
- Add `export const SAVE_SCHEMA_VERSION = 2` (region.ts). `serialize()` writes `v: 2`
  (bump the existing hardcoded `v: 1` at region.ts:12277).
- `deserialize()` (region.ts:12499) gains a gate at the top: if `(d.v ?? 0) < SAVE_SCHEMA_VERSION`,
  throw a typed `IncompatibleSaveError` (new, exported). Callers catch it and offer delete-only.
- Bump the boot-quicksave wrapper `v: 4 → 5` (main.ts:98 write / main.ts:33 boot gate) so
  stale quicksaves are ignored on boot rather than half-loaded.
- `SaveSlot` (pausemenu.ts:7-12) gains `schemaVersion: number`; the load menu labels any slot
  whose stored region blob is below `SAVE_SCHEMA_VERSION` as “⚠ Incompatible — delete only”.

**New persisted fields (register in all three places per the serialize map):**
- Class field decl (near `unrestMonthsAtLevel`): `hyperinflationMonths = 0` and
  `postRevoltGrievanceMonths: Record<number, number> = {}`.
- `serialize()` object literal tail (~region.ts:12493): add both.
- `deserialize()` tail (~region.ts:12840): `r.hyperinflationMonths = d.hyperinflationMonths ?? 0;`
  and `r.postRevoltGrievanceMonths = d.postRevoltGrievanceMonths ?? {};` (harmless if the gate
  above is ever relaxed).

**Delete:** `deleteSaveSlot(index)` (pausemenu.ts) removes the slot record; a ✕ control per slot
opens a Modal confirm (reuse the U1 Modal, not `confirm()`). Also expose a clear-autosave action.

**Autosave (owner defaults, adjustable):**
- Cadence: once per in-game **year** (hook the year-rollover in the tick loop).
- Target: the existing `centuria-save` quicksave key — SEPARATE from the 3 manual slots, so the
  manual slot count stays **3** and an autosave never clobbers a manual save.
- The Load menu surfaces the autosave as its own “Autosave (auto)” entry alongside the 3 slots.
- Ctrl+S remains a manual “save now” into the same quicksave key.

**Delegation split:**
- Inline / orchestrator-owned (game-state integrity, save schema, sim math): D1, D2, the schema
  version + `IncompatibleSaveError` + serialize/deserialize, the autosave tick hook, and §M3’s
  blockade-capacity trade effect (economy logic). All in region.ts / monetary.ts /
  demographics.ts / naval.ts / main.ts.
- Delegated (UI, after the core lands): save-management UI (delete/load/incompatible labels,
  autosave load entry) in pausemenu.ts/main.ts; §M2 Counter button in regionview.ts; §U7
  remaining color cues in panels.css/regionview.ts.

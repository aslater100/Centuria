# Centuria — Path to 9/10 per Category

Source: audit delivered 2026-07-03 (see session-log.md when created). Baseline scores:

| Category | Current | Target |
|---|---|---|
| Mechanical depth | 8/10 | 9/10 |
| Realism | 7/10 | 9/10 |
| Graphics | 7/10 | 9/10 |
| Difficulty | 6/10 | 9/10 |
| Lore depth | 3.5/10 | 9/10 |

**Status: PLAN ONLY. Nothing below has been dispatched or implemented.** Per CLAUDE.md this is a
multi-step, cross-cutting change set — it needs an explicit "go" before any task is delegated.

## How to read a task card

- **Orchestrator pre-work** — hard reasoning (formula/threshold/schema design) that CLAUDE.md
  reserves for the orchestrator, done *before* any task is delegated. Never skipped.
- **Fable 5 task** — the literal, copy-pasteable prompt to hand to a Fable 5 agent once
  pre-work is done. Scoped to: named files, exact acceptance test, no open design judgment.
- **Hard Stop** — flagged wherever a task touches save/schema or serialized `RegionSim` state.
  Per CLAUDE.md these need separate explicit approval, every time, regardless of the overall
  plan being approved.

---

## 1. Mechanical Depth (8 → 9)

Gap: combat (`military.ts:67` `resolveProvinceBattle`, `:156` `resolveArmyGroupBattle`) and
diplomacy (`region.ts:13514` `rivalDiplomaticRound`) both resolve as a single power-ratio +
RNG roll. No terrain, fortification, or negotiation-round fields exist in the data model today
— confirmed by grep, not assumed.

### M1 — Multi-round battle resolution
- **Orchestrator pre-work:** design a 2–3 round attrition model replacing the single roll —
  round-by-round power decay, a supply-line penalty already partially available via
  `consumeWarMateriel`, and (new) a terrain modifier keyed off existing `Province` fields only
  (no new persisted fields unless unavoidable). Draft exact formula + run against 3+ headless
  seeds to confirm no runaway win/loss skew before handoff.
- **Fable 5 task:** *"Implement the attrition-round battle formula specified in
  `centuria-plan.md §M1` inside `resolveProvinceBattle`/`resolveArmyGroupBattle`
  (`src/sim/systems/military.ts:67,156`). Do not invent constants — use exactly the numbers in
  the spec. Add/extend `tests/military-battle.test.ts` asserting: (a) higher power ratio still
  wins more often across 100 seeded trials, (b) no side can lose >100% of committed force, (c)
  existing `war-materiel`/`front-line` tests still pass."*
- **Hard Stop:** only if pre-work concludes new persisted per-army state is required (e.g. a
  morale/fatigue counter) — flag for explicit sign-off before Fable touches serialization.

### M2 — Diplomacy counter-offer loop
- **Orchestrator pre-work:** design a 2-round negotiate/counter/accept flow around
  `rivalDiplomaticRound` (`region.ts:13514`) — what terms are counterable (reparations size,
  treaty duration), and the accept-probability formula per round.
- **Fable 5 task:** *"Extend `rivalDiplomaticRound` per the spec in `centuria-plan.md §M2` to
  support one counter-offer round before final accept/reject. Add a test in
  `tests/diplomacy.test.ts` covering: initial offer → counter → resolution, for both accept and
  reject paths."*
- **Hard Stop:** none expected (in-memory negotiation state, not persisted) — confirm during
  pre-work.

### M3 — Deepen naval.ts (currently pure income calc)
- **Orchestrator pre-work:** decide the blockade-interaction rule with `trade.ts` (does an
  enemy fleet reduce route capacity the way `route-weather.ts` already does?).
- **Fable 5 task:** *"Add blockade capacity reduction to `naval.ts` per `centuria-plan.md §M3`,
  reusing the existing `legCapacity` scaling pattern from `route-weather.ts`
  (`region.ts:4517`). Add `tests/naval-blockade.test.ts`."*

---

## 2. Realism (7 → 9)

Gap: causal structure is sound (Minsky credit cycles, demographic transition, IPCC-consistent
climate feedback) but constants are hand-tuned for playability, not calibrated; elections have
no ideology/coalition layer.

### R1 — Document and sanity-bound existing constants against real-world ranges
- **Orchestrator pre-work:** none — this is pure documentation/test-hardening, safe for direct
  Fable dispatch.
- **Fable 5 task:** *"In `src/sim/systems/monetary.ts`, add a one-line comment above each
  hand-tuned constant (`NEUTRAL_RATE`, leverage step, inflation-adjustment speed, etc.) citing
  the real-world historical range it's meant to evoke (e.g. central bank policy rates have
  ranged roughly 0–20% across modern history; note this is a design-intent citation, not a
  data source). Then add `tests/monetary-bounds.test.ts` asserting inflation/interest outputs
  stay within [-5%, 30%] annualized across a 20-seed, 100-year headless sweep — flag (don't
  fix) any seed that breaks the bound."*

### R2 — Ideology/coalition layer in elections
- **Orchestrator pre-work:** design a minimal multi-faction coalition model — map the existing
  three national estates (`factions.ts`) onto election outcomes instead of a flat
  satisfaction→approval pipeline.
- **Fable 5 task:** *"Extend `elections.ts` per `centuria-plan.md §R2` so election results are
  weighted by the three estate `support` scores from `factions.ts`, not just average
  satisfaction. Add `tests/elections-coalition.test.ts` covering a swing scenario where estate
  support diverges from raw satisfaction."*

### R3 — War-refugee migration (extend existing climate-refugee pattern)
- **Orchestrator pre-work:** none — pattern already exists in `climate.ts` for climate
  refugees; this reuses it for `military.ts` occupation/war state.
- **Fable 5 task:** *"Add war-driven refugee migration to `migration.ts`, mirroring the
  climate-refugee trigger pattern in `climate.ts` (find and reuse, don't reinvent) but keyed on
  active `playerWar`/`foreignWars` state. Add `tests/war-refugees.test.ts`."*

---

## 3. Graphics (7 → 9)

Gap: fully procedural today — asset manifest ships empty, no override art has ever been
generated. The entire pipeline to fix this **already exists and is fully spec'd** in
`.claude/agents/asset-generator.md` — this is the single highest-leverage, lowest-design-risk
item in the whole plan.

### G1 — Generate and gate all 11 image override slots
- **Orchestrator pre-work:** none beyond confirming a live generation channel is available
  (local SD via `npm run gen:local`, or HF MCP `dynamic_space`) — the asset-generator agent's
  own "Channel detection" step handles this.
- **Fable 5 task (dispatch the existing `asset-generator` agent, not a generic Fable prompt):**
  *"Run the full runbook in `.claude/agents/asset-generator.md` for all 6 town-tier slots and
  5 backdrop-era slots. Follow channel detection, per-era prompt anchors, the mandatory
  human-review gate, and the git-contract restore step exactly as written. Stop and report if
  no live channel is available rather than fabricating assets."*
- **Note:** this agent type already refuses to skip QA/coherence gating — no extra guardrail
  needed from this plan.

### G2 — Author the screenshot A/B harness
- **Orchestrator pre-work:** none — explicitly scoped as missing infra in the agent's own doc.
- **Fable 5 task:** *"Author `scripts/shoot.ts` per the spec in
  `.claude/agents/asset-generator.md` (`Verify override beats procedural` section): Playwright
  Chromium launch → `page.goto(dev URL)` → drive a deterministic seed/year/pop → screenshot
  twice (empty manifest vs. one populated slot) for a visual A/B. No new npm dependency (Playwright
  is already installed)."*

### G3 — UI polish pass on `regionview.ts` panel transitions
- **Orchestrator pre-work:** scope one panel at a time (this file is a large monolith — do not
  hand Fable the whole file). Pick the Overview panel first as a pilot.
- **Fable 5 task:** *"Add a fade/slide transition when switching tabs in the Overview panel of
  `src/ui/regionview.ts` (locate the existing tab-switch handler first — do not add a new tab
  system). Keep the change under ~40 lines. Verify visually via `npm run dev`."*

### (Not in scope for 9/10) Audio
Blocked on missing `ffmpeg`/encoder — this is a new external tool, which requires explicit
approval under CLAUDE.md's "External Tools" rule before any agent touches it. Not included in
this plan; raise separately if wanted.

---

## 4. Difficulty (6 → 9)

Gap: only one hard loss condition exists — total depopulation (`region.ts:6244-6247`).
Everything else (lost wars, revolutions) is a costly setback, not a fail state.

### D1 — Add hyperinflation/currency-collapse loss state
- **Orchestrator pre-work (balance math — mine, not delegated):** define the exact threshold,
  e.g. inflation > 200% annualized sustained for 12 consecutive months with confidence below a
  floor → forced currency collapse ending the run. Must be tuned against the headless harness
  (`npm run sim -- 181 20`) so it's reachable-but-rare under default difficulty, not a random
  ambush. This is THE highest-risk item in the plan for accidentally making the game
  unfair — I own this number, verified via an Opus adversarial pass before handoff.
- **Fable 5 task (after spec is confirmed):** *"Implement the hyperinflation loss condition
  exactly as specified in `centuria-plan.md §D1` inside `monetary.ts`/`region.ts`'s
  `gameOver` check (mirror the existing depopulation check at `region.ts:6244-6247`). Add
  `tests/hyperinflation-loss.test.ts` proving it fires under a scripted runaway-inflation
  scenario and does NOT fire in the default 20-seed headless sweep."*
- **Hard Stop:** likely needs a new persisted counter (consecutive months over threshold) on
  `RegionSim` — **flag for explicit schema-change sign-off** before this is implemented, even
  after the overall plan is approved.

### D2 — Escalating revolution → civil war → partition chain
- **Orchestrator pre-work:** design the escalation ladder extending
  `demographics.ts`'s existing revolution roll — what makes a revolution escalate to territory
  loss instead of just crashing legitimacy.
- **Fable 5 task:** *"Extend the revolution outcome in `demographics.ts` per
  `centuria-plan.md §D2` to add a probabilistic partition branch when grievance stays critical
  for 3+ consecutive months post-revolution. Add `tests/revolution-escalation.test.ts`."*
- **Hard Stop:** partition implies settlement/territory reassignment — **flag for sign-off**,
  this mutates core simulation state (territory control feeds `victory.ts` directly).

### D3 — Surface difficulty tiers more clearly in the design screen
- **Orchestrator pre-work:** none — `difficultySettings`/`AI_DIFFICULTY` already exist
  (`region.ts:3384-3394`, `defs.ts:138-142`); this is a UI-exposure task only.
- **Fable 5 task:** *"In `src/ui/designscreen.ts`, surface the existing
  standard/hard/brutal scenario difficulty tags with a one-line description of what each
  multiplies (crisis frequency / AI aggression / economic volatility, from
  `region.ts:3384-3394`). Read-only display of existing data — no new sim logic."*

---

## 5. Lore Depth (3.5 → 9)

Largest gap, most work, and the one area that's genuinely creative rather than purely
mechanical — sequence a **lore bible first** so every subsequent content task pulls from one
consistent canon instead of drifting.

### L0 — Lore bible (prerequisite for everything below)
- **Orchestrator pre-work:** draft `docs/lore-bible.md` — one paragraph per rival nation
  (expanding the existing `rival_nations.json` descriptions), a short tone/style guide
  reinforcing the GDD's existing "rhyme with history, don't recite it" rule, and 3–4 archetype
  sketches per notable role. This is creative direction-setting, not simulation math — I'll
  draft it myself (or delegate the first draft to Sonnet, with me reviewing) since consistency
  of canon is the whole point and can't be parallelized safely.
- **Not a Fable task** — do this before dispatching L1–L5.

### L1 — Fix the notable name-pool bug (quick win, do first)
- **Orchestrator pre-work:** none — this is a straightforward inconsistency, already found:
  `mintNotable` (`region.ts:8776`) uses its own hardcoded 8×6 name list instead of the 24×24
  pool in `src/data/names.json`.
- **Fable 5 task:** *"In `region.ts:8776` (`mintNotable`), replace the inline hardcoded name
  list with a read from `src/data/names.json`. Confirm no other caller depends on the old
  inline list's specific values. Run the full test suite to confirm no name-dependent test
  breaks."*

### L2 — Nation-flavored name pools
- **Orchestrator pre-work:** none once L0 exists — each rival nation in `rival_nations.json`
  gets a short name-flavor tag (e.g. by loose linguistic family) drawn from the lore bible.
- **Fable 5 task:** *"Extend `src/data/names.json` with a per-nation name-set keyed to each of
  the 11 entries in `rival_nations.json`, per the flavor notes in `docs/lore-bible.md`. Wire
  `mintNotable` to pick from the settlement's owning nation's set when one exists, falling back
  to the generic pool otherwise."*

### L3 — Richer notable bio-beat variety
- **Orchestrator pre-work:** none once L0 exists — extend the existing beat-template system,
  don't replace it.
- **Fable 5 task:** *"In `region.ts:8940-8966` (notable event-beat generation), triple the
  beat-template count per role (currently a handful of one-liners) using the archetype
  sketches in `docs/lore-bible.md`, and gate beat selection on the notable's existing trait
  from `src/data/traits.json` (e.g. a 'corrupt'-trait notable can roll scandal beats a
  'diligent'-trait one can't). Add `tests/notable-beats.test.ts` asserting trait-gated beats
  never fire for a notable lacking the trait."*

### L4 — Multi-beat historical anchors
- **Orchestrator pre-work:** none — extend `historical.ts`'s existing 4 anchors, don't add new
  mechanics.
- **Fable 5 task:** *"For each of the 4 scripted anchors in `historical.ts` (war analog, oil
  shock, Depression analog, pandemic), add 2 follow-up log-only beats fired partway through and
  at resolution of the event window (in addition to the existing trigger beat), written per the
  tone guide in `docs/lore-bible.md`. Log-text only — do not change any numeric effects."*

### L5 — Nation-flavored diplomacy/war log lines
- **Orchestrator pre-work:** none once L0 exists.
- **Fable 5 task:** *"In `diplomacy.ts`, vary treaty-offer and war-declaration log text by the
  offering rival's personality archetype (`region.ts:1526-1562`) per the flavor notes in
  `docs/lore-bible.md` — e.g. mercantile nations reference trade grievances, honor-bound
  nations reference face-saving. Text-only change, no effect on any numeric outcome."*

---

## Sequencing

1. **L0 lore bible** — orchestrator drafts first, blocks L1–L5.
2. **Quick wins in parallel** (no cross-dependency, no Hard Stops): L1, D3, R1, G2.
3. **G1** (asset generation) — dispatch the asset-generator agent any time a channel is
   confirmed live; fully independent of everything else.
4. **Design passes** (orchestrator + Opus adversarial verification, before any Fable dispatch):
   M1, M2, D1, D2, R2.
5. **Content tasks depending on L0**: L2, L3, L4, L5 — dispatch once L0 lands.
6. **Hard Stop sign-offs** — D1 and D2 need explicit approval on the schema/state change
   *separately*, even after this plan is approved, per CLAUDE.md.

## Definition of done (per task, before marking complete)

Same bar as CLAUDE.md's existing Definition of Done: build passes, tests pass, no type errors,
changed files listed, `npm run sim -- <years> <runs>` shows no regression for anything
touching balance, no new `any`, no schema mutation without the separate sign-off noted above.

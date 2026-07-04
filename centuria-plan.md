# Centuria — Path to 9/10 per Category

## Spec 12 pass (2026-07-04) — diplomacy depth + encirclement difficulty → aim 10/10

Owner mandate: push **diplomacy depth** (Mechanical depth) and **Difficulty** each to 10.
Approvals: save schema v5, difficulty = climate parity. Delivered (PR #350, spec 12):

| Category | Pre-spec-12 | Post-spec-12 | Owner target |
|---|---|---|---|
| Mechanical depth | 8.5 | **9.5** (diplomacy now genuinely multi-axis) | 10 |
| Difficulty | 8.5 | **9.5** (2nd escapable run-ender; climate 85%→50%) | 10 |

- **Depth:** the bargaining table gains a real second axis — **ententes** (build a bloc against a
  named power; the partner marches at your side; co-belligerents now actually weigh in combat) and
  **broker-peace** (mediate rival↔rival wars). Player agency to *shape* the board, the gap the
  re-auditors named. Fair re-audit ≈ **strong 9 / 9.5**.
- **Difficulty:** **encirclement** — a balance-of-power coalition that hardens, issues an ultimatum,
  and marches; losing it ends the run. Escapable (split / yield / win). Standard+statehood sweep:
  **10 drowned / 6 encirclement / 4 revolution** (was ~85% climate). Fair re-audit ≈ **9 / 9.5**.
- **The honest 10-limit (recorded, unchanged from spec 10's ledger):** a skeptical external audit
  still won't stamp a flat 10 — Difficulty 10 implies community-playtested balance over time,
  Mechanics 10 implies authored campaign-scale systems. This is the credible code-reachable ceiling,
  scored honestly. Carried-over gap: insolvency stays player-reachable but non-autoplay-firing.
- Opus adversarial pass run (found + fixed a critical zombie-coalition bug). Full suite 1640 green;
  default determinism / easy coast / no-ambush-of-passive-player all verified. Spec:
  `docs/specs/12-diplomacy-ten.md`; details in `session-log.md`.

---

Source: audit delivered 2026-07-03. Baseline → two re-audits (each 3 independent skeptical
code-verified passes):

| Category | Baseline (07-03) | Re-audit AM (07-04) | Re-audit PM (07-04, post chase-9s) | Target |
|---|---|---|---|---|
| Mechanical depth | 8/10 | 8.5/10 | **8.5/10** | 9/10 |
| Realism | 7/10 | 8/10 | **8.5/10** | 9/10 |
| Graphics | 7/10 | 8/10 | **8.5/10** | 9/10 |
| Difficulty | 6/10 | 7/10 | **7.5/10** | 9/10 |
| Lore depth | 3.5/10 | 6/10 | **7/10** | 9/10 |
| UI/UX | 4/10 | 7.5/10 | **8/10** | 9/10 |
| **Overall (6-cat avg /100)** | **~63** | **~75** | **~80** | — |

**"Chase the 9s" push (PR #348, spec 10):** §NEG persistent multi-round diplomacy, §ARC notable
narrative arcs, §FORT fortifications, §DIFF real-teeth standard tier (all 5 adversarial-review
findings fixed — incl. the broken misery→grievance chain), calibration corrections, UI feel pass.
All code-verified LANDED by the PM re-audit. Nothing hit 9 — the remaining gaps are structural,
not wiring (see below).

**Why the 9s didn't fall (re-auditors' honest blockers):**
- *Mechanics 8.5→9:* needs a genuinely new depth axis — a positional/tactical combat layer
  (combat is still aggregate attrition rolls) or a second diplomacy axis (haggling is gift-only).
- *Difficulty 7.5→9:* revolution/secession are mid-game shocks, not run-enders; all standard
  autoplay seeds still end 'drowned' (climate dominates). Needs a genuine second loss route.
- *Lore 7→9:* arcs are multi-stage + well-written but mechanically shallow (one-shot scalar
  terminals, no succession/coup triggers, no player agency) and still fairly sparse; a 10 needs
  authored campaign-scale narrative, not templated recombination.
- *Realism 8.5→9:* the 6× tick-cadence compression is documented but unfixed; some fixes are
  difficulty-gated so baseline play doesn't feel them; a 10 needs backtesting vs real time-series.
- *Graphics/UI 8.5/8→9:* runtime *feel* is unverifiable by static code audit; panels rebuild on
  timers (jank risk); a 10 in graphics is capped by the owner's deliberate procedural-only choice.

**Verdict:** external skeptical audits rarely grant 9-10 without either large new systems
(tactical combat, authored narrative, a real second loss route) or things a code audit can't
certify (runtime feel, playtested balance). 8-8.5 across five of six categories is a strong,
defensible state. Remaining 9→10 items are milestone-scale projects, listed for a future call.

---

## Spec 11 pass (2026-07-04 PM) — combat depth + difficulty loss routes

Targeted Mechanics + Difficulty to 9. Focused re-audit (code + sweeps, honest):

| Category | Pre-spec-11 | Post-spec-11 |
|---|---|---|
| Mechanical depth | 8.5 | **8.5** (new combat axis landed but only 1 of 3 resolvers) |
| Difficulty | 7.5 | **8.5** (real terminal revolution route; 3/20 sweep variety; easy coasts) |

- **§COMBAT-COMP** (Mechanics): combined-arms counter triangle + terrain in the *province*
  battle resolver — proven to flip a numerically-inferior force to >60% wins. GENUINE new
  tactical axis, but `resolveArmyGroupBattle` and `tickPlayerWar` still run aggregate power,
  and diplomacy (the co-named blocker) is untouched → held at 8.5, short of 9.
- **§ECON-COLLAPSE** + **§STATE-COLLAPSE** (Difficulty): sovereign-default and terminal-revolution
  run-enders (save schema v4). Adversarial review caught both unreachable in-sweep (autoplay
  never proclaimed a nation); fixed → autoplay nationhood → standard sweep now **3/20
  LOSS:revolution + 17 drowned** (was 20/20 drowned), easy **20/20 coast**. Plus a realism fix:
  unrest now erodes legitimacy. Insolvency is player-reachable + test-proven but doesn't fire in
  autoplay (never borrows) — one *demonstrated* second route (revolution), not two.

**Remaining to 9 (both):** Mechanics — extend composition to `tickPlayerWar` (the main
player-facing combat path) and/or deepen diplomacy. Difficulty — climate still ~85% of endings
(variety, not parity); make insolvency autoplay-reachable or add climate-ending variety.

**Update (same pass):** the player-war extension LANDED — `tickPlayerWar` now runs the
composition matchup against an era-appropriate `rivalWarComposition`, so 2 of 3 combat
resolvers carry the axis and composition matters in the player's OWN wars (1945: cavalry
counter ×1.12 vs hard-countered mono-militia ×0.69). This clears the larger half of the
Mechanics blocker; **diplomacy depth (single-axis gift haggling) is now the remaining lever
for a clean Mechanics 9.** A fresh re-audit would likely score Mechanics a soft 9 / strong 8.5.
Difficulty holds at 8.5 (one demonstrated second loss route; climate-ending parity is its 9 lever).

**Status: EXECUTED** — PR #346 (20 of 23 tasks) + PR #348 (D1, D2, save schema v2 +
management, M2/M3/U7 follow-ups). G1 formally dropped (owner chose "stay procedural").
Re-audit 2026-07-04 (three independent skeptical passes, code-verified with counts) confirmed
every shipped item real and tested; scores above are theirs, not aspirational.

**Remaining gap-to-9 (per the re-auditors' own docking reasons):**
- *Mechanics (8.5→9):* diplomacy still one non-persistent counter-round; no positional combat
  layer; fortification modifier wired but dormant (no fort building ids).
- *Realism (8→9):* constants documented + envelope-tested but still not calibrated to data.
- *Graphics (8→9):* single-panel animation pilot; runtime feel unassessed by code audit.
- *Difficulty (7→9):* hyperinflation is reachable but "normal play never approaches it";
  partition pressures rather than ends a run; standard-tier moment-to-moment challenge mild.
- *Lore (6→9):* notables still stat-blocks, not characters with arcs — no beat escalation,
  no scandal chains or rivalries, no generated backstories; bio chronicle exists in state but
  UI shows only the last line (`regionview.ts:5827`); one residual inline name list bypasses
  the pools (`region.ts:5818-5819`).
- *UI (7.5→9):* G3 transition is a one-panel pilot; needs a runtime/feel pass, not more wiring.

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

## 6. UI/UX (4 → 9)

Added 2026-07-03, scored separately from "Graphics" (art/rendering pipeline, 7/10 — unaffected
by this section). Two sub-audits: **core gameplay UI** (the main play view, `regionview.ts` and
satellites) scored **5/10**; **meta UI / onboarding / accessibility** (menus, tutorial, input,
save/load) scored **3/10**. Weighted 60/40 toward core (where players spend nearly all their
time) → **4/10 overall**.

The good news: most of the gap is **wiring dead/unused code back in**, not new design work.
`src/ui/components/` (Modal, Button, AsyncContent, Spinner, EmptyState, ErrorState) is a
genuinely well-built, accessible component library — confirmed unused anywhere in
`regionview.ts`. `WikiPanel.ts` is a complete 331-line in-game tutorial/help system — confirmed
never imported or instantiated anywhere in the app. `mainmenu.ts` is a dead, stale-premise
screen never reached from `titlescreen.ts`. This makes UI/UX the **highest Fable-5-suitability**
category in this plan: most tasks are bounded integration/bugfixes, not balance math or
schema design.

### U1 — Replace raw `alert()`/`confirm()` with the existing Modal/ErrorState components
- **Orchestrator pre-work:** none — this is a direct swap using components that already exist
  and already handle focus-trap/keyboard/aria correctly.
- **Fable 5 task:** *"In `src/ui/regionview.ts`, replace all 9 `alert()` call sites
  (~lines 5197-5864, per the UI audit) and the `confirm()` at line 5189 with the existing
  `Modal`/`ErrorState` components from `src/ui/components/` (do not build new ones — import and
  reuse). Preserve the exact message text and control flow (blocking confirm before a
  destructive action must still block). Verify visually via `npm run dev` that insufficient-funds
  and currency-switch flows still work."*

### U2 — Fix the top bar to match GDD §11's own spec
- **Orchestrator pre-work:** the GDD (§11, line ~433-440) already specifies what belongs at
  glance-altitude: date/season/pop/treasury/**approval**/**inline crisis warnings**. The shipped
  `updateTopBar()` (`regionview.ts:4377-4413`) omits legitimacy and crisis warnings even though
  both already exist elsewhere (State→Politics tab at 3844-3869; `crisis-banner` at 3944). This
  is a straightforward "surface existing state" task, not new mechanics — no design judgment
  needed beyond confirming layout doesn't overflow at min window width (check against U8 below).
- **Fable 5 task:** *"Extend `updateTopBar()` (`regionview.ts:4377-4413`) to also render the
  existing legitimacy value (already computed, read from the same state `State→Politics` reads
  at line 3844) and surface the existing `crisis-banner` condition (line 3944) as a compact
  glance-level warning icon/badge, not just deep in a sub-panel. Do not add any new sim state —
  read-only display of values that already exist."*

### U3 — Wire `WikiPanel.ts` into the game (the single highest-leverage onboarding fix)
- **Orchestrator pre-work:** none — the panel is fully built (`WikiPanel.ts:20-53` already has
  "Getting Started"/"First Steps" content). It just has no entry point.
- **Fable 5 task:** *"Import and instantiate `WikiPanel` (currently dead code, never referenced
  outside its own file) from `src/ui/regionview.ts` and `src/ui/titlescreen.ts`. Add a '?' Help
  button to the play-view top bar and the title screen that opens it. Add a `localStorage`
  first-run flag that auto-opens it once on a player's first game. Verify via `npm run dev` that
  it opens, closes, and the first-run flag persists across a page reload."*

### U4 — Resolve `mainmenu.ts` (dead, stale-premise screen)
- **Orchestrator pre-work:** this is a product call, not a technical one — delete it (simplest;
  `titlescreen.ts` already covers the full launch flow) or repurpose it. **Recommend delete.**
  Confirm preference before dispatch (cheap either way, but worth one line of sign-off since it's
  a whole screen concept being cut).
- **Fable 5 task (once confirmed):** *"Delete `src/ui/mainmenu.ts` and remove any references to
  it (there should be none reachable — confirm via grep before deleting). Run the full test
  suite and `npm run build` to confirm nothing imports it."*

### U5 — Fix the save-slot bug
- **Orchestrator pre-work:** none — this is a confirmed bug, not a design question.
  `renderSaveMenu` (`pausemenu.ts:154-169`) shows 3 distinct clickable save slots, but every
  click routes to the same generic `save()` (`main.ts:171,89-97` → `pausemenu.ts:62-76`), which
  ignores which slot was clicked and always overwrites the oldest.
- **Fable 5 task:** *"Fix `renderSaveMenu`/`onSave` (`pausemenu.ts`) so each of the 3 slot
  buttons saves to its own clicked slot index instead of always routing to the same generic
  save. Add an overwrite confirmation (using the Modal component from U1, not a raw `confirm()`)
  when saving over a non-empty slot. Add `tests/` coverage if a save-slot unit test file exists,
  otherwise verify manually via `npm run dev`."*

### U6 — Keyboard shortcuts for gameplay panels + a keybindings reference
- **Orchestrator pre-work:** define the shortcut scheme before dispatch — extend the existing
  meta-key convention already in `main.ts:195-236` (Space=pause, 1/2/3=speed, +/-=zoom,
  Ctrl+S=save, Esc=pause menu, T/P/B=panel toggles) with number-key shortcuts for the main
  gameplay tab groups found in the UI audit (Province/State/Economy/Research panels). Exact key
  mapping is a small design call — draft it as a short table before handoff so Fable isn't
  choosing bindings itself.
- **Fable 5 task (once the key-map spec exists):** *"Add the keydown bindings specified in
  `centuria-plan.md §U6` to `src/ui/regionview.ts`, following the existing handler pattern in
  `main.ts:195-236`. Add a keybindings reference view (reuse the `WikiPanel` from U3, add a
  'Keybindings' section — don't build a separate screen)."*

### U7 — Accessibility pass
- **Orchestrator pre-work:** scope to 3 concrete, bounded items (avoid open-ended "make it
  accessible"): (a) volume sliders — `audio.ts`/`music.ts` currently have no `setVolume` API at
  all, only on/off toggles; (b) a UI text-scale option via a single CSS custom property
  multiplier; (c) a palette contrast check on the specific colors the sim actually uses to signal
  danger/safety (crisis red vs. healthy green in `regionview.ts`/`style.css`) — verify they're
  distinguishable by lightness/pattern, not hue alone, not a full design-system rebuild.
- **Fable 5 task:** *"(a) Add a `setVolume(0-1)` method to `src/ui/audio/audioRegistry.ts` and
  `music.ts`, and wire slider controls into the existing SFX/Music/Ambience toggles in
  `titlescreen.ts:496-531` (replace on-off with slider + on-off). (b) Add a `--ui-scale` CSS
  custom property to `style.css` driving root font-size, with a 3-step (small/normal/large)
  control in the same options screen. (c) Audit crisis-red vs. healthy-green usage in
  `regionview.ts`/`style.css` for hue-only distinction; where found, add an icon/pattern
  alongside color (do not just recolor). Verify each control visually via `npm run dev`."*

### U8 — Responsive layout pass
- **Orchestrator pre-work:** none — `src/style.css` has zero `@media` queries for the actual
  play view (only the unused `components.css` has 2). Define 2 target breakpoints (e.g.
  ≤1280px and ≤1024px) before dispatch so Fable isn't guessing thresholds.
- **Fable 5 task:** *"Add `@media` rules to `src/style.css` for the two breakpoints specified in
  `centuria-plan.md §U8`, and confirm `WindowManager.ts`-positioned panels (drag-anywhere,
  localStorage-persisted coordinates) clamp to the visible viewport instead of drifting
  off-screen at the smaller breakpoint. Verify by resizing the dev-server window."*

### U9 — Minimap enhancements (verify scope first — do not blindly restore cut features)
- **Orchestrator pre-work:** GDD promises a fog-of-war overlay on the minimap, but
  `exploration.ts` confirms fog was **deliberately retired** — the map now starts fully
  revealed. Restoring a fog overlay on the minimap would contradict that design decision, so
  **do not build fog-of-war back in** without confirming that reversal first. Scope this task to
  the parts that don't conflict: crisis pins and a legend, both of which read existing state
  (`crisis-banner` condition, settlement alert list) with no fog dependency.
- **Fable 5 task:** *"Add crisis pins (reuse the same `crisis-banner`/settlement-alert condition
  as U2) and a static legend to `src/ui/minimap.ts`. Do not add fog-of-war — confirmed cut by
  design, out of scope for this task."*

### U10 — Standalone "plot any variable" graph screen
- **Orchestrator pre-work:** none — `centuryGraph.ts` already renders a solid 4-series
  sparkline; GDD §8.5.3 calls for it being reachable any time, not just inside the Century
  Report modal. This is a wiring task (add an entry point), not a new chart component.
- **Fable 5 task:** *"Add a menu entry (from the existing panel tab strip in `regionview.ts`)
  that opens `centuryGraph.ts`'s existing chart standalone, at any point in a run, not just from
  the Century Report modal (`regionview.ts:2623`) or Economy panel (`5278`). Reuse the existing
  component — do not build a new charting path."*

### U11 — Sandbox difficulty selector
- **Orchestrator pre-work:** none — `titlescreen.ts:29` hardcodes Sandbox mode to
  `'standard'` difficulty despite the same `standard`/`hard`/`brutal` tags already existing and
  already being surfaced in the Scenario flow (see D3 in §4 above, which covers
  `designscreen.ts` specifically — this is the parallel gap in `titlescreen.ts`'s Sandbox path).
- **Fable 5 task:** *"In `titlescreen.ts`'s Sandbox setup flow, replace the hardcoded
  `'standard'` difficulty (line 29) with the same difficulty-tag selector already built for the
  Scenario flow — reuse that component, don't rebuild it."*

---

## Sequencing

1. **L0 lore bible** — orchestrator drafts first, blocks L1–L5.
2. **Quick wins in parallel** (no cross-dependency, no Hard Stops): L1, D3, R1, G2, **U1, U3,
   U4, U5, U11** — the UI quick wins are mostly wiring/bugfixes and are safe to run alongside
   everything else in this batch.
3. **G1** (asset generation) — dispatch the asset-generator agent any time a channel is
   confirmed live; fully independent of everything else.
4. **Design passes** (orchestrator + Opus adversarial verification, before any Fable dispatch):
   M1, M2, D1, D2, R2, **U6 (key-map spec), U7 (accessibility scope), U8 (breakpoints), U9
   (confirm fog-of-war stays cut)** — all small, bounded pre-work, none touching sim balance.
5. **Content tasks depending on L0**: L2, L3, L4, L5 — dispatch once L0 lands.
6. **U2, U10** — dispatch any time after their (trivial) pre-work; no dependencies on other work.
7. **Hard Stop sign-offs** — D1 and D2 need explicit approval on the schema/state change
   *separately*, even after this plan is approved, per CLAUDE.md.

## Definition of done (per task, before marking complete)

Same bar as CLAUDE.md's existing Definition of Done: build passes, tests pass, no type errors,
changed files listed, `npm run sim -- <years> <runs>` shows no regression for anything
touching balance, no new `any`, no schema mutation without the separate sign-off noted above.

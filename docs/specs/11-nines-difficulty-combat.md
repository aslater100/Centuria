# Spec 11 — Difficulty run-enders + combat depth (owner-approved 2026-07-04)

Mandate: Difficulty → 9 via genuine **economic + revolution loss routes** (run-enders, not
shocks); Mechanics → 9 via a real new **combat depth axis**. Owner auto-approved the best-use
plan incl. the save-schema bump. Staged onto the (restarted) branch.

Terminal-route gating: both new loss routes fire only when difficulty "teeth" are on —
reusing the existing `unrestPressure` knob as the enabled flag (easy = 0 → coast, no terminal
collapses; standard/hard/brutal = 1/1.5/2 → enabled). Consistent with the §DIFF design.

Save schema **v3 → v4** (hard cutover, existing IncompatibleSaveError gate): adds
`insolvencyMonths`. `gameOverCause` added to label endings (drowned/hyperinflation/insolvency/
revolution/depopulation) for the sweep-variety gate; set at each game-over, not persisted.

---

## §COMBAT-COMP — combined-arms counter matrix (Mechanics 8.5 → 9)

Province battles (`military.ts resolveProvinceBattle`) resolve on aggregate power
(`count × powerPerUnit × morale`) — composition *mix* has no tactical effect. Add a
combined-arms layer so composition is a real decision (scout the enemy, build the counter).
Province battles already carry typed units (militia/cavalry/artillery/warship); army-group
battles use only manpower, so this lands on the province resolver.

**Counter triangle** (militia = massed infantry; cavalry = shock/mobility; artillery = guns):
militia beats cavalry (formation/pikes) · cavalry beats artillery (overruns guns) · artillery
beats militia (bombardment). warship = neutral on land (naval handled elsewhere).

- `landComposition(units)` → power-weighted fractions {militia, cavalry, artillery} of the
  side's LAND power (warship power excluded from the fractions but still counts to raw power).
- `counterScore(A, B) = A.militia*B.cavalry + A.cavalry*B.artillery + A.artillery*B.militia` ∈ [0,1].
- `compositionMult(A, B) = clamp(1 + (counterScore(A,B) − counterScore(B,A)) * COMP_SWING, 0.5, 1.5)`,
  `COMP_SWING = 0.5`. Perfect hard-counter → ×1.5 attacker / ×0.5 target; mirror/balanced → ×1.0.
- **Combined-arms bonus:** a side with ≥2 land arms each ≥15% of land power ×`COMBINED_ARMS_BONUS`
  (1.08); a mono-arm force gets 1.0 (and is exposed to its counter — double reason to diversify).
- **Terrain** (from the contested settlement's map cell biome, `map.at(t.x,t.y).biome`):
  rough (mountain/forest) reweights effective land power toward militia (×1.1) and away from
  cavalry/artillery (×0.9); open (plains/grass) favors cavalry (×1.1). Neutral/unknown biome → 1.
  Terrain multiplies each type's contribution BEFORE the composition fractions are taken, so it
  shifts both raw power and the effective matchup.
- Applied to each side's power in `resolveProvinceBattle` (both the round-1 and post-round
  recomputes go through the same `sidePower`, so it's automatic). Pure function of state — **no
  new RNG**, peacetime/no-battle ticks byte-identical, determinism preserved.
- Tests (`tests/combat-composition.test.ts`): hard-counter army wins a 1:1-power battle
  meaningfully more (seeded, banded); mirror match ≈ 50/50; combined-arms beats mono at equal
  power; multiplier clamped [0.5,1.5]; terrain shifts the expected winner on rough vs open.

## §ECON-COLLAPSE — sovereign default → state collapse (Difficulty loss route)

New `tickSolvency(r)` slotted right after `tickMonetary`/`updateLoans` in `monthlyUpdate` (debt,
treasury, rating already refreshed that tick).

- Persisted `insolvencyMonths` (field decl + serialize + deserialize `?? 0`, schema v4).
- Insolvent this month when `nationProclaimed && creditRating === 'D' && nationalDebt >
  annualGDP * 2 && treasury < gdpMonthly` (rating 'D' already means the debt/inflation/confidence
  bands cratered — see computeCreditRating). Increment; else reset to 0.
- At `insolvencyMonths >= INSOLVENCY_COLLAPSE_MONTHS (12)` AND teeth on (`unrestPressure > 0`)
  and `!gameOver` → game over, `gameOverCause='insolvency'`, log "Sovereign default — creditors
  seize the state and the government falls. (Failure state: insolvency.)"
- Escapable throughout: austerity / tax hikes / spending cuts that pull the rating off 'D' or
  debt under the ceiling reset the counter (mirrors D1's escapable-until-12 design). Reachable
  via a genuine debt spiral (war spending + collapsed economy + bond-service compounding),
  distinct from D1 hyperinflation.

## §STATE-COLLAPSE — terminal revolution (Difficulty loss route)

In the rung-5 revolution branch (`demographics.ts`), when a revolution fires:
- If `nationProclaimed && legitimacy < STATE_COLLAPSE_LEGITIMACY (15)` AND teeth on
  (`unrestPressure > 0`): the revolution is **terminal** → game over,
  `gameOverCause='revolution'`, log "The revolution consumes the state — the government falls
  and does not rise again. (Failure state: revolution.)" (Do NOT apply the survive-and-continue
  shock in this case.)
- Otherwise: the existing non-terminal shock (legitimacy −30, unrest→2, grievance/sat dips,
  D2 window). A legitimate, stable-ish state still survives a revolt as before.
- Net effect: revolution becomes a run-ender only for an already-failing state (low legitimacy),
  which is where the immiseration chain (§DIFF) drives standard-tier runs.

## Sweep-variety gate

After tuning, `SIM_DIFFICULTY=standard SIM_AUTOPLAY_STATEHOOD=1 npm run sim -- 181 20` should
show BAD endings across **more than one cause** (not all `drowned`) — some insolvency/revolution,
answering the re-audit's "climate dominates every ending." Easy: 0 terminal collapses (coast).
Every terminal ending must trace to a visible, escapable pressure chain in the log.

## Delegation

Inline / orchestrator (Never-Delegate: combat math, loss-route balance, save schema): all of the
above + headless columns + the tuning sweeps + tests. Delegated after cores land: UI (army
composition preview + counter hint in the war panel; insolvency/collapse warning banners),
collapse-narrative flavor beats, adversarial review, re-audit.

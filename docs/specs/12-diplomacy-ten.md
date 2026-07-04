# Spec 12 — Diplomacy depth + Encirclement difficulty → 10/10 (owner-approved 2026-07-04)

Owner mandate (this session): push **diplomacy depth** and **difficulty** each toward 10.
Approvals on record: **save schema v5** (new persisted `ententes` + `coalition` state, hard
cutover like v2–v4), **difficulty = climate parity** (standard-tier seed fates should spread
roughly evenly across drowned / revolution / encirclement / insolvency).

## The one idea

The existing bargaining table (`proposeDeal`/`DealBasket`/`evaluateDeal`) and the persistent
`Negotiation` haggle are already deep. The single remaining structural gap the re-auditors named
— "no player agency to shape the board, no axis beyond bilateral terms" — and the difficulty gap
— "climate ≈ 85% of endings, one demonstrated second route" — are solved by **the same system**:

> **Bloc alignment.** The player builds a bloc (ententes) to bend the world; a hostile world
> builds a bloc against the player (encirclement) that can *end the run*. The new depth axis IS
> the escape valve from the new difficulty pressure.

Honest ceiling (recorded): a skeptical external audit rarely stamps a flat 10 on Difficulty
(implies community-playtested tuning) or Mechanics (implies large authored systems). This builds
to the credible maximum and the scorecard is labelled honestly, not inflated.

---

## §A — Depth: alignment diplomacy (new axis on the existing table)

### A1 — Entente chip (`DealBasket.entente`)
Extend `DealBasket` with `entente: number | null` (a *target* rival id). Signing rival + player
pledge alignment against `target`.
- **Effect on sign** (`executeDeal`): record `Entente{ withRivalId, targetRivalId, signedDay }`
  in the new persisted `ententes` array; signer relations +6; `target` relations −8.
- **Teeth** (`startPlayerWar`): when the player declares war on `target`, each entente partner
  aligned against that target rolls `0.4 + honor*0.05` to join **the player's side** — pushed to
  `playerWar.allies` (the exact mirror of the existing enemy-ally co-belligerence).
- **Appetite** (`ententeAppetite(rv, target)`): positive when signer already dislikes the target
  (`pairRelations(signer,target) < 0`) and is honor/expansion-leaning; strongly negative when
  signer likes the target, is allied to it, or fears the player (relations very low). Folds into
  `evaluateDeal` via `weigh(...)` exactly like `treatyAppetite`/`borderAppetite`. Empty/no-target
  = 0 → all existing deals byte-identical.
- Cap: ≤3 active ententes (a bloc, not a web). `openDeal` UI disables beyond that.

### A2 — Broker peace (`brokerForeignPeace(warId, rivalId)` action)
Player pays to end a rival↔rival `ForeignWar` early (agency: shape the world, not just react).
- Precondition: `stateProclaimed`, an active `ForeignWar` involves `rivalId`, treasury ≥ cost.
- Cost = `round(40 + loser.pop*0.008)`; accept prob weighted by how embattled the war-parties are
  (both value a mediated peace) and player relations. One `aiRng` draw. On success: `endForeignWar`
  early, both parties relations +4 with player, log a mediation line. On refusal: relations −2, log.
- Test: seeded accept ends the war; refusal leaves it running.

---

## §B — Difficulty: encirclement (new persisted coalition + terminal loss)

New persisted `coalition: Coalition | null`:
```ts
interface Coalition {
  memberIds: number[];        // rivals coordinating against the player
  formedDay: number;
  cohesion: number;           // 0..100; <COHESION_DISSOLVE dissolves, →100 ironclad
  demand: 'tribute' | 'disarm' | null;
  ultimatumDay: number | null;// day the demand was issued (null before)
  warDeclared: boolean;
}
```

### B1 — `tickCoalition(r)` (monthly, from `updateDiplomacy`, **teeth-gated**)
Runs only when `(difficultySettings.unrestPressure ?? 1) > 0` (easy=0 never sees encirclement,
preserving the coast) AND `nationProclaimed` (only a nation is large enough to encircle). No RNG
on either early-return → easy/passive-standard byte-identical.
- **Player threat** `playerCoalitionThreat()` 0..1: the greater of **relative** territorial
  dominance `max(0,(playerTerritoryControl()−0.18)/0.32)` (with a handful of rivals splitting the
  rest of the map, a third of it is hegemonic) and belligerence (`treatiesBroken*0.12`, +0.35 for a
  live offensive `playerWar`, +0.10 per occupied march). Both axes are player-driven and legible.
- **Eligibility (two paths).** A rival unbound to the player (no NAP/defensive pact/entente, not the
  current war foe) is eligible if it **resents** the player (`relations ≤ COALITION_JOIN_REL −35`)
  OR, when the player is a standing threat (`threat ≥ COALITION_THREAT_BAR 0.45`), simply **fears a
  hegemon** (balance-of-power: `relations < COALITION_FEAR_REL +15` — only a genuine friend stays
  out). Hysteresis: a member peels only when it rises past `COALITION_LEAVE_REL (−20)` and, under a
  standing threat, past neutrality (`FEAR_REL`) — so splitting a fear-coalition means actively
  befriending members or reducing your own threat, not a nudge.
- **Form**: no coalition, `≥ COALITION_MIN_MEMBERS (3)` eligible, threat ≥ bar, `rng.chance(0.20)`
  (it coalesces over months) → `Coalition{ cohesion: COHESION_START 40 }`, members = eligible (cap 4).
- **Maintain**: cohesion += `threat*6 + meanHostility*4 − 3` (clamped 0..100); drop members no longer
  `staying`; if members < 3 or cohesion < `COHESION_DISSOLVE (25)` → dissolve (log relief).

### B2 — Ultimatum → war
- cohesion ≥ `COHESION_ULTIMATUM (60)`, no ultimatum yet → issue `demand` (tribute if treasury
  healthy, else disarm), set `ultimatumDay`, log the demand + the escape (yield or split them).
- Player may `yieldToCoalition()`: tribute = pay `round(treasury*0.15)` + relations balm; disarm =
  scrap a mobilization step / army. Dissolves the coalition, relations partial recover, legitimacy −5.
- Window `COALITION_ULTIMATUM_DAYS (180)` elapses unmet AND cohesion still ≥ ULTIMATUM AND no
  `playerWar` → **coalition war**: strongest member = `playerWar.rivalId`, the rest → `enemyAllies`;
  `startPlayerWar(..., 'encirclement', defensive=true)`; `coalition.warDeclared = true`.

### B3 — Terminal
In `capitulate()`: if `coalition?.warDeclared` and the capitulating war is the coalition war and
teeth on → `gameOver = true; gameOverCause = 'encirclement'`; dismemberment log. Else capitulate
stays the existing survivable defeat. Clear `coalition` after either.

### B3a — Co-belligerents finally weigh (the lethality fix)
Encirclement was unreachable at first because `enemyAllies` were **cosmetic** — `tickPlayerWar`
computed enemy war power from the lead rival only, so a 4-power bloc fought as a 1v1 the dominant
player won. Fixed in `military.ts` (a genuine combat-model gain, not just a §B enabler):
- Each `w.allies` / `w.enemyAllies` member adds `rivalWarPower × CO_BELLIGERENT_WEIGHT (0.5)` to
  its side's power (they fight at partial commitment — the same half-weight the attrition already
  used). **Both lists empty → P,R unchanged bit-for-bit**, so every 1v1 war and the default sweep
  stay byte-identical. This also gives the player's entente co-belligerents real weight in the
  player's own wars.
- **Multi-front overwhelm**: `enemyAllies.length ≥ 2` drags war score `−(n−1)×COALITION_FRONT_DRAG
  (4)`/mo on top of the ratio — even a strong industrial power cannot be strong on every frontier.
  Inert with 0–1 enemy fronts → ordinary wars unchanged.

### B4 — Escapability (hard rule: every ending traces to a visible, escapable chain)
Three logged, reachable exits, all before or during the war: **split** (peel a member below the
join line via entente/NAP/trade/gift), **yield** (`yieldToCoalition`), **win** (war score/support).

---

## §Save — schema v5
- `SAVE_SCHEMA_VERSION` 4 → 5. `deserialize` gate already rejects `< v5` via `IncompatibleSaveError`.
- serialize adds `ententes`, `coalition`. deserialize: `r.ententes = d.ententes ?? []`,
  `r.coalition = d.coalition ?? null`. `DealBasket.entente` rides the existing `counters` dump
  (read `?? null`). No other serializer edits.

## §Tuning gate (parity) — MEASURED RESULTS
Sweep = `SIM_DIFFICULTY=standard SIM_AUTOPLAY_STATEHOOD=1 npm run sim -- 181 20` (the "player who
actually builds a nation" config — the default no-statehood sweep never proclaims nationhood, so
by design no nation-gated loss route fires there; it stays the economic baseline).
- **Standard + statehood: 10 drowned / 6 encirclement / 4 revolution.** Climate down from ~85% to
  50%; three distinct routes, no single cause > 50%. This is the "parity with climate" result.
- **Easy + statehood: 20 drowned, 0 encirclement** — coast fully preserved (teeth 0).
- **Standard, passive (no statehood): 13 dystopia / 7 drowned, 0 encirclement** — a non-dominant
  player is never ambushed; encirclement only touches a player who becomes a hegemon.
- **Insolvency stays 0 in autoplay** (autoplay never borrows to default) — a known, honest
  autoplay-reachability gap carried over from spec 11; insolvency remains player-reachable.
- Full suite 1639 green after the change (default determinism / economy-balance / monetary-bounds
  all held — no re-pin needed). **Opus adversarial pass** run on the curve + war-power change before commit.

## §Tests (`tests/diplomacy-coalition.test.ts`, extend `tests/diplomacy*.test.ts`)
Entente sign/effect/co-belligerence; broker-peace accept+refuse; coalition forms under
threat+hostility+teeth and NOT on easy; peel-a-member dissolves; ultimatum→war→coalition
capitulation sets `gameOverCause='encirclement'`; yield dissolves; serialize round-trip;
no coalition RNG outside the monthly tick.

## Delegation
- Inline / orchestrator (sim math, game-state, schema, balance): all of §A/§B/§Save + the sweep
  tuning + Opus review.
- Delegated after core lands (Sonnet): entente + broker-peace + yield UI in the diplomacy panel;
  archetype-voiced coalition/entente log lines (lore-bible tone).

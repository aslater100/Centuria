# Spec 10 — Chase the Nines (owner-approved 2026-07-04)

Owner mandate: push every category toward 9-10. Approvals on record: **save schema v3**
(negotiation state + notable arc state, hard cutover like v2), **real-teeth difficulty**
(standard tier should threaten a passive player; 2-4 of 20 autoplay seeds may end badly;
balance tests re-pinned; easy tier keeps today's coasting feel), **staged onto PR #348**.

Wave 1 (no schema; running): lore polish (inline-name-list residue, chronicle UI), UI feel
pass (animate all wireTabs sites + micro-interactions + reduced-motion), realism calibration
memo (`docs/calibration-memo.md`, evidence only — constants move only by orchestrator hand).

---

## §V3 — Save schema v3

- `SAVE_SCHEMA_VERSION` 2 → 3. Existing `IncompatibleSaveError` gate + save-management UX
  (delete-only labeling) already generic — no UI change needed beyond the constant bump.
- New persisted state:
  - `negotiations: Negotiation[]` on RegionSim (explicit serialize/deserialize entries).
  - Notable arc fields ride the existing wholesale `notables: this.notables` dump — extend the
    `Notable` interface only (`arc?: NotableArc | null`, `rivalNotableId?: number`); `backstory?`
    already exists. Mint-time defaults; no per-field serializer edits needed.

## §NEG — Persistent multi-round diplomacy negotiation (Mechanics 8.5 → 9)

Replaces the one-shot `counterOffer` gift roll as the *only* counter path (keep the method; it
becomes the "quick settle" fallback the Counter button offers alongside "negotiate").

```ts
interface Negotiation {
  id: number;
  rivalId: number;
  offerKind: string;        // mirrors RivalOffer kind
  round: number;            // exchanges consumed (max 4: player 2, rival 2)
  terms: { gift: number; durationMonths: number; sweetener: string | null };
  lastMoveBy: 'player' | 'rival';
  openedDay: number;
  expiresDay: number;       // openedDay + 90; rival withdraws on expiry, small relations ding
  state: 'open' | 'accepted' | 'collapsed';
}
```

- Player counters an offer → Negotiation opens with adjusted terms (UI: gift slider ± and
  duration choice). Rival responds on its monthly diplomacy tick, not instantly:
  accept / counter-back / walk away, weighted by personality (commerce↑ accept-on-gift,
  honor↑ walk-on-lowball, grudge↑ patience↓) and current relations; patience decays per round
  (round-4 response is accept-or-walk, never counter). All responses voiced via
  `rivalVoiceTone` (§L5 families extended with counter/walk lines).
- Walk-away: relations −4, `treatiesBroken`-style memory NOT set (a failed haggle is not a
  betrayal). Expiry unanswered by player: rival withdraws, relations −2.
- Cap: ≤2 negotiations open at once (UI disables Counter beyond that).
- Tests: personality-weighted response distribution (seeded, banded), round cap, expiry,
  persistence round-trip, determinism (negotiation RNG draws only on the monthly tick).

## §ARC — Notable narrative arcs (Lore 6 → 8+)

Engine in `notables.ts` (monthly), content from `docs/lore-bible.md` tone.

```ts
interface NotableArc {
  kind: 'scandal' | 'ambition' | 'feud' | 'redemption';
  stage: 0 | 1 | 2 | 3;    // 3 = terminal beat fired, then resolved=true
  startedDay: number;
  nextBeatDay: number;      // 2-6 months between stages (rng at stage entry)
  targetNotableId?: number; // feud only
  resolved: boolean;
}
```

- **Seeding** (monthly, only if no active arc on the notable; global cap 3 active arcs):
  trait-gated — corrupt/greedy → scandal; ambitious/proud → ambition; vindictive/proud →
  feud (target: same-settlement or cabinet peer); a notable whose scandal resolved badly →
  redemption eligibility for 5 years. Base chance ~1.5%/month per eligible notable.
- **Progression:** at `nextBeatDay`, fire the stage beat (bio chronicle + main log), then roll
  escalate vs fizzle (trait-weighted; fizzle appends a quiet closing beat, resolved=true).
- **Terminal effects (stage 3):** scandal → resignation or loyalty/legitimacy hit (reuse the
  existing defection/scandal machinery — no new punishment systems); ambition → demands
  promotion: pay political capital or take a loyalty crash; feud → loser's skill −10 or exits
  public life; redemption → loyalty +20, skill +5, log triumph.
- **Backstory at mint:** compose 1-2 sentences from templates: origin (settlement + nation
  flavor from names.json mapping) × formative event (trait-linked). Deterministic from the
  mint rng draw. Rendered at the top of the chronicle UI (Wave-1 task surfaces the chronicle).
- **Content decks (delegated, lore-bible tone, orchestrator-reviewed):** 4 kinds × 4 stages ×
  3 variants = 48 beats + 12 backstory origins + 12 formative events. Beats interpolate
  {name}, {town}, {rival}, {role}.
- Tests: seeding respects trait gates and caps; stage machine advances/fizzles; terminal
  effects apply exactly once; serialize round-trip; no arc RNG outside the monthly tick.

## §FORT — Fortifications (activates M1's dormant axis)

- New region building `fortress` in `src/data/region_buildings.json` (gated on the existing
  `fortification` town tech line or the military branch equivalent — implementer confirms the
  region-tier tech gate pattern from siblings like ironworks): meaningful cost, upkeep,
  +garrison strength, and — the point — battle defense.
- `military.ts`: replace the documented omission with `BATTLE_FORT_MULT = 1.15` applied when
  the defending settlement (or province capital for province battles) has a `fortress`;
  combined defender bonus stays clamped by `BATTLE_DEFENDER_BONUS_CAP = 1.25` (already
  defined for exactly this).
- Rival AI: fortify-minded factions (aggressiveness < 30 or the 'citadel' goal) build one on
  their capital when treasury allows.
- Tests: fort flips a marginal battle band (seeded statistical); cap holds (1.10 × 1.15 → 1.25).

## §DIFF — Real-teeth standard tier (Difficulty 7 → 9) — ORCHESTRATOR ONLY

Owner-approved target: standard = survivable with play, **2-4 of 20 autoplay seeds end
badly** (dystopia branch, major territory loss, or economic collapse); easy = today's feel.

- Mechanism: introduce a difficulty preset layer so `easy` maps to today's standard
  multipliers; `standard` becomes crisisFrequency ~1.25, aiAggression ~1.3, economicVolatility
  ~1.25, plus grievance decay −15% and a modest gov-outlay skim increase. Exact values are
  NOT final — they come out of iterative `npm run sim -- 181 20` sweeps against the seed-fate
  target, then an Opus adversarial pass reviews the curve before commit.
- Re-pin `economy-balance`, `monetary-bounds`, and any seed-fate assertions to the new
  standard; add an easy-tier test pinning today's coasting behavior so it's never lost.
- Hard rule: every bad ending in the sweep must trace to a visible, escapable pressure chain
  (log-auditable), not silent attrition — else the knob is wrong, not the player.

## Not chased (honest 10-limits, recorded)

External skeptical audits rarely grant 10s. Structural ceilings, per re-auditors: Graphics
without bespoke authored art (G1 dropped by owner); Lore 10 implies authored campaign-scale
narrative; Difficulty 10 implies a tuned challenge community-tested over time. 9s are the
credible target; the work above is sequenced to maximize each.

## Sequencing

1. Wave 1 (running) → verify, commit.
2. §V3 + §NEG + §ARC engine cores — orchestrator inline. Content decks + arc/negotiation UI —
   delegated after cores land. §FORT — delegated (data + wiring), orchestrator reviews battle
   math.
3. §DIFF — orchestrator inline with sweeps + Opus adversarial pass. Re-pin tests.
4. Full re-audit (3 skeptical passes, same rubric), scorecard update, HANDOFF/session-log.

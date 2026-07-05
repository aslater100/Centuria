# CENTURIA — Full Production Audit (2026-07-05)

**Build audited:** `claude/centuria-production-audit-uxegqo` @ v1.7.0 · commit `5aa107b`
**Method:** verified in-build — `npm test` (1640 pass / 110 files), `npm run build` (clean), headless sweeps across all four difficulty tiers + dynamism flags, and a Playwright drive-through of the actual canvas app (title → options → help → scenario → region → HUD panels, 12 + 6 screenshots, 0 page errors). Every load-bearing claim below is cited to `file:line`, a command + its output, or marked **UNVERIFIED**.
**Panel:** AAA systems/design director · QA/release lead · player-facing critic. POV named where they diverge.

> **Runtime caveat:** this is a headless Linux box. Canvas *animation feel*, audio *quality/mix*, and real-hardware frame pacing were driven far enough to prove they exist and don't crash, but their subjective quality is **static/screenshot-only — runtime feel unverified.** Marked per-dimension.

---

## 1. ONE-LINE VERDICT

> **"A remarkably polished, deterministic, well-tested shell around a deep-simulation promise that is mostly switched off: the richest systems are dead code, tech-gated, or opt-in flags, so the default game is a slow, low-stakes economy on rails that you cannot really lose. Competent hobbyist-plus — not commercial-AAA."**

---

## 2. SCORE TABLE

Scored 1–10 against genre **leaders** (Civ VI, CK3/Vic3, Cities: Skylines, RimWorld, Frostpunk), half-points, lower-of-two when torn. No participation credit.

### Weighting (and why)
A deep-sim 4X lives or dies on its systems and their credibility, so **Core Design (30)** and **Simulation Credibility (15)** carry 45% together. A release lead weights **Technical QA (20)** heavily — this build's strongest axis. Buyer-friction axes **UX/Onboarding (15)**. **Content/Production (12)** and **Longevity/Positioning (8)** round it out. Total 100.

| # | Dimension | Score | One-line indictment |
|---|-----------|:-----:|---------------------|
| **A. CORE GAMEPLAY & DESIGN — group avg 5.8, weight 30** ||||
| A1 | Core loop | **6.0** | Real found→grow→statehood→century arc with a visible objective tracker, but the opening is static ($0-GDP hut for game-months) and the sim visibly plays itself. |
| A2 | Depth vs busywork | **5.5** | 34 systems wide; the deep ones (combat, money, demographics) are shallow, gated, or dead — wide-but-shallow in the game you actually play. |
| A3 | Meaningful choice & agency | **6.0** | Event branches with genuine tradeoffs (Crackdown vs Concede) are the highlight; default play still trends to on-rails era-branch endings. |
| A4 | Balance / dominant strategy | **5.0** | Multiple degenerate lines: money-printing (+21.6%/yr GDP), stacked flat-% tax surplus, and "skip units, stack war multipliers." |
| A5 | Pacing & progression | **5.5** | Slow early, samey climate endgame (drowned/dystopia dominate), surplus snowball. |
| A6 | Stakes & failure | **5.5** | On easy/default you **cannot lose** — 0 losses across 12 seeds; teeth exist only at standard+. |
| A7 | Victory / goal clarity | **7.0** | "Toward Statehood" tracker is always-visible; solarpunk/unification/legacy paths are clearly gated. A genuine strength. |
| A8 | Replayability | **6.0** | Seeded worldgen, 11 rivals × 5 archetypes, 4 tiers, dynamism toggles — but 39 authored events and convergent endings cap run-to-run variety. |
| **B. ONBOARDING, UX & ACCESSIBILITY — group avg 5.5, weight 15** ||||
| B1 | FTUE / onboarding | **5.0** | A real 6-section wiki auto-opens **once**, then you're dropped into a century-sim cold; no interactive/contextual tutorial. |
| B2 | HUD / information architecture | **6.0** | Glanceable top bar + objective tracker + minimap, but the event log shows only the last 3 lines and the map hover tooltip is **dead code**. |
| B3 | Readability / cognitive load | **5.5** | Emoji-only resource readout with no text fallback; causality scrolls off a 3-line log; settings buried behind quit-to-title. |
| B4 | Accessibility | **5.0** | Text-scale, audio mixing, OS motion-reduce, fullscreen present — but **no colorblind mode, no input remap, no in-game settings, no `aria-live`.** Below modern platform bar. |
| B5 | Input & controls | **6.0** | Documented keyboard shortcuts + mouse pan/zoom/select + draggable panels; WASD/arrow pan is stubbed, no remap, no pad/touch. |
| **C. TECHNICAL QUALITY & QA — group avg 7.25, weight 20** ||||
| C1 | Stability | **8.0** | 1640 tests pass, clean build, **0 page errors** across a full UI drive-through; nothing crashed under exercise. |
| C2 | Determinism & save/load | **7.0** | Seeded mulberry32, byte-identical reload **behavioral** test, save < 224 KiB — minus an asymmetric schema gate and no save migration. |
| C3 | Performance | **7.0** | No daily hot-path landmine at 30 settlements; `roleMult` O(n×notables)/day + monthly O(n²) arbitrage are watch-items past ~50 towns. *(static/headless)* |
| C4 | Bug density & edge cases | **6.5** | Broad edge tests, but dead combat subsystems, escape-hatch conquest tests, dead tooltip, and a `$`/`£` currency inconsistency. |
| C5 | Test suite quality | **7.5** | ~70% behavioral; strong property/invariant tests on economy, monetary, combat, save, determinism, AI. Victory tested with stubbed inputs; UI untested. |
| C6 | Build health / type safety | **7.5** | Strict all-on, 0 `@ts-ignore`, clean sim/UI boundary — but **14 `any`** (CLAUDE.md bans them) and a 725 KB unsplit bundle. |
| **D. CONTENT & PRODUCTION VALUES — group avg 6.2, weight 12** ||||
| D1 | Art direction | **7.0** | Procedural, coherent, and clearly **intentional** — town sprites tier up hut→castle, the map reads, the title screen is composed. On its chosen procedural terms, good. |
| D2 | Audio | **6.5** | Substantial audio code (music 649 LOC, soundscape, SFX with per-channel volume) — present and mixed. *Quality UNVERIFIED (no audio device).* |
| D3 | Game feel / juice | **5.5** | 60 fps, event modals, satisfaction reacts live — but slow early pacing and canvas transition polish are *runtime-unverified*. |
| D4 | Narrative / writing | **5.5** | Notables, dynasties, backstory, 4 historical beats and event flavor exist, but 39 events is lean and "characters" are mostly named stat blocks. |
| D5 | Content volume | **6.5** | 85 research nodes (1905–2090), 57 placeables, 53 room/station types — systemically sufficient; authored breadth thin for a 20–40 hr campaign. |
| **E. SIMULATION CREDIBILITY — group avg 5.25, weight 15** ||||
| E1 | System plausibility | **5.0** | The headline systems are inert by default: flat 2% inflation, dead occupation/supply code, non-aging demographic bands. |
| E2 | Calibration | **5.5** | Constants self-labeled "design-intent, not a data source"; a handful sourced; monetary *bounds* are tested, the *dynamics* are vibes. |
| **F. LONGEVITY & POSITIONING — group avg 5.5, weight 8** ||||
| F1 | Endgame / replay / mod surface | **5.5** | Moddable JSON data defs + multiple win paths, but convergent endgame and no mod loader/docs. |
| F2 | Comparative positioning | **5.5** | Vic3-lite economy (inert by default), a broad-but-shallow political layer weaker than CK3, combat below any war-GS; polish strong for solo scope. |

### Weighted overall

| Group | Avg /10 | Weight | Contribution |
|-------|:------:|:------:|:-----------:|
| A. Core Gameplay & Design | 5.81 | 30 | 17.4 |
| B. Onboarding, UX & Accessibility | 5.50 | 15 | 8.3 |
| C. Technical Quality & QA | 7.25 | 20 | 14.5 |
| D. Content & Production | 6.20 | 12 | 7.4 |
| E. Simulation Credibility | 5.25 | 15 | 7.9 |
| F. Longevity & Positioning | 5.50 | 8 | 4.4 |
| **OVERALL** | | **100** | **≈ 60 / 100** |

> **60 / 100 — C− · "mixed, niche."** Metacritic band: *mixed — a technically accomplished deep-sim skeleton whose promised depth is largely inert in the default game.* A publisher reviewer would praise the stability and system breadth, then dock it hard for a core that plays itself.

**Where the prior in-repo audit (commit `6dd7dae`: "depth + difficulty 8.5→9.5") was too generous:** it scored the *code that exists* (a rich monetary/combat/occupation layer) rather than the *game that ships*. Verified in-build, that layer is (a) tech-gated behind Central Banking so inflation is a frozen `0.02` in normal play, (b) partly dead code (`armyGroups`/`provincialOccupations` are never populated outside tests), and (c) decoupled from outcomes (deep province battles don't move the war score). Grading the shipping default, depth is ~5.5 and difficulty's *default* stakes are ~5.5 (real only at standard+).

---

## 3. TOP 5 STRENGTHS (evidence-cited)

1. **Release-grade stability & determinism.** 1640/110 tests pass, `tsc && vite build` clean, and a full Playwright drive-through of the real canvas app logged **0 page errors**. Determinism is real: seeded mulberry32 with all three RNG streams serialized (`rng.ts:7-32`, `region.ts:12795-12797`), **zero** `Date.now`/`Math.random` in the sim tick path, and a *behavioral* round-trip test that re-ticks 30 years post-load and asserts byte-identical state (`tests/serialize-determinism.test.ts:70-83`). This is the best axis in the build.
2. **Difficulty tiers with real teeth.** My own sweep (`SIM_AUTOPLAY_STATEHOOD=1`, 6 seeds/tier) produced a clean loss gradient — easy **0/6**, standard **3/6**, hard **4/6**, brutal **6/6** (revolution + encirclement). Backed by substantive knobs, not labels: `unrestPressure` 0.0/1.0/1.5/2.0 driving immiseration pressure (`region.ts:6511`) and coalition formation (`region.ts:3664-3667`).
3. **Coherent, intentional procedural art.** Verified by screenshot: the capital sprite tiers up hut→castle with population (1919 hut → 1964 keep at pop 1329), the hex map reads cleanly with rivers and rival borders, and the title screen is composed. It looks finished, not placeholder.
4. **Clear, always-visible goals.** The "Toward Statehood" tracker (towns 1/3, citizens 14/500, treasury $/target, garrison) telegraphs the first win gate at a glance, and multiple end paths are real code (solarpunk/unification/legacy — `victory.ts:12-39`). Goal clarity is a genuine cut above most sims of this scope.
5. **A behavioral test suite that pins real invariants.** ~70% behavioral: a 20-seed × 100-year monetary envelope sweep, 100-trial combat win-rate bands with casualty/morale conservation, save-size regression guards, and long-run finiteness checks. This is why the build is as stable as it is.

---

## 4. TOP 10 PROBLEMS (ranked by severity)

| # | Problem | POV | Evidence | Player-facing impact | Fix cost |
|---|---------|-----|----------|----------------------|:--------:|
| 1 | **The "deep economy" is inert in normal play.** Inflation is a frozen `0.02`; the entire monetary layer (`tickMonetary`) is gated behind `hasCentralBank()`, which default/autoplay never reaches. | Design director | `region.ts:3971` (init `0.02`), `region.ts:6751` (gate), `hasCentralBank()` `region.ts:3961`. **Empirically confirmed:** every default sweep row shows infl% = **exactly 2.0** across 100+ years; only flags move it. | The economic "sim" a normal player feels is a constant. The marquee credibility feature is invisible unless you tech into it. | Milestone |
| 2 | **The war the player actually fights is a single power-ratio roll — and the deep combat is dead/decoupled.** `tickPlayerWar` decides capitulation from `pop^0.6 × quality-stack`; it starts with `units:[]`, so composition/terrain/fortress do nothing by default. `resolveProvinceBattle` has real depth but **never touches the war score**; `resolveArmyGroupBattle`/`tickSupplyLines`/`tickOccupation` are dead. | Design director | `military.ts:664,691` (ratio), `region.ts:11669` (`units:[]`), score writes only in `tickPlayerWar` (671–806), none in `resolveProvinceBattle` (182–283); **verified** `armyGroups` has 0 writes and `provincialOccupations` is only deleted/read, never written, anywhere in `src/sim`. | Warfare feels like watching a number tick; building a fortress or composing an army changes nothing in the mainline war. | Milestone |
| 3 | **You cannot lose the default game.** 0 losses / 0 revolutions / 0 secessions across 12 default-difficulty seeds to 2100; all end in flavor era-branches (drowned/dystopia). Stakes are opt-in (standard+). | QA lead / critic | Default sweep output (revs=0, secs=0, no `LOSS:`); teeth gate `unrestPressure` = 0 on easy (`region.ts:3664`). | No tension in the default experience; survival is guaranteed, so the century has no jeopardy. | Design |
| 4 | **Degenerate strategies exist and undercut the balance.** Money-printing regime credits `gdp×0.018/mo = +21.6%/yr` for a survivable ~10% inflation; flat-% tax civics stack ~+8.3% of GDP against a fixed ~9% spend floor; "skip units, stack `standing_army×1.5·minister×1.2·reform×1.2` (~×2.74) + mobilization ×2.3" dominates war. | Design director | `monetary.ts:180-181`, `region.ts:7028-7045`, `region.ts:11798-11803`. Print/interest both require `hasCentralBank()` (`region.ts:7043`) so they're **late-game** exploits, not turn-1. | An optimizing player trivializes money and war; a reviewer finds the print button. | Moderate |
| 5 | **No first-time-user teaching beyond a passive wiki.** The 6-section wiki auto-opens **once** via a `localStorage` flag, then never re-surfaces; no interactive walkthrough, no contextual prompts, no staged unlocks. | UX director | `regionview.ts:372-379` (`WIKI_FIRST_RUN_KEY`), content `WikiPanel.ts:20-255`. | New players bounce off a dense 1919–2100 sim with a $0-GDP hut and a wall of text. Refund-window risk. | Design |
| 6 | **Demographics is a growth multiplier in a cohort costume.** Only net `(birth−death)` is modeled; the 5 age bands **never age** (`bands[i]→bands[i+1]` does not exist anywhere) — the GDD's "cohorts age, reproduce, learn" is unimplemented. | Design director | `demographics.ts:37-41`; **verified** no band-aging shift in `src/sim`. | The "demographic transition" is a calendar threshold, not an emergent pyramid; population is a smooth curve, not a society. | Milestone |
| 7 | **Dead map tooltip — the map's primary hover affordance is wired to nothing.** `updateTooltip()` builds a full settlement card (name/pop/happy/food) but **has zero callers**; the canvas `mousemove` only pans. | QA lead | `regionview.ts:806`; **verified** single definition, no invocation in `src/`. | Hovering any settlement surfaces nothing — the most natural "what is this?" gesture is dead. | Trivial |
| 8 | **Accessibility is below the modern platform bar.** No colorblind mode, no input remapping, no in-game settings menu (audio/text-size reachable only by quitting to title), no `aria-live` on the event log. | QA lead / critic | Options surface verified by screenshot (SFX/Music/Ambience + Text Size + Display only); `pausemenu.ts:219-231` (no options); `main.ts:391` (pan "not yet implemented"). | Colorblind and motor-accommodation players are underserved; platform cert/accessibility reviews will ding it. | Moderate |
| 9 | **`any` policy violations + escape-hatch tests.** 14 real `any` (CLAUDE.md bans them outright), and conquest tests carry `if(...) return` guards that pass while asserting nothing (land-transfer never checked). | QA lead | `defs.ts:183`, `region.ts:13066`, `regionview.ts:4006/4008/4020`, `as any` ×9; `tests/conquest.test.ts:149,296`. | Low runtime risk, but the land-conquest transfer is effectively untested and the "no `any`" invariant is already broken. | Trivial–Moderate |
| 10 | **Asymmetric save-schema gate + no migration.** The load gate checks only `< SAVE_SCHEMA_VERSION`, so a *future*-version save is silently accepted and misparsed; and every schema bump hard-invalidates all in-progress campaigns (no migration). | Release lead | `region.ts:13023` (`< ` gate, **verified**), `SAVE_SCHEMA_VERSION=5` `region.ts:3755`. | Rare in practice (needs a downgrade), but a v6-into-v5 load corrupts silently instead of rejecting; and patches wipe saves. | Trivial (gate) / Design (migration) |

---

## 5. BLOCKERS (greenlight / cert / refund-review)

- **Refund-review blocker (soft):** the combination of *no real FTUE* (Problem 5), *no default stakes* (Problem 3), and an *inert-feeling default economy* (Problem 1) is exactly the profile that generates "I bounced in 30 minutes, nothing was happening" refunds. Not a code defect — a **design** blocker for a paid release.
- **Cert-hygiene defect (hard, cheap):** the asymmetric schema gate (`region.ts:13023`) should be `!==`; a future-version save currently misparses silently. One-line fix, but it's a data-integrity defect a cert pass can flag.
- **Truth-in-advertising risk:** shipping copy that calls this a "deep simulation" while inflation is a constant, occupation/supply are dead code, and demographic cohorts don't age is a **reviewer-and-storefront** exposure. Either wire the systems into default play or scope the marketing claims.
- **Not blockers:** stability, determinism, save round-trip integrity, build health, and performance at target scale are all **green** — none would fail a technical greenlight.

---

## 6. THE HONEST CEILING (per low score: wiring / design / milestone)

- **Cheap wiring (days):** dead tooltip (Problem 7), asymmetric schema gate (Problem 10a), the 14 `any` and escape-hatch tests (Problem 9), 3-line event log → scrollable, resource-cell `title=` fallback, in-game options menu. These lift B2/B3/C4/C6 by a point each with low risk.
- **Moderate design (weeks):** real FTUE (state-driven guided first session), colorblind mode + input remap, rebalancing the money-print/tax-stack exploits, giving the default tier teeth. Lifts A4/A6/B1/B4.
- **Milestone systems (the real ceiling):** making combat depth *matter in the mainline* (feed `resolveProvinceBattle` into the war score, or populate `armyGroups`/occupation in live play); wiring the monetary layer into default play without a Central-Banking gate; a genuine aging cohort model. **These are unreachable without shipping-team engineering time** — they are new-system integration, not tuning. This is the gap between "impressive solo deep-sim skeleton" and "credible commercial deep sim," and it is A2/E1/E2's true ceiling.

---

## 7. GREENLIGHT DECISION — **REWORK** (as the AAA director)

Rework, not delay. This build has a genuinely rare foundation for a project of its scope — deterministic core, real test discipline, clean architecture, coherent art, and clear goals — and I would not throw a week at polishing screenshots. The problem is structural and unavoidable: **the product's entire pitch is "deep simulation," and the deep simulation is switched off in the game people will actually play.** Inflation is a constant, the interesting combat is dead or decoupled, demographics don't age, and you can't lose. No amount of UX polish fixes a core that plays itself. The path forward is a scoped rework milestone — pick the two or three systems you can genuinely make *felt in default play* (I'd choose: wire province-battle outcomes into the war score, ungate a simplified monetary response, and give the standard tier real default stakes), cut or hide the dead subsystems so the code matches the claims, and build one real guided first session. Ship *that* as Early Access with honest "systems-sim, work in progress" framing. Shipping the current build at a full price as a finished deep sim invites a mixed-70s-or-below reception and a refund tail; shipping it at a **low EA price (~$10–15) with scoped-back claims** is defensible today, but the review scores won't clear "mixed" until the core turns on.

---

## 8. COVERAGE GAPS (what I could NOT verify)

- **Real-time game feel & juice (D3):** I drove the app and confirmed 60 fps and live event feedback, but animation smoothness, transition polish, and "chunk" of actions on real hardware are **static/screenshot-only.** A follow-up needs a human play session.
- **Audio quality/mix (D2):** substantial audio *code* exists; with no audio device I could not hear it. Graded on presence, not quality — **verify with a play session.**
- **Long-session real-hardware performance:** perf is from static hot-path analysis + headless timing. The `roleMult` daily O(n×notables) and monthly O(n²) arbitrage are fine to ~30–50 settlements in theory; **a 30+-settlement, 100-year real-time session on a mid-spec machine was not run.**
- **Human-driven balance:** all balance evidence is from the autoplay/headless harness. The autoplay is a heuristic — a skilled human likely reaches the money-print/tax-stack exploits *faster* than autoplay and may break systems autoplay never touches. **A human optimizer pass is the missing balance test.**
- **HUD panels under real interaction:** several HUD panel captures were polluted by pause-menu sequencing; I confirmed the Region panel, Wiki, Century Graph, event log, minimap, and objective tracker render correctly, but did not exhaustively drive every sub-panel's interactions.
- **Electron desktop shell:** the Electron binary download is blocked in this environment; I audited the Vite/canvas app the shell wraps, **not** the packaged desktop build (updater, window chrome, cert signing).

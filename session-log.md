# Session log

## 2026-07-05 — Spec 13 Phase 1: living rival doctrines (branch `claude/continue-ibf23m`)

Milestone push on **Mechanics depth → 10** (owner picked "milestone 9→10"). Spec 11 landed the
combined-arms counter triangle in the province resolver and retrofitted the main player-war path,
but the enemy in `tickPlayerWar` was `rivalWarComposition(year)` — one **static, era-only stub,
identical for every rival**, terrain forced `undefined`. So the tactical duel in the path players
actually live in was *player choice vs. a scripted constant*. Phase 1 makes it two-sided and
per-opponent. Spec: `docs/specs/13-living-doctrines.md`. **Schema-free — NOT a Hard Stop.**

### §A — `rivalComposition(rv, year)` (systems/military.ts)
Pure function layered on the kept era baseline: `offense = (weights.expansion + weights.risk)/20`
(0..1, 0.5 = neutral) re-weights the base arm counts — offensive expansionists (Hegemon/Opportunist)
skew to shock+gun arms, cautious isolationists (Hermit) mass infantry. A neutral temperament
returns the era base **unchanged** (strict generalization of the old stub). Read off `weights`, so
it generalizes past the five archetypes to named rivals. `tickPlayerWar` now calls it instead of
`rivalWarComposition`. Effect: the player's optimal counter **differs by opponent** (militia+cavalry
vs a Hegemon's horse/guns; artillery vs a Hermit's infantry mass).

### §B — theater terrain (`playerHomeBiome`)
`tickPlayerWar` passed `biome = undefined`; it now passes the biome of the player's largest
settlement (rivals are off-map, so the decisive ground is the player's own). Terrain reweights both
sides symmetrically — a second, fair consideration in the counter decision. Deterministic.

### Verification
Build ✓; full suite **1650** green (new `tests/living-doctrines.test.ts`, 8 tests: neutral =
baseline, temperament differentiation, per-opponent counter flips, terrain-as-input, count floors).
`SIM_AUTOPLAY_STATEHOOD=1 SIM_DIFFICULTY=standard` 100y×20 sweep **per-seed identical** pre/post
(15 nation / 5 encirclement) — outcome-neutral for autoplay (which fields no deliberate counters),
the axis bites only in the player-driven war path. No new `any`, no schema change.

### Phase 2 (deferred — Hard Stop, awaits sign-off)
Persisted per-war rival composition that adapts to counter the player's observed mix each month
(with lag) → a rock-paper-scissors tempo war. Needs `SAVE_SCHEMA_VERSION` bump + serialize/version
pins. Not started.

## 2026-07-04 — Spec 12: diplomacy depth + encirclement difficulty (branch `claude/game-audit-score-8ggzeu`)

Owner mandate: push **diplomacy depth** and **difficulty** each toward 10. Approvals on record:
save schema v5, difficulty = climate parity. One interlocking system delivers both — bloc
alignment is the new depth axis AND the escape valve from the new difficulty pressure. Spec:
`docs/specs/12-diplomacy-ten.md`.

### §A — depth: alignment diplomacy (new axis on the existing bargaining table)
- **Entente chip** (`DealBasket.entente`): the player pledges alignment with a rival against a
  named third power. Personality-priced via `ententeAppetite` (a rival won't turn on an ally/friend
  or side with a player it fears); on sign it records a persisted `Entente`, dings the target −8,
  and — the teeth — an entente partner joins the PLAYER's side (`playerWar.allies`) when war is
  declared on their shared target. Cap `MAX_ENTENTES` 3.
- **Broker foreign peace** (`brokerForeignPeace`): the player funds a white peace between two
  rival powers — agency to shape the board, not just react. Weighted by the parties' temperament;
  one `aiRng` draw.

### §B — difficulty: encirclement (new persisted coalition + terminal loss)
- `tickCoalition` (teeth-gated, nation-gated): a hostile/threatened world coalesces
  (balance-of-power — even neutral rivals fear a hegemon), hardens month by month, issues an
  ultimatum, and — unanswered — marches as one. Losing that coalition war = `gameOverCause
  'encirclement'`, a new climate-independent run-ender. Three logged, escapable exits: split a
  member (entente/pact/gift), `yieldToCoalition`, or win the war.
- **Co-belligerents finally weigh** (`military.ts`): `allies`/`enemyAllies` add
  `rivalWarPower×0.5` to their side, plus a multi-front score drag — a 4-power bloc now
  out-masses a lone nation. Both lists empty → byte-identical, so every 1v1 war and the default
  sweep are unchanged.

### Schema v5 (owner-approved Hard Stop)
`SAVE_SCHEMA_VERSION` 4→5; `ententes` + `coalition` in serialize/deserialize; `DealBasket.entente`
rides the `counters` dump. Two version-pin tests updated 4→5.

### Verification
Build ✓, full suite **1639** green (11-test `tests/diplomacy-coalition.test.ts` added; default
determinism / economy-balance / monetary-bounds all held → no re-pin). Parity sweeps
(`SIM_AUTOPLAY_STATEHOOD=1`): standard **10 drowned / 6 encirclement / 4 revolution** (was ~85%
climate); easy **20 drowned / 0 encirclement** (coast preserved); standard-passive **0
encirclement** (no ambush of a non-dominant player). Adversarial review by Opus on the balance
curve + war-power change.

### Honest ceiling (recorded, not inflated)
A skeptical external audit still rarely stamps a flat 10 (Difficulty 10 ⇒ community-playtested
tuning; Mechanics 10 ⇒ authored campaign-scale systems). This is built to the credible maximum:
diplomacy now genuinely multi-axis with player agency + a coalition metagame; difficulty has a
second, diplomacy-driven, escapable run-ender and climate no longer monopolises endings.
Insolvency stays player-reachable but non-autoplay-firing (carried-over gap).

## 2026-07-03 — performance & visual audit + fixes (branch `claude/performance-visual-audit-prxo5b`)

Four parallel audits (regionview draw path, sprites/backdrop/minimap caching, sim tick
hotspots, visual/stutter/DPR) → fixes applied. Verified: build + full suite 105/1581 +
bench-region gate PASS + Playwright visual smoke (title + region screenshots at DPR 2,
zero page errors).

### Frame pacing & main loop (`src/main.ts`, new `src/ui/framePacer.ts` + tests)
- Replaced the `<14ms → skip` soft-cap with `FramePacer`: renders every Nth vsync
  (N locked to the display's refresh via debounced EMA). Even cadence on 120/144 Hz
  (60/72 fps vs the old 48), immune to timer jitter turning one 60 Hz frame into a
  33 ms hitch. Unit-tested like `runCatchUp` (7 tests, fake deltas).
- Per-frame DOM writes removed: dead `#minimap` canvas deleted, `dataset.era`
  write-guarded (was forcing style recalc vs 34 `[data-era]` selectors every frame),
  fps counter throttled to 4 Hz.
- Canvases now opaque (`alpha:false`) — skips per-frame alpha compositing.

### HiDPI (new `src/ui/dpr.ts`)
- Backing store scaled by `devicePixelRatio` capped at 2×; game logic stays in CSS px
  (`RegionView.viewW/viewH` + one base `setTransform` per frame). Text/lines/sprites
  now crisp on HiDPI; cached bitmap layers (terrain) render exactly as before.

### Renderer (`src/ui/regionview.ts`, minimap, backdrop, titlescreen)
- `this.frame` is now a wall-clock animation counter (60 fps units, advanced by dt,
  clamped): pulses/waves/vehicles/cadence throttles run at the same real speed at any
  render rate. All comparisons were already inequality-based (audited) — safe as float.
- Minimap: 100×100 terrain grid + legend were re-rasterized EVERY frame (~700k
  cells/s) → now offscreen-cached, invalidated on map identity/size change.
- Routes/cargo dots/trade arrows: had zero viewport culling → cached per-route bbox
  (`routeBBoxCache`) culls whole polylines against `vb`.
- Statehood/nation banner: ~13 `measureText` calls per frame → memoized (`textW`).
- Backdrop horizon glow: `createRadialGradient` per frame → signature-cached canvas
  (mirrors the band-strip `sig` pattern).
- Dead memory-fog layer deleted (fog retired 2026-07; it blitted a fully transparent
  full-screen canvas every frame).
- Hoisted per-frame color-table literals (`CARGO_RGB`/`SECTOR_RGB`/`SECTOR_HEX`),
  `DISTRICT_DEF_BY_ID`/`REGION_BUILDING_BY_ID` Maps replace `.find` per placed item
  per frame, draw-path `hexLayoutParams` calls routed through the cached layout.
- Titlescreen: cloud drift dt-scaled (was 2.4× fast at 144 Hz), gradients cached by
  (w,h), per-frame `clientWidth` layout reads replaced with a ResizeObserver.

### Sim (`src/sim/`) — byte-identical perf fixes
- **Arbitrage scan memo** (`buildGoodPriceScan` in systems/goods.ts): profiling showed
  `worldGoodDemand` at ~13% of ALL sim CPU — the O(N²·G) all-pairs scan re-derived
  world scarcity + sector totals + per-town demand per pair. The scan is read-only
  (dispatch mutates after), so these are loop-invariant: memoized once per scan with
  identical float arithmetic. Serialize-determinism suite confirms byte-identical.
- `roleMult` no longer allocates a filtered array per call (runs 3×/settlement/day;
  `notables` keeps dead entries as dynasty history so the array only grows).
- `tickSupplyLines`: player-settlement list hoisted out of the per-army loop.

### Follow-ups the user approved and landed (second pass)
- **Dead-notable pruning**: `tickNotableLifecycle` now prunes dead notables that no
  dynasty (parent/children) or sitting minister references. Reference-safe by
  construction (every id in a children/parentId link belongs to a kept notable);
  runs only on the monthly tick, never on deserialize, so a serialize round-trip is
  an exact identity. Updated the "dead Notables are replaced" test to assert the
  minted successor's identity, not a count that assumed the corpse lingered.
- **`settlement(id)` Map index**: id→Settlement map rebuilt lazily, invalidated on
  (array ref, length) — a complete key since membership only changes via push or a
  whole-array reassignment (deserialize, `abandonGhostTowns`) and ids are immutable.
  No mutation site instrumented; private/transient, not serialized. Verified
  consistent across a 6000-tick founding/abandonment run.
- **CSS `transition: all`** (21 sites): each scoped to the exact properties that
  element animates across its state rules, same timing — visually identical, no more
  layout-triggered transitions. `backdrop-filter` blur left as a deliberate design
  choice (user chose transitions-only scope).
- **Bench gap**: added a `huge nation (24)` stage growing to `MAX_SETTLEMENTS` via the
  real autoplay-expansion path; the gate now covers the O(N²·G) arbitrage scaling
  (mean tick ~2× the 6-town figure, still PASS under the frame budget).

### Still deliberately not done
- 17 `backdrop-filter: blur()` panels over the live canvas: real compositor cost but a
  visible design change — out of scope for a transitions-only pass.
- `warScars` uncapped (one per war — dozens over a full run), trade-season sort
  (2 goods), BFS `shift()` in `computeRoutePath` (memoized per tick): all negligible
  at real scale.

## 2026-07-03 — audit-to-9 execution (PR #346, branch `claude/game-audit-score-8ggzeu`)

Executed `centuria-plan.md`. 20 of 23 tasks landed; per-task commits on the PR branch, each
verified (targeted tests at task level; final gate = build + full suite 103/1567 + headless
`npm run sim -- 100 10` sweep, all green). Design specs: `docs/specs/09-audit-nine.md`.
Lore canon: `docs/lore-bible.md`.

### Deferred — needs explicit Hard-Stop sign-off before implementation
- **D1 hyperinflation loss state** — spec'd (§D1: inflation ≥ 0.45 + confidence < 20 for 12
  consecutive months → collapse). Needs a persisted `hyperinflationMonths` counter on
  `RegionSim` (save-schema change). Tuning gate: zero collapses in a default 20-seed sweep,
  scripted print-regime scenario collapses in ~3 years. Opus adversarial pass on the
  threshold recommended before merge.
- **D2 revolution → partition chain** — spec'd (§D2). Needs a persisted post-revolution
  counter and territory reassignment (feeds victory.ts) — core-state mutation.

### Blocked — environment, not design
- **G1 art-override generation (all 11 slots)**: no live channel. (a) no local SD server
  (a1111:7860 / comfy:8188 both dead); (b) HF MCP Gradio tools not exposed to subagents;
  (c) proxy denies HF egress (`CONNECT 403` to router.huggingface.co) and `HF_TOKEN` unset;
  `scripts/hf-assets.ts` also still targets the retired api-inference endpoint. Cheapest
  unblocks, in order: expose HF MCP tools to the asset-generator agent; or run a local SD
  and `npm run gen:local`; or token + proxy whitelist + port hf-assets.ts to the router.
  QA harness is ready: `npm run shoot` produces the procedural-vs-override A/B pair.

### Smaller follow-ups queued
- M2 UI: add a "Counter" button beside Accept/Decline where the diplomacy panel renders
  `offerFor(rivalId)` → call `r.counterOffer(rivalId)`; sim logs already emitted.
- M3 capacity side: apply the blockade multiplier to sea-route throughput via a
  `blockadeMult` factor in `RegionSim.effectiveCapacity` (guarded `r.sea && playerWar`).
- U7c remainder: hue-only tone classes in `panels.css` (`.c-good/.c-warn/.c-bad`,
  `.ep-beat-good/bad`) + ~30 regionview.ts call sites (inventoried in the U7 agent report /
  PR notes); pattern to follow: the existing `⚠` at regionview.ts:3307 and `●/○` at :5429.
- M1: fortification defender bonus is capped-and-wired but dormant — no defensive building
  ids exist in buildings.json/region_buildings.json yet.
- L4: world-war follow-up beats key off the first rival-rival `foreignWars` entry (proxy);
  an explicit `worldWarPairId` field would make it exact (schema change).
- U8: breakpoints resize panels but don't restructure layout — heavy multi-panel overlap
  at ≤1024px remains possible.
- Audio (out of plan scope): still blocked on missing ffmpeg/encoder — external-tool
  approval required.

## 2026-07-04 — audit-to-9 remainder: D1/D2 loss states + save v2 (branch `claude/game-audit-score-8ggzeu`)

Landed the owner-approved remainder of the audit-to-9 plan — the two Hard-Stop-deferred loss
states, the schema bump they required, and the queued M2/M3/U7 follow-ups. Spec: `docs/specs/09-audit-nine.md`.
Gate: build ✓, full suite 105 files / 1584 tests ✓, new `tests/audit-nine-losses.test.ts` (10
tests). Commits: f9376a4 (core), 52e0e14 (D1 tests+fix), d17e44d (save mgmt), cc88d66 (M2+U7),
spec 2bd6af4.

### D1 — hyperinflation loss state
New persisted `hyperinflationMonths` counter on `RegionSim`. Currency-collapse game-over after
12 consecutive months of `inflationRate >= 0.45` (same game-over path as depopulation). The
spec's original `confidence < 20` co-condition was **dropped**: a headless probe showed sustained
max inflation floors confidence near 55 (via `tickMonetary`'s `inflPressure` term), making the
AND-condition unreachable — D1 would have been a phantom. Trigger is now inflation-only and
escapable any month inflation recovers below 0.45; reachable only under a sustained print-regime
supply cascade (~3 game-years). Default 20-seed × 100-year sweep: zero collapses.

### D2 — revolution → partition
New persisted `postRevoltGrievanceMonths: Record<number,number>` (per-settlement). After a
revolution fires, a player town holding grievance ≥ 75 for 3+ consecutive months secedes at
8% × crisisFrequency / month via new `RegionSim.secedeSettlement()` — reassigns `factionId` to
the nearest hostile rival, updates both factions' `settlementIds`, invalidates the territory
cache (feeds `victory.ts`). No-op if no other faction exists.

### Save schema v2 (owner-approved Hard Stop)
`SAVE_SCHEMA_VERSION = 2`, new `IncompatibleSaveError`, hard-cutover version gate in `deserialize`
(old saves rejected, not migrated — owner deemed them disposable). Wrapper version 4→5 in
`main.ts`. Save management: per-slot delete with Modal confirm, incompatible-save labeling
(delete-only), once-per-in-game-year autosave into the separate quicksave key (3 manual slots
unchanged), standalone Autosave load entry.

### M3 blockade capacity
`blockadeMultiplier()` now also throttles sea-lane throughput via `effectiveCapacity`, not just
naval income; peacetime returns 1 with no RNG (determinism preserved).

### M2 + U7
M2: the 'Counter' button on rival offers is wired to `counterOffer()`. U7: remaining hue-only
danger/safety sites got non-hue glyphs (checkmark/warn/cross, direction arrows) —
legitimacy/happiness/satisfaction/finance/press-freedom/credibility-gap/epilogue-beats.

### Not done
- **G1 art-override generation** stays deferred — owner chose "stay procedural".

## 2026-07-10 — Graphics cohesion pass toward a Civ5 look (branch `claude/game-graphics-improvement-bx5kke`)

Owner asked to move the map's graphics base toward Civilization 5 "with the graphics creators we
already have". Research (renderer/pipeline map + a 3-strategy design panel + judge) surfaced the
key fork: the AI-asset path is what "graphics creators" points at, but it **reopens the dropped G1
"stay procedural" decision** *and* every in-sandbox generation channel is currently
broken/blocked (`hf-assets.ts` → removed `api-inference` endpoint; HF egress 403; MCP-Gradio needs
connector enablement; no local SD). Owner picked **procedural cohesion** (no G1 reopen), with
**local SD (`gen:local`)** as the eventual channel when assets are pursued. So this pass is
**pure procedural, render-only, zero assets, zero schema/sim touch** — and preserves the
procedural-fallback discipline so local-SD art can drop in later.

All changes in `src/ui/regionview.ts`:
- **Phase 0 — era key-light wash** (`drawAtmosphere`): one directional warm-upper-left→cool-lower-
  right tint keyed to era (`eraIdForYear`, module table `ERA_LIGHT`) + season, cached by
  size|era|season, layered under the existing vignette. Day/night stays disabled (`atmosphere()`
  returns night:0/golden:0) — driven by era/season only. So map + tokens + parallax sky share one
  light. Low-alpha tint of the foreground, never a repaint (GDD §3.1 Contrast Rule).
- **Phase 1 — de-diagram, baked into the signature-gated `mapCache`** (`drawTerrain` /
  `drawTerritories`): reusable hex-mask helper `hexMask('ao'|'coast', size)` — a per-tile ambient-
  occlusion rim (lit domes, not flat polygons) and a coast shallows gradient replacing the flat
  turquoise rim; both are one `drawImage` per tile (no per-hex `CanvasGradient` — up to 16384
  tiles). Frontier lines → a 3-pass inward-fading cultural glow band. Contour strokes softened
  0.12→0.06 (AO now carries the depth).
- **Phase 2 — per-frame polish**: `groundShadow()` helper under scouts / expeditions / rival
  diamonds / army squads; additive pulsing water sun-glint (`waterGlintCanvas`, `'lighter'` comp-op
  save/restored so it never leaks); settlement selection → soft additive gold bloom + ellipse ring.

Determinism preserved (render-only, no `Math.random`, no sim reads/writes); all comp-op/alpha
mutations save/restored; no new deps. Build ✓ (`tsc && vite build`), **1650** tests green, and a
Playwright render of the region view at 1935/1985/2055 confirms the effects land with no
corruption and the era light visibly warms/cools across eras.

**Deferred (still gated on owner sign-off / a live channel):** Phase 3 (fill the wired
`town-<tier>`/`backdrop-<era>` slots + HUD chrome — technically the G1 target), Phase 4 (subtle
biome edge-blend on the clickable field — Contrast-Rule-sensitive), Phase 5 (opt-in painted-terrain
asset seam — reopens G1). None started.

## 2026-07-10 (later) — Phases 3–5 landed: terrain seam, biome blend, city banners (same branch, PR #356)

Owner said **"finish up to phase 5"** — explicit sign-off for Phase 4 and the G1 reopen for the
asset seams. What shipped:

- **Phase 5 — painted-terrain override seam** (G1 reopen, seam only; ships inert):
  `AssetCategory` widened to `'town'|'backdrop'|'terrain'`; `TERRAIN_BIOMES`
  (plains/forest/hills/mountains/marsh — water stays procedural, the bathymetry ramp is
  elevation-continuous) + `TERRAIN_SUFFIX`/prompts in `assetCatalog.ts` (512², 64-multiples);
  5 `terrain-<biome>` slots in the manifest's `availableSlots` (**`items` stays `[]`** — the
  git contract holds); `.gitignore` gets `terrain-*.png`. In `drawTerrain`: base biome switch
  extracted to `biomeBaseColor()`; when `assets.get('terrain-<biome>')` holds art it is clipped
  into the hex over the base fill with a **deterministic per-hex source sub-rect** (kills
  wallpaper repetition), smoothing enabled inside save/restore; every procedural detail
  (dither/canopy/tufts/rocks/reeds) is gated on `!tileArt`, so no-art renders **byte-identical
  procedural**. `AssetRegistry` gained a `count` getter and `mapCacheSignature` appends it —
  async `Image.onload` arrival rebuilds the terrain cache exactly once per asset.
- **Phase 4 — biome edge blend + painterly features:** two-band stepped colour bleed
  (`BLEND_BANDS` [0.34, 0.10]/[0.16, 0.13]) from each differing LAND neighbour across the shared
  edge (water boundaries stay crisp — shallows/beach own the coastline); forest canopy upgraded
  from 3 fillRect squares to 4 layered arc crowns (shadow/crown/lit cap); hills to rounded scree
  with a lit edge; mountains gain a lit-NW/shadowed-SE faceted peak. All cache-resident.
- **Phase 3 — Civ5-style city banners:** `drawCityBanner()` (dark rounded plate, era-tinted
  accent from `ERA_LIGHT`, gold pop chip, name) replaces the floating name/pop text;
  `roundedPath()` helper deliberately avoids the `roundRect?.() ?? rect()` idiom (that evaluates
  BOTH sides when roundRect exists, unioning a sharp rect into the path — pre-existing in the
  scout panel).
- **Phase 3 generation — BLOCKED in-session, channels verified live-probed:** HF MCP
  `dynamic_space` invoke returns **`gradio=none`** (managed connector has Gradio Space tools
  disabled — the runbook's predicted cheapest unblock: enable Gradio tools on the HF connector
  for `evalstate/flux1_schnell` + `not-lain/background-removal`). Direct scripts remain dead
  (removed api-inference endpoint + 403 egress). **`gen:local` picks up the terrain family with
  zero script changes** (its only category branch is `'town'` for the 512 floor + bg-cut):
  `npm run gen:local -- --category=terrain` (or bare for all 16). Per the asset-generator
  runbook, nothing was fabricated; the seam was A/B-proven with **route-intercepted synthetic
  textures** (Playwright, nothing written to `public/assets/`): stripes+jitter appeared clipped
  per-hex with visible sub-rect phase variation, town-castle checkerboard replaced the sprite,
  and steady-state fps held (36 vs 34 procedural; the transient 10fps during art arrival is the
  ≤6 one-time cache rebuilds).
- Tests: catalog tests extended (terrain slots, category, no era, 64-multiple dims);
  `gen-local.test.ts` bare-run expectation 11 → 16.

**Verification:** tsc ✓ · full suite green (1651 after the gen-local expectation fix) · build ✓ ·
A/B screenshots ✓ · adversarial 8-angle review run on the diff (findings triaged before commit).

**Still open:** actually generating the 16 slots needs one of: (a) Gradio tools enabled on the
HF connector (then dispatch the asset-generator agent per centuria-plan G1), or (b) owner runs
`npm run gen:local` against a local SD server (their stated preference). Audio stays blocked (no
encoder). Zoom-in pixelation of image-based terrain (cache authored at base scale,
`imageSmoothingEnabled=false` at blit) is a known limitation to pair with real art — supersample
the mapCache when art lands.

### Adversarial review pass (8 finder angles) — all 10 findings fixed in the follow-up commit

Correctness: **signed-shift bug** `th >> 8` → `>>> 8` (negative drawImage source-y on ~half of
hexes once th ≥ 2³¹ — proven with x=24); **mapCacheSignature** re-keyed from registry-global
`assets.count` to `assets.version('terrain-')` (kills the 11-spurious-rebuild startup storm AND
detects in-place slot replacement, which a size count cannot); **ghost-waterline year≥2030 term**
added to the signature (latent: a cool/landlocked run reaching 2030 never showed the flood
overlay); **branch-aware key light** — `eraKeyLight(era, branch)` now lives in `backdrop.ts`
beside `ERA_SKY` (dystopia lights sodium-amber, not neutral teal; wash + banner accents both
consume it; 3 new backdrop tests); **edge blend gated on `!tileArt`** (both correctness finders:
procedural wedges were tinting painted art); **guard asymmetry** normalized (0-width decode →
null at `artFor`, so draw and suppression can't disagree); **river shimmer made static** (a frame
term baked into a cache never animates — it only re-rolled on rebuild); **scout panel migrated to
`roundedPath`** (the pre-existing `roundRect?.() ?? rect()` idiom always unioned a sharp rect —
panel rendered square-cornered with a doubled stroke); **pop chip measured via `textW`** (was a
6px/char guess); **`traceHexPath` extraction** (the corner walk existed in five copies — fill and
clips can no longer drift). Also: per-biome art + blend-style lookups hoisted out of the 16k-hex
loop, mountain facet deduped, `shoot.ts` MANIFEST_SLOTS + script usage docs + HANDOFF slot counts
updated to the 16-slot catalog.

**Correction to commit 5d7a052's message:** it claimed "the no-art render is unchanged" — true
only of the `!tileArt` gating on pre-existing layers; the Phase 4 restyles (edge blend, arc
canopy, scree, mountain facet) intentionally changed the default frame. Owner-approved via
"finish up to phase 5".

**Deferred from review (logged, not fixed):** minimap.ts carries a drifted copy of the biome
palette (marsh/river differ already) — unifying needs a shared module (minimap→regionview import
would cycle); the six `!tileArt` gates could collapse into one `drawBiomeDetail()` (explicit
layer-policy comment added instead); the three per-hex hash sites could share a helper.

Suite: **1654** green · tsc ✓ · build ✓ · post-fix A/B re-shoot ✓ (full tile coverage after the
shift fix, 33fps steady with art).

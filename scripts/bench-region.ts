/**
 * Region (4X) scale benchmark — the perf guard the shipping game lacked.
 *
 * Measures the real `RegionSim.tick()` across game stages so we can defend
 * 60fps from a 1919 colony to a 2000 nation — the "smooth at every stage"
 * guarantee. (Supersedes the removed `bench-scale`/`bench-agents`, which benched
 * the dropped town engine — `Simulation`/`AgentStore` — not the 4X campaign.)
 *
 *   npx tsx scripts/bench-region.ts            # default fixed tick budget
 *   npx tsx scripts/bench-region.ts 6000       # custom ticks per stage
 *
 * Frame model (matches src/main.ts `runCatchUp`): each rendered frame replays
 * accumulated sim time by ticking until either the wall-clock CATCH-UP BUDGET
 * (~8 ms) is spent or a tick cap is hit — whichever first — then renders, letting
 * the calendar lag instead of stalling the frame. So the guard is NOT "mean × 64":
 *  - The hard gate is the WORST SINGLE TICK. A tick longer than a whole 16.7 ms
 *    frame (`FRAME_MS`) is an unconditional stutter the budget cannot hide (the
 *    loop always runs at least one tick), so that FAILS.
 *  - A worst tick over the 8 ms budget (`BUDGET_MS`) but under a frame only means
 *    the calendar advances one tick that frame instead of several — smooth, just
 *    budget-bound — so that WARNs, it does not fail.
 *  - Mean ms/tick is reported as throughput (how many ticks fit in one 8 ms
 *    budget = catch-up headroom), not as a pass/fail verdict.
 */
import { performance } from 'node:perf_hooks';
import { RegionSim } from '../src/sim/region';

/** 60 fps frame. A single tick longer than this always drops a frame. */
const FRAME_MS = 16.7;
/** Wall-clock sim catch-up budget per frame (src/main.ts). */
const BUDGET_MS = 8;

// Fixed timing budget (the sim's calendar acceleration means this spans several
// game-years; we report the actual span per stage).
const TICKS = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 12000;

const SEED = 12345;

// Every stage above tops out around 5-6 settlements, so none of them ever exercise
// the O(N²·G) all-pairs arbitrage price scan (tickPriceArbitrage → localGoodPrice,
// src/sim/systems/arbitrage.ts / systems/goods.ts) at any real settlement count — a
// profiler found that path at ~13% of sim CPU at 22 settlements, invisible to the
// gate above. `MAX_SETTLEMENTS` (region.ts) hard-caps the whole map at 24, so that's
// the ceiling to aim for, not an arbitrary pick.
const HUGE_NATION_TOWNS = 24;

/**
 * Grow a real, fully-initialized late-era nation up to the settlement cap using
 * ONLY the public RegionSim API — no hand-pushed partial settlements. Starts from
 * the 2000 era start (so goods are already all unlocked — the latest `eraUnlock` in
 * INTERMEDIATE_GOODS is 1955) and turns on the two autoplay flags
 * (`autoDevelopPlayer`/`autoExpandPlayer`, the same pair `src/sim/headless.ts` flips
 * for the balance sweep) so BOTH the player faction and its on-map rival
 * `RegionalFaction`s found new settlements through the game's own
 * `maybeExpandFaction` → `foundSettlement` path (staggered monthly AI updates,
 * `updateRivalAI` in systems/rival-ai.ts). The player faction alone caps at 5
 * (`PLAYER_TOWN_CAP`), so the rest of the growth to the 24-town ceiling comes from
 * the 2-3 on-map rival factions (each capped at 12 on normal difficulty).
 *
 * Reaching the cap is probabilistic (staggered `expandChance` rolls), so this ticks
 * until either the target is hit or a safety cap is reached. Empirically (seed
 * 12345) the cap is hit at ~609k ticks — a few seconds of wall time, paid once here
 * in `build()`, not in the timed loop below.
 */
function buildHugeNation(): RegionSim {
  const r = RegionSim.fromEraStart('2000', { seed: SEED });
  r.autoDevelopPlayer = true;
  r.autoExpandPlayer = true;
  const TICK_CAP = 1_500_000; // safety stop well above the ~609k ticks seed 12345 needs
  let ticks = 0;
  while (r.settlements.length < HUGE_NATION_TOWNS && ticks < TICK_CAP) {
    r.tick();
    ticks++;
  }
  return r;
}

const STAGES: { name: string; build: () => RegionSim }[] = [
  { name: 'early colony 1919', build: () => RegionSim.create(SEED) },
  { name: 'mid nation 1950', build: () => RegionSim.fromEraStart('1950', { seed: SEED }) },
  { name: 'late nation 2000', build: () => RegionSim.fromEraStart('2000', { seed: SEED }) },
  { name: `huge nation (${HUGE_NATION_TOWNS})`, build: buildHugeNation },
];

console.log(`frame ${FRAME_MS}ms @60fps; sim catch-up budget ~${BUDGET_MS}ms/frame (main.ts runCatchUp)`);
console.log(`gate = worst single tick < ${FRAME_MS}ms (a longer tick always stutters)`);
console.log(`${TICKS} ticks/stage (fixed timing budget)\n`);
console.log('stage              | towns | span(yrs) | mean ms/tick | ticks/budget | max ms/tick | verdict        | heapMB');
console.log('-------------------+-------+-----------+--------------+--------------+-------------+----------------+-------');

let anyDrop = false;
for (const stage of STAGES) {
  const r = stage.build();
  for (let i = 0; i < 50; i++) r.tick(); // warm up V8 (JIT)

  if (global.gc) global.gc();
  const y0 = r.year;
  let maxTick = 0;
  const t0 = performance.now();
  for (let i = 0; i < TICKS; i++) {
    const s = performance.now();
    r.tick();
    const dt = performance.now() - s;
    if (dt > maxTick) maxTick = dt;
  }
  const elapsed = performance.now() - t0;

  const meanMs = elapsed / TICKS;
  const ticksPerBudget = BUDGET_MS / meanMs; // catch-up headroom: ticks per 8ms frame
  const drops = maxTick > FRAME_MS;          // the hard gate: a frame-busting tick
  const budgetBound = !drops && maxTick > BUDGET_MS;
  anyDrop = anyDrop || drops;
  const heapMB = process.memoryUsage().heapUsed / 1024 / 1024;
  const verdict = drops
    ? `${maxTick.toFixed(0)}ms — DROPS`
    : budgetBound
      ? `ok (budget-bound)`
      : `ok`;

  console.log(
    `${stage.name.padEnd(18)} | ${String(r.settlements.length).padStart(5)} | ` +
    `${`${y0}-${r.year}`.padStart(9)} | ` +
    `${meanMs.toFixed(4).padStart(12)} | ${ticksPerBudget.toFixed(0).padStart(12)} | ` +
    `${maxTick.toFixed(3).padStart(11)} | ${verdict.padStart(14)} | ${heapMB.toFixed(0).padStart(6)}`,
  );
}

console.log(`\nperf gate: ${anyDrop ? 'FAIL — a single tick exceeds one frame ❌' : 'PASS — worst tick fits a frame ✅'}`);
process.exit(anyDrop ? 1 : 0);

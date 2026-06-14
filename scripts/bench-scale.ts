/**
 * Scale benchmark: how does town-tier tick cost grow with agent count?
 * Spawns N settlers on the live Simulation, runs a fixed number of ticks,
 * and reports ms/tick and µs/agent so we can see what breaks at SoS scale.
 *
 *   npx tsx scripts/bench-scale.ts
 *   npx tsx scripts/bench-scale.ts 200 1000 2000 5000   # custom agent counts
 *
 * ponytail: deliberately crude — wall-clock + process memory, no profiler.
 * It exists to ORDER the rewrite (find the bottleneck), not to be precise.
 */
import { performance } from 'node:perf_hooks';
import { Simulation } from '../src/sim/sim';
import { MAP_W, MAP_H } from '../src/sim/world';

const counts = process.argv.slice(2).map(Number).filter((n) => n > 0);
const AGENT_COUNTS = counts.length ? counts : [200, 500, 1000, 2000, 5000];
const TICKS = 200; // ~3.3 game-days at 60 ticks/day

function spawnN(sim: Simulation, n: number): void {
  // Scatter across passable tiles; settlers may overlap (fine for a cost bench).
  let placed = 0;
  for (let y = 1; y < MAP_H - 1 && placed < n; y++) {
    for (let x = 1; x < MAP_W - 1 && placed < n; x++) {
      if (sim.world.passable(x, y)) { sim.spawnSettler(x, y); placed++; }
    }
  }
  // Map full but more wanted? Stack the rest on the centre — still ticks them.
  const cx = Math.floor(MAP_W / 2), cy = Math.floor(MAP_H / 2);
  while (placed < n) { sim.spawnSettler(cx, cy); placed++; }
}

console.log(`tick budget at 60fps = 16.7ms; bench runs ${TICKS} ticks/case\n`);
console.log('agents |  ms/tick | µs/agent | heapMB | full-frame? (64 ticks)');
console.log('-------+----------+----------+--------+-----------------------');

for (const n of AGENT_COUNTS) {
  const sim = new Simulation(12345);
  // Drop the 12 starters so the count is exact.
  sim.settlers.length = 0;
  spawnN(sim, n);

  // Warm up V8 (JIT) before timing.
  for (let i = 0; i < 20; i++) sim.tick();

  if (global.gc) global.gc();
  const t0 = performance.now();
  for (let i = 0; i < TICKS; i++) sim.tick();
  const elapsed = performance.now() - t0;

  const msPerTick = elapsed / TICKS;
  const usPerAgent = (msPerTick * 1000) / Math.max(1, sim.settlers.length);
  const heapMB = process.memoryUsage().heapUsed / 1024 / 1024;
  const fullFrame = msPerTick * 64; // main loop runs up to 64 ticks/frame
  const verdict = fullFrame < 16.7 ? 'ok' : `${fullFrame.toFixed(0)}ms — DROPS`;

  console.log(
    `${String(sim.settlers.length).padStart(6)} | ` +
    `${msPerTick.toFixed(3).padStart(8)} | ` +
    `${usPerAgent.toFixed(2).padStart(8)} | ` +
    `${heapMB.toFixed(0).padStart(6)} | ${verdict}`,
  );
}

/**
 * Headless tuning harness (GDD §13.3): run seeded colonies for N game-days
 * with a naive auto-player and print survival statistics.
 *
 *   npm run sim -- [days] [runs]
 */
import { Simulation } from './sim';
import { MINUTES_PER_DAY, MINUTES_PER_TICK } from './defs';
import { MAP_W, MAP_H } from './world';

const days = Number(process.argv[2] ?? 60);
const runs = Number(process.argv[3] ?? 10);
const ticksPerDay = MINUTES_PER_DAY / MINUTES_PER_TICK;

interface RunResult {
  seed: number;
  pop: number;
  dead: boolean;
  avgMood: number;
  meals: number;
  grain: number;
  wood: number;
}

function autoPlay(sim: Simulation): void {
  // Mark nearby trees and keep a basic build order going, roughly what a new player does.
  const cx = Math.floor(MAP_W / 2);
  const cy = Math.floor(MAP_H / 2);
  let marked = 0;
  for (let r = 3; r < 24 && marked < 30; r++) {
    for (let y = cy - r; y <= cy + r && marked < 30; y++) {
      for (let x = cx - r; x <= cx + r && marked < 30; x++) {
        if (sim.world.inBounds(x, y) && sim.world.at(x, y).kind === 'tree' && !sim.world.at(x, y).marked) {
          sim.markTree(x, y);
          marked++;
        }
      }
    }
  }
  // Paint farm zones in outward ring pattern
  let farmsPainted = 0;
  outer: for (let r = 4; r < 26 && farmsPainted < 3; r++) {
    for (let y = cy - r; y <= cy + r; y += 4) {
      for (let x = cx - r; x <= cx + r; x += 4) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
        if (sim.world.inBounds(x, y) && sim.world.inBounds(x + 2, y + 2)) {
          let canPaint = true;
          for (let dy = 0; dy < 3 && canPaint; dy++) {
            for (let dx = 0; dx < 3 && canPaint; dx++) {
              const tile = sim.world.at(x + dx, y + dy);
              if (tile.kind === 'water' || tile.kind === 'rock' || tile.kind === 'tree' || tile.wall || tile.farmZone || tile.stockpileZone) {
                canPaint = false;
              }
            }
          }
          if (canPaint) {
            for (let dy = 0; dy < 3; dy++) {
              for (let dx = 0; dx < 3; dx++) {
                sim.planZone('farm', x + dx, y + dy);
              }
            }
            farmsPainted++;
          }
        }
      }
    }
  }
  // Place each wanted building at the first free spot in an outward ring search,
  // the way a player works around terrain.
  const wants = ['kitchen', 'house', 'house', 'hall'];
  for (const def of wants) {
    outer: for (let r = 4; r < 26; r++) {
      for (let y = cy - r; y <= cy + r; y += 2) {
        for (let x = cx - r; x <= cx + r; x += 2) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
          if (sim.canPlace(def, x, y)) {
            sim.placeBuilding(def, x, y);
            break outer;
          }
        }
      }
    }
  }
}

const results: RunResult[] = [];
for (let i = 0; i < runs; i++) {
  const seed = 1000 + i;
  const sim = new Simulation(seed);
  autoPlay(sim);
  for (let d = 0; d < days; d++) {
    for (let t = 0; t < ticksPerDay; t++) sim.tick();
    if (sim.gameOver) break;
  }
  results.push({
    seed,
    pop: sim.settlers.length,
    dead: sim.gameOver,
    avgMood: Math.round(sim.avgMood()),
    meals: sim.stock.meal,
    grain: sim.stock.grain,
    wood: sim.stock.wood,
  });
}

console.log(`CENTURIA headless harness — ${runs} colonies × ${days} days (auto-player)`);
console.table(results);
const survived = results.filter((r) => !r.dead).length;
const avgPop = results.reduce((s, r) => s + r.pop, 0) / runs;
const avgMood = results.reduce((s, r) => s + r.avgMood, 0) / runs;
console.log(`survival ${survived}/${runs} · avg pop ${avgPop.toFixed(1)} · avg mood ${avgMood.toFixed(0)}`);

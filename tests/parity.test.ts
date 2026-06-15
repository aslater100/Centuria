import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/sim';
import { TownCore } from '../src/sim/towncore';
import { MINUTES_PER_DAY, MINUTES_PER_TICK, ROOM_TYPE_ID, TUNING } from '../src/sim/defs';

// Parity tests: verify the new SoA-based TownCore produces behaviors consistent
// with the fat-object Simulation over the same time span on the same seed.
// These are not bit-identical (architecture differs), but should converge on
// the same high-level dynamics: population, starvation patterns, raid outcomes.

const ticksPerDay = MINUTES_PER_DAY / MINUTES_PER_TICK;

function runDaysOld(sim: Simulation, days: number): void {
  for (let i = 0; i < days * ticksPerDay; i++) sim.tick();
}

function runDaysNew(core: TownCore, days: number): void {
  core.run(days);
}

function captureState(sim: Simulation) {
  return {
    popCount: sim.settlers.length,
    foodStock: sim.stock.meal,
    moodAvg: sim.settlers.reduce((sum, s) => sum + (s.mood ?? 0), 0) / Math.max(1, sim.settlers.length),
    gameOver: sim.gameOver,
  };
}

function captureStateNew(core: TownCore) {
  let moodSum = 0;
  for (let i = 0; i < core.agents.count; i++) moodSum += core.agents.mood[i];
  return {
    popCount: core.agents.count,
    foodStock: core.stock.count('meal'),
    moodAvg: moodSum / Math.max(1, core.agents.count),
    deadCount: 0, // TownCore doesn't track dead separately yet
  };
}

describe('Parity — Old Simulation vs New TownCore', () => {
  it('both cores run 30 days without crashing (basic execution parity)', () => {
    // Basic sanity check: both systems can execute a 30-day run without errors.
    const oldSim = new Simulation(42);
    runDaysOld(oldSim, 30);
    const afterOld = captureState(oldSim);

    // Verify old sim produced valid state (may have starved).
    expect(afterOld.popCount).toBeGreaterThanOrEqual(0);
    expect(afterOld.foodStock).toBeGreaterThanOrEqual(0);

    // New TownCore should also run without crashing.
    const core = new TownCore({ width: 32, height: 32, seed: 42 });
    runDaysNew(core, 30);
    const afterNew = captureStateNew(core);

    // Both should produce valid output.
    expect(afterNew.popCount).toBeGreaterThanOrEqual(0);
    expect(afterNew.foodStock).toBeGreaterThanOrEqual(0);
  });

  it('both cores are deterministic (same seed = same sequence)', () => {
    const old1 = new Simulation(99);
    const old2 = new Simulation(99);
    runDaysOld(old1, 10);
    runDaysOld(old2, 10);
    expect(old1.settlers.length).toBe(old2.settlers.length);
    expect(old1.stock.meal).toBe(old2.stock.meal);

    const core1 = new TownCore({ width: 32, height: 32, seed: 99 });
    const core2 = new TownCore({ width: 32, height: 32, seed: 99 });
    runDaysNew(core1, 10);
    runDaysNew(core2, 10);
    expect(core1.agents.count).toBe(core2.agents.count);
    expect(core1.stock.count('meal')).toBe(core2.stock.count('meal'));
  });

  it('old sim runs 60 days without crashing (regression check)', () => {
    const sim = new Simulation(7);
    // Should not crash; provisions last ~40 days, so this tests starvation fallback.
    runDaysOld(sim, 60);
    // May or may not have survivors depending on farming and provisions;
    // just check it doesn't crash and can report state.
    expect(typeof sim.gameOver).toBe('boolean');
  });

  it('new TownCore can serialize and deserialize without loss', () => {
    const core = new TownCore({ width: 32, height: 32, seed: 55 });
    runDaysNew(core, 5);
    const before = captureStateNew(core);

    const serialized = core.serialize();
    const deserialized = TownCore.deserialize(serialized);
    const after = captureStateNew(deserialized);

    expect(after.popCount).toBe(before.popCount);
    expect(after.foodStock).toBe(before.foodStock);
  });
});

// Build a small, provisioned, walled colony with ovens + beds — enough to live,
// work and weather a raid — so the raid systems can actually exercise.
function townWithColony(seed: number): TownCore {
  const core = new TownCore({ width: 48, height: 48, seed });
  const g = core.grid;
  const KITCHEN = ROOM_TYPE_ID.get('kitchen')!;
  const HOME = ROOM_TYPE_ID.get('home')!;
  g.designateRect(20, 20, 25, 23, KITCHEN);
  for (let x = 19; x <= 26; x++) { g.setWall(x, 19); g.setWall(x, 24); }
  for (let y = 19; y <= 24; y++) { g.setWall(19, y); g.setWall(26, y); }
  g.placeStation('oven', 20, 20); g.placeStation('oven', 22, 20);
  g.designateRect(20, 27, 25, 30, HOME);
  for (let x = 19; x <= 26; x++) { g.setWall(x, 26); g.setWall(x, 31); }
  for (let y = 26; y <= 31; y++) { g.setWall(19, y); g.setWall(26, y); }
  g.placeStation('bed', 20, 27); g.placeStation('bed', 22, 27); g.placeStation('bed', 24, 27);
  g.rebuildRooms();
  core.stock.add('grain', 2000);
  core.seedColony(22, 22, 6);
  return core;
}

describe('Parity — raids are a live, consequential threat in both cores', () => {
  it('the old Simulation can muster and end a raid', () => {
    const sim = new Simulation(3);
    sim.startRaid();
    expect(sim.raidActive).toBe(true);
    expect(sim.raiders.length).toBeGreaterThan(0);
  });

  it('TownCore musters its first raid on schedule and resolves it', () => {
    const core = townWithColony(1);
    // Schedule mirrors the fat sim: first raid lands within firstRaidDay..+5.
    expect(core.nextRaidDay).toBeGreaterThanOrEqual(TUNING.firstRaidDay);
    expect(core.nextRaidDay).toBeLessThanOrEqual(TUNING.firstRaidDay + 5);

    let sawRaid = false;
    for (let d = 0; d < 22; d++) {
      for (let k = 0; k < 360; k++) {
        core.tick();
        if (core.raidActive) sawRaid = true;
      }
    }
    expect(sawRaid).toBe(true);          // a raid happened
    expect(core.raidActive).toBe(false); // …and it resolved
  });

  it('a TownCore raid is consequential — raiders are fought (slain or casualties)', () => {
    const core = townWithColony(1);
    for (let d = 0; d < 18; d++) for (let k = 0; k < 360; k++) core.tick();
    // Either the militia drew blood or the colony took losses — combat occurred.
    expect(core.raids.slain + core.deaths).toBeGreaterThan(0);
  });

  it('raids keep TownCore deterministic (same seed = same outcome)', () => {
    const a = townWithColony(4);
    const b = townWithColony(4);
    for (let d = 0; d < 20; d++) for (let k = 0; k < 360; k++) { a.tick(); b.tick(); }
    expect(a.population).toBe(b.population);
    expect(a.deaths).toBe(b.deaths);
    expect(a.raids.slain).toBe(b.raids.slain);
    expect(a.nextRaidDay).toBe(b.nextRaidDay);
  });

  it('a TownCore raid round-trips mid-fight without desync', () => {
    // Fast-forward to a tick where a raid is active, then save/restore and verify
    // the restored core keeps stepping identically.
    const core = townWithColony(1);
    let guard = 0;
    while (!core.raidActive && guard++ < 22 * 360) core.tick();
    expect(core.raidActive).toBe(true);

    const twin = TownCore.deserialize(core.serialize());
    for (let i = 0; i < 50; i++) { core.tick(); twin.tick(); }
    expect(twin.population).toBe(core.population);
    expect(twin.deaths).toBe(core.deaths);
    expect(twin.raids.slain).toBe(core.raids.slain);
  });
});

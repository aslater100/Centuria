import { describe, expect, it } from 'vitest';
import { RaidForce, raidSize, settlerMeleeDamagePerHour } from '../src/sim/raid';
import { AgentStore } from '../src/sim/agents';
import { BuildGrid } from '../src/sim/build';
import { Rng } from '../src/sim/rng';
import { TUNING } from '../src/sim/defs';

// Stand up a colony of `n` settlers (each given craft `skill`) clustered at the
// map centre, optionally ringed by a palisade. Returns the store + grid.
function colony(n: number, skill: number, walled: boolean): { agents: AgentStore; grid: BuildGrid } {
  const agents = new AgentStore(64);
  for (let i = 0; i < n; i++) {
    const k = agents.spawn(48 + (i % 3), 48 + ((i / 3) | 0));
    agents.skill[k] = skill;
  }
  const grid = new BuildGrid(96, 96);
  if (walled) {
    for (let x = 43; x <= 54; x++) { grid.setWall(x, 43); grid.setWall(x, 54); }
    for (let y = 43; y <= 54; y++) { grid.setWall(43, y); grid.setWall(54, y); }
  }
  return { agents, grid };
}

// Run one raid to completion, swap-removing the slain like TownCore's death pass.
function fight(agents: AgentStore, grid: BuildGrid, raiders: number, seed: number): { survivors: number; slain: number; ticks: number } {
  const force = new RaidForce();
  force.start(raiders, grid.width, grid.height, new Rng(seed), 0);
  let t = 0;
  while (force.active && t < 1000) {
    force.tick(grid, agents, t);
    for (let i = agents.count - 1; i >= 0; i--) if (agents.health[i] <= 0) agents.remove(i);
    t++;
  }
  return { survivors: agents.count, slain: force.slain, ticks: t };
}

describe('raidSize — threat scales with wealth, time and population', () => {
  it('a tiny, poor, early colony faces a single raider', () => {
    expect(raidSize(0, 0, 1)).toBe(1);
  });

  it('never exceeds the hard cap no matter how rich/late', () => {
    expect(raidSize(1e9, 9999, 999)).toBe(TUNING.raidMaxRaiders);
  });

  it('a small colony caps the raid by its own population', () => {
    // byPop = ceil(pop * raidPopFactor) bounds the band even for a rich, late town.
    expect(raidSize(1e9, 9999, 4)).toBe(Math.ceil(4 * TUNING.raidPopFactor));
  });

  it('grows with wealth', () => {
    expect(raidSize(4000, 30, 50)).toBeGreaterThan(raidSize(0, 30, 50));
  });
});

describe('RaidForce — combat resolution', () => {
  it('a raid always resolves (attackers die or flee)', () => {
    const { agents, grid } = colony(6, 3, false);
    const { ticks } = fight(agents, grid, 4, 1);
    expect(ticks).toBeLessThan(1000); // force.active cleared before the guard
  });

  it('an outnumbered open colony takes casualties', () => {
    const { agents, grid } = colony(3, 1, false);
    const before = agents.count;
    const { survivors } = fight(agents, grid, 9, 2);
    expect(survivors).toBeLessThan(before);
  });

  it('a defended colony slays raiders', () => {
    const { agents, grid } = colony(6, 3, false);
    const { slain } = fight(agents, grid, 4, 3);
    expect(slain).toBeGreaterThan(0);
  });

  it('walls reduce casualties when outnumbered', () => {
    // Aggregate over seeds: the spatial outcome varies, but a palisade should
    // never make things worse and clearly helps in the long run.
    let openSurvivors = 0, walledSurvivors = 0;
    for (let s = 1; s <= 8; s++) {
      openSurvivors += fight(...colonyArgs(3, 1, false), 9, s).survivors;
      walledSurvivors += fight(...colonyArgs(3, 1, true), 9, s).survivors;
    }
    expect(walledSurvivors).toBeGreaterThan(openSurvivors);
  });

  it('is deterministic — same seed, same outcome', () => {
    const a = fight(...colonyArgs(4, 2, false), 5, 7);
    const b = fight(...colonyArgs(4, 2, false), 5, 7);
    expect(a).toEqual(b);
  });
});

describe('RaidForce — serialization', () => {
  it('round-trips an in-progress raid and continues identically', () => {
    const mk = () => {
      const { agents, grid } = colony(5, 2, false);
      const force = new RaidForce();
      force.start(4, grid.width, grid.height, new Rng(11), 0);
      // advance into the fight so there's live state to persist
      for (let t = 0; t < 140; t++) {
        force.tick(grid, agents, t);
        for (let i = agents.count - 1; i >= 0; i--) if (agents.health[i] <= 0) agents.remove(i);
      }
      return { agents, grid, force };
    };
    const orig = mk();
    const twin = RaidForce.deserialize(orig.force.serialize());
    expect(twin.raiders.length).toBe(orig.force.raiders.length);
    expect(twin.active).toBe(orig.force.active);
    expect(twin.until).toBe(orig.force.until);
    expect(twin.raiders.map((r) => r.health)).toEqual(orig.force.raiders.map((r) => r.health));
  });
});

// Tuple helper so fight(...colonyArgs(...)) reads cleanly above.
function colonyArgs(n: number, skill: number, walled: boolean): [AgentStore, BuildGrid] {
  const { agents, grid } = colony(n, skill, walled);
  return [agents, grid];
}

describe('settlerMeleeDamagePerHour — weapons sharpen the militia', () => {
  it('a forged weapon beats a spear beats bare hands by the tuned bonus', () => {
    const a = new AgentStore(4);
    const i = a.spawn(0, 0);
    a.skill[i] = 3;
    a.armed[i] = 0; const bare = settlerMeleeDamagePerHour(a, i);
    a.armed[i] = 1; const spear = settlerMeleeDamagePerHour(a, i);
    a.armed[i] = 2; const forged = settlerMeleeDamagePerHour(a, i);
    expect(spear - bare).toBeCloseTo(TUNING.spearDamageBonus);
    expect(forged - bare).toBeCloseTo(TUNING.forgedWeaponBonus);
    expect(forged).toBeGreaterThan(spear);
  });

  it('armed defenders slay at least as many raiders, usually more', () => {
    // Aggregate over seeds: the spatial outcome varies, but forged weapons should
    // never make the militia worse and clearly help over the long run.
    // A small, outnumbered colony so the baseline leaves raiders standing (an
    // already-victorious militia would saturate at the raider count and hide the buff).
    let bareSlain = 0, armedSlain = 0;
    for (let s = 1; s <= 8; s++) {
      bareSlain += fight(...colonyArgs(3, 1, false), 12, s).slain;
      const { agents, grid } = colony(3, 1, false);
      for (let i = 0; i < agents.count; i++) agents.armed[i] = 2; // forged
      armedSlain += fight(agents, grid, 12, s).slain;
    }
    expect(armedSlain).toBeGreaterThan(bareSlain);
  });
});

describe('spike traps — a one-shot bite on contact', () => {
  it('a trap fires exactly once, then is consumed', () => {
    const g = new BuildGrid(10, 10);
    g.setTrap(5, 5);
    expect(g.hasTrap(5, 5)).toBe(true);
    expect(g.tripTrap(5, 5)).toBe(true);  // fires
    expect(g.hasTrap(5, 5)).toBe(false);  // consumed
    expect(g.tripTrap(5, 5)).toBe(false); // nothing left to trip
  });

  it('survives a serialize round-trip', () => {
    const g = new BuildGrid(16, 16);
    g.setTrap(3, 4);
    g.setTrap(10, 11);
    const twin = BuildGrid.deserialize(g.serialize());
    expect(twin.hasTrap(3, 4)).toBe(true);
    expect(twin.hasTrap(10, 11)).toBe(true);
    expect(twin.hasTrap(0, 0)).toBe(false);
  });

  it('a mined approach bloodies the raiders crossing it', () => {
    // Same colony and raid, but mine the interior the raiders must cross. The
    // one-shot bites should raise raider casualties over an unmined field.
    // A weak, outnumbered colony so the bare baseline can't kill the whole band —
    // the mined approach should then visibly raise the body count.
    let bareSlain = 0, trappedSlain = 0;
    for (let s = 1; s <= 8; s++) {
      bareSlain += fight(...colonyArgs(2, 0, false), 10, s).slain;
      const { agents, grid } = colony(2, 0, false);
      for (let y = 20; y < 76; y++) for (let x = 20; x < 76; x++) grid.setTrap(x, y);
      trappedSlain += fight(agents, grid, 10, s).slain;
    }
    expect(trappedSlain).toBeGreaterThan(bareSlain);
  });
});

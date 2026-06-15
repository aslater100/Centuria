import { describe, expect, it } from 'vitest';
import { WolfPack } from '../src/sim/wolves';
import { AgentStore, AState } from '../src/sim/agents';
import { Rng } from '../src/sim/rng';
import { TownCore } from '../src/sim/towncore';
import { TUNING } from '../src/sim/defs';

const grid = (w = 96, h = 96) => ({ width: w, height: h });

describe('WolfPack — predators prowl and maul', () => {
  it('a wolf that reaches a settler bites it (open wound + bleeding)', () => {
    const a = new AgentStore(8);
    const s = a.spawn(48, 48);
    a.skill[s] = 0; // unskilled → the wolf survives the bite-back and keeps gnawing
    const pack = new WolfPack();
    pack.start(1, 96, 96, new Rng(1), 0);
    // Drop the wolf right on top of the settler so it bites on the first tick.
    pack.wolves[0].x = 48.5;
    pack.wolves[0].y = 48;
    pack.tick(grid(), a, 0, new Rng(0));
    expect(a.woundUntreated[s]).toBe(1);
    expect(a.health[s]).toBeLessThan(100);
  });

  it('the bitten fight back — a wolf mauling an awake settler takes damage', () => {
    const a = new AgentStore(8);
    const s = a.spawn(48, 48);
    a.skill[s] = 5;
    a.state[s] = AState.Idle;
    const pack = new WolfPack();
    pack.start(1, 96, 96, new Rng(2), 0);
    pack.wolves[0].x = 48.5;
    pack.wolves[0].y = 48;
    const h0 = pack.wolves[0].health;
    pack.tick(grid(), a, 0, new Rng(0));
    expect(pack.wolves[0].health).toBeLessThan(h0);
  });

  it('a sleeping settler cannot fight back', () => {
    const a = new AgentStore(8);
    const s = a.spawn(48, 48);
    a.skill[s] = 5;
    a.state[s] = AState.Sleeping;
    const pack = new WolfPack();
    pack.start(1, 96, 96, new Rng(2), 0);
    pack.wolves[0].x = 48.5;
    pack.wolves[0].y = 48;
    const h0 = pack.wolves[0].health;
    pack.tick(grid(), a, 0, new Rng(0));
    expect(pack.wolves[0].health).toBe(h0); // no bite-back while asleep
  });

  it('a pack always resolves (mauled or overstays → gone)', () => {
    const a = new AgentStore(8);
    for (let i = 0; i < 4; i++) { const k = a.spawn(48 + (i % 2), 48 + ((i / 2) | 0)); a.skill[k] = 4; }
    const pack = new WolfPack();
    pack.start(3, 96, 96, new Rng(3), 0);
    let t = 0;
    while (pack.active && t < 6000) {
      pack.tick(grid(), a, t, new Rng(1000 + t));
      for (let i = a.count - 1; i >= 0; i--) if (a.health[i] <= 0) a.remove(i);
      t++;
    }
    expect(pack.active).toBe(false);
  });

  it('is deterministic and round-trips mid-prowl', () => {
    const mk = (seed: number) => {
      const a = new AgentStore(8);
      const k = a.spawn(48, 48); a.skill[k] = 3;
      const p = new WolfPack();
      p.start(2, 96, 96, new Rng(seed), 0);
      for (let t = 0; t < 50; t++) p.tick(grid(), a, t, new Rng(seed + t));
      return p;
    };
    const p1 = mk(7), p2 = mk(7);
    expect(p1.wolves.map((w) => w.health)).toEqual(p2.wolves.map((w) => w.health));
    expect(p1.wolves.map((w) => w.x)).toEqual(p2.wolves.map((w) => w.x));

    const twin = WolfPack.deserialize(p1.serialize());
    expect(twin.wolves.length).toBe(p1.wolves.length);
    expect(twin.until).toBe(p1.until);
    expect(twin.wolves.map((w) => w.x)).toEqual(p1.wolves.map((w) => w.x));
  });
});

describe('TownCore — wolf scheduling', () => {
  it('summonWolves looses a pack the tick loop eventually resolves', () => {
    const core = new TownCore({ width: 64, height: 64, seed: 5 });
    core.seedColony(32, 32, 5);
    core.summonWolves(3);
    expect(core.wolves.active).toBe(true);
    core.run(3000);
    expect(core.wolves.active).toBe(false); // resolved without stalling the loop
  });

  it('a wolf pack round-trips through a TownCore save', () => {
    const core = new TownCore({ width: 64, height: 64, seed: 9 });
    core.seedColony(32, 32, 4);
    core.summonWolves(2);
    core.run(20);
    const twin = TownCore.deserialize(core.serialize());
    expect(twin.wolves.active).toBe(core.wolves.active);
    expect(twin.wolves.wolves.length).toBe(core.wolves.wolves.length);
    // Continue both: the restored pack tracks the original tick-for-tick.
    core.run(40);
    twin.run(40);
    expect(JSON.stringify(twin.serialize())).toBe(JSON.stringify(core.serialize()));
  });
});

describe('TownCore — the militia arms from the stores when raided', () => {
  it('draws forged weapons first, then improvised spears, then bare hands', () => {
    const core = new TownCore({ width: 64, height: 64, seed: 1 });
    core.seedColony(32, 32, 4);
    core.stock.add('weapons', 2);          // enough forged arms for two
    core.stock.add('wood', 100);           // plenty of wood for spears
    core.musterRaid();
    let forged = 0, spear = 0, bare = 0;
    for (let i = 0; i < core.agents.count; i++) {
      const arm = core.agents.armed[i];
      if (arm === 2) forged++; else if (arm === 1) spear++; else bare++;
    }
    expect(forged).toBe(2);                 // both forged weapons issued
    expect(spear).toBe(2);                  // the rest whittle spears
    expect(bare).toBe(0);
    expect(core.stock.count('weapons')).toBe(0);                       // forged arms drawn down
    expect(core.stock.count('wood')).toBe(100 - 2 * TUNING.spearWoodCost); // wood spent on spears
  });
});

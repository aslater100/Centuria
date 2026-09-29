import { describe, expect, it } from 'vitest';
import {
  createTerritory, settleTerritory, advanceTerritory, makeSnapshot, expandHistory,
  serializeTerritory, deserializeTerritory, UNCLAIMED, type InfluenceSource,
} from '../src/sim/territory';
import { RegionSim, REGION_MINUTES_PER_TICK } from '../src/sim/region';
import { MINUTES_PER_DAY } from '../src/sim/defs';

const N = 40;
const land = () => createTerritory(N, () => false);
const src = (x: number, y: number, fid: number, radius = 10, strength = 1): InfluenceSource => ({ x, y, fid, radius, strength });
const ownerAt = (t: ReturnType<typeof land>, x: number, y: number) => t.owner[x * N + y];

describe('Living borders (Centuria 2.0 §G)', () => {
  it('unclaimed land is settled instantly by the strongest influence', () => {
    const t = land();
    settleTerritory(t, [src(10, 20, 1), src(30, 20, 2)]);
    expect(ownerAt(t, 12, 20)).toBe(1);
    expect(ownerAt(t, 28, 20)).toBe(2);
    expect(ownerAt(t, 0, 0)).toBe(UNCLAIMED);
  });

  it('a held frontier does not flip on a marginal edge (hysteresis)', () => {
    const t = land();
    settleTerritory(t, [src(10, 20, 1), src(30, 20, 2)]);
    const before = t.owner.slice();
    const nudged = [src(10, 20, 1), src(30, 20, 2, 10.5)];
    for (let m = 0; m < 24; m++) advanceTerritory(t, nudged);
    let flips = 0;
    for (let i = 0; i < before.length; i++) if (before[i] !== t.owner[i] && before[i] >= 0) flips++;
    expect(flips).toBe(0);
  });

  it('a clearly stronger neighbour erodes the frontier over months, not at once', () => {
    const t = land();
    settleTerritory(t, [src(10, 20, 1), src(30, 20, 2)]);
    const strong = [src(10, 20, 1), src(30, 20, 2, 16)];
    const first = advanceTerritory(t, strong).reduce((s, x) => s + x.cells, 0);
    let total = first;
    for (let m = 0; m < 12; m++) total += advanceTerritory(t, strong).reduce((s, x) => s + x.cells, 0);
    expect(total).toBeGreaterThan(first);
    expect(ownerAt(t, 18, 20)).toBe(2);
    expect(ownerAt(t, 10, 20)).toBe(1); // the town core never falls to pressure alone
  });

  it('abandoned land decays back to unclaimed', () => {
    const t = land();
    settleTerritory(t, [src(10, 20, 1)]);
    for (let m = 0; m < 12; m++) advanceTerritory(t, []);
    expect(ownerAt(t, 10, 20)).toBe(UNCLAIMED);
  });

  it('serialization and yearly snapshots round-trip', () => {
    const t = land();
    settleTerritory(t, [src(10, 20, 1), src(30, 20, 2)]);
    const s0 = makeSnapshot(1920, t.owner, null);
    const prev = t.owner.slice();
    for (let m = 0; m < 6; m++) advanceTerritory(t, [src(10, 20, 1), src(30, 20, 2, 16)]);
    const s1 = makeSnapshot(1921, t.owner, prev);
    const hist = expandHistory([s0, s1], N * N);
    expect(Array.from(hist[1].owner)).toEqual(Array.from(t.owner));
    const back = deserializeTerritory(serializeTerritory(t));
    expect(Array.from(back.owner)).toEqual(Array.from(t.owner));
    expect(Array.from(back.control)).toEqual(Array.from(t.control));
  });

  it('the sim keeps borders across a save and records yearly history', () => {
    const r = RegionSim.create(3);
    const ticks = Math.round((400 * MINUTES_PER_DAY) / REGION_MINUTES_PER_TICK);
    for (let i = 0; i < ticks; i++) r.tick();
    expect(r.territoryHistory.length).toBeGreaterThan(0);
    const g = r.computeTerritoryGrid();
    const back = RegionSim.deserialize(r.serialize());
    expect(Array.from(back.computeTerritoryGrid().grid)).toEqual(Array.from(g.grid));
  });

  it('claimed cells stick to the claimant', () => {
    const r = RegionSim.create(3);
    r.stateProclaimed = true;
    r.treasury = 1000;
    const g = r.computeTerritoryGrid();
    const n = Math.sqrt(g.grid.length);
    let target: [number, number] | null = null;
    for (let x = 1; x < n - 1 && !target; x++) for (let y = 1; y < n - 1 && !target; y++) {
      if (r.canClaimCell(x, y).ok) target = [x, y];
    }
    expect(target).not.toBeNull();
    const [x, y] = target!;
    expect(r.claimCell(x, y)).toBe(true);
    expect(r.computeTerritoryGrid().grid[x * n + y]).toBe(r.playerFactionId);
  });
});

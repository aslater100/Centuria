import { describe, expect, it } from 'vitest';
import { RegionSim, GREAT_POWERS_AT_START, MIN_SETTLEMENT_SPACING } from '../src/sim/region';
import { REGION_N, WORLD_SCALE, CELL_SCALE } from '../src/sim/worldgen';

function homeLandmass(r: RegionSim): number {
  const h = r.settlements[0];
  const c = r.map.coordToCell(h.x, h.y);
  return r.map.landmassAt(c.x, c.y);
}

describe('One world map (Centuria 2.0 phase 7)', () => {
  it('the world is 256² with per-hex tuning preserved', () => {
    expect(REGION_N).toBe(256);
    expect(WORLD_SCALE).toBe(0.5);
    expect(CELL_SCALE).toBe(2);
    expect(MIN_SETTLEMENT_SPACING).toBe(4);
  });

  it('the heartland is ringed by other continents', () => {
    const r = RegionSim.create(11);
    expect(r.map.continentCount(200)).toBeGreaterThanOrEqual(4);
    expect(r.map.foreignCapitalSites().length).toBeGreaterThanOrEqual(3);
  });

  it('great powers stand on the map in 1919, each on its own continent with real towns', () => {
    for (const seed of [3, 11, 42]) {
      const r = RegionSim.create(seed);
      expect(r.rivals.length).toBe(GREAT_POWERS_AT_START);
      const home = homeLandmass(r);
      const continents = new Set<number>();
      for (const rv of r.rivals) {
        const f = r.faction(rv.factionId!);
        expect(f?.rivalId).toBe(rv.id);
        expect(f?.name).toBe(rv.name);
        expect(f!.settlementIds.length).toBeGreaterThanOrEqual(2);
        expect(rv.continentId).not.toBe(home);
        continents.add(rv.continentId!);
        const cap = r.settlement(f!.capital)!;
        expect(r.map.landmassAt(r.map.coordToCell(cap.x, cap.y).x, r.map.coordToCell(cap.x, cap.y).y)).toBe(rv.continentId);
      }
      expect(continents.size).toBe(r.rivals.length);
    }
  });

  it('great-power towns are not counted as the region', () => {
    const r = RegionSim.create(3);
    const local = r.settlements.filter((t) => !r.isPowerTown(t)).reduce((s, t) => s + r.popOf(t), 0);
    expect(r.totalPop()).toBe(Math.round(local));
  });

  it('occupation takes a real town and a lost war hands it back', () => {
    const r = RegionSim.create(3);
    r.stateProclaimed = true;
    r.nationProclaimed = true;
    const rv = r.rivals[0];
    const before = r.faction(rv.factionId!)!.settlementIds.length;
    r.startPlayerWar(rv, 'border_dispute', false);
    const w = r.playerWar!;
    const town = r.frontierTownOf(rv)!;
    r.transferSettlement(town, r.playerFactionId, 20);
    w.occupiedTowns = [town.id];
    w.occupied = 1;
    expect(town.factionId).toBe(r.playerFactionId);
    expect(r.faction(rv.factionId!)!.settlementIds.length).toBe(before - 1);
    r.capitulate();
    expect(town.factionId).toBe(rv.factionId);
  });

  it('a border_province peace cedes a real town', () => {
    const r = RegionSim.create(3);
    r.stateProclaimed = true;
    r.nationProclaimed = true;
    const rv = r.rivals[0];
    r.startPlayerWar(rv, 'border_dispute', false);
    r.playerWar!.score = 100;
    const target = r.frontierTownOf(rv)!;
    r.transferSettlement(target, r.playerFactionId, 20);
    r.playerWar!.occupiedTowns = [target.id];
    r.playerWar!.occupied = 1;
    r.offerPeaceBasket(['border_province']);
    expect(r.playerWar).toBeNull();
    expect(target.factionId).toBe(r.playerFactionId);
  });

  it('powers grow no faster than the legacy drift', () => {
    const r = RegionSim.create(3);
    const p0 = r.rivals.map((rv) => rv.pop);
    for (let i = 0; i < 48 * 60 * 3; i++) r.tick();
    r.rivals.slice(0, p0.length).forEach((rv, i) => expect(rv.pop).toBeLessThanOrEqual(p0[i] * Math.pow(1.0015, 40) + 1));
  });
});

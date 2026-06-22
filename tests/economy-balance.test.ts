import { describe, expect, it } from 'vitest';
import { RegionSim } from '../src/sim/region';
import { START_YEAR } from '../src/sim/defs';

function nation(seed: number): RegionSim {
  const r = RegionSim.create(seed);
  r.stateProclaimed = true;
  r.nationProclaimed = true;
  r.govType = 'republic';
  r.legitimacy = 60;
  r.activePolicies = [];
  r.treasury = 1000;
  r.passedLaws.add('income_tax');
  return r;
}

function runToYear(r: RegionSim, year: number): void {
  while (r.year < year) {
    if (!r.activeResearch) {
      const avail = r.availableToResearch();
      if (avail.length) r.startResearch(avail[0].id);
    }
    // An engaged player keeps services funded.
    if (r.servicesLevel < 1) r.servicesLevel = 1;
    r.tick();
  }
}

describe('HUD aggregates', () => {
  it('playerPop sums only the player\'s settlements', () => {
    const r = RegionSim.create(7);
    const byHand = r.settlements
      .filter((t) => t.factionId === r.playerFactionId)
      .reduce((s, t) => s + r.popOf(t), 0);
    expect(r.playerPop()).toBe(Math.round(byHand));
    expect(r.playerPop()).toBeGreaterThan(0);
  });

  it('avgSatisfaction is a pop-weighted mean in 0..100', () => {
    const r = RegionSim.create(7);
    const a = r.avgSatisfaction();
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(100);
    // Pushing every settlement to a known satisfaction makes the mean that value.
    for (const t of r.settlements) {
      if (t.factionId === r.playerFactionId) t.satisfaction = 73;
    }
    expect(Math.round(r.avgSatisfaction())).toBe(73);
  });
});

describe('Central bank gating', () => {
  it('the Central Banking civic alone establishes a central bank', () => {
    const r = RegionSim.create(7);
    expect(r.hasCentralBank()).toBe(false);
    r.researched.add('central_banking');
    expect(r.hasCentralBank()).toBe(true);
  });

  it('the Central Bank Charter law alone also establishes one', () => {
    const r = RegionSim.create(7);
    expect(r.hasCentralBank()).toBe(false);
    r.passedLaws.add('central_bank_charter');
    expect(r.hasCentralBank()).toBe(true);
  });
});

describe('Development-scaled costs', () => {
  it('flat costs equal their base when the economy is undeveloped (devFactor 1)', () => {
    const r = RegionSim.create(7); // fresh: gdpLastMonth 0 → devFactor 1
    expect(r.devFactor()).toBe(1);
    expect(r.scoutCost()).toBe(RegionSim.SCOUT_BASE_COST);
    expect(r.militiaCost()).toBe(RegionSim.MILITIA_COST);
    expect(r.flatCost(100)).toBe(100);
  });

  it('flat costs rise with development', () => {
    const r = nation(7);
    runToYear(r, START_YEAR + 60); // economy has grown; devFactor > 1
    expect(r.devFactor()).toBeGreaterThan(1);
    expect(r.militiaCost()).toBeGreaterThan(RegionSim.MILITIA_COST);
    expect(r.scoutCost()).toBeGreaterThan(RegionSim.SCOUT_BASE_COST);
  });
});

describe('Treasury stays bounded (no runaway surplus)', () => {
  it('keeps the treasury within a few months of GDP across a century', () => {
    const r = nation(1000);
    runToYear(r, 2030);
    // Before the budget rebalance the treasury ran to ~7 months of GDP and kept
    // climbing; a developed state should now hold only a modest reserve.
    const monthlyGdp = Math.max(1, r.gdpLastMonth);
    expect(r.treasury).toBeLessThan(monthlyGdp * 4);
    // …and the nation is still a going concern (no deficit death-spiral).
    expect(r.totalPop()).toBeGreaterThan(2000);
  });
});

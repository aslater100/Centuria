import { describe, expect, it } from 'vitest';
import { RegionSim } from '../src/sim/region';
import { advanceAutoplayStatehood } from '../src/sim/systems/rival-ai';

/**
 * Autoplay statehood/governance director (systems/rival-ai.ts). The human drives
 * incorporation, research and law-making by hand; the headless sweep player had no
 * such director, so it grew to a multi-town COLONY that never proclaimed statehood,
 * never researched a tech, and never chartered a central bank — leaving the whole
 * statehood / tech-gated / monetary layer (incl. the session-9/10 cost-push inflation,
 * which needs hasCentralBank()) dormant. These lock the chain that lights it up.
 */
describe('advanceAutoplayStatehood — the autoplay governance director', () => {
  it('signs the Regional Charter the moment a ceremony is pending', () => {
    const r = RegionSim.create(1000);
    expect(r.stateProclaimed).toBe(false);
    r.ceremonyPending = true; // updateCharter offers the ceremony once charterEligible sustains
    advanceAutoplayStatehood(r);
    expect(r.stateProclaimed).toBe(true);
    expect(r.ceremonyPending).toBe(false);
  });

  it('does not proclaim without a pending ceremony (respects the charter gate)', () => {
    const r = RegionSim.create(1000);
    advanceAutoplayStatehood(r); // no ceremonyPending → cannot incorporate
    expect(r.stateProclaimed).toBe(false);
  });

  it('starts research when idle, and only ever a legal (available) node', () => {
    const r = RegionSim.create(1000);
    expect(r.activeResearch).toBeNull();
    advanceAutoplayStatehood(r);
    expect(r.activeResearch).not.toBeNull();
    // Whatever it picked must be a node whose prereqs/era/requiresState are satisfied.
    expect(r.availableToResearch().some((n) => n.id === r.activeResearch)).toBe(true);
  });

  it('chartes a central bank once a state has the prereq techs and the capital', () => {
    const r = RegionSim.create(1000);
    r.stateProclaimed = true;
    r.researched.add('income_tax');
    r.researched.add('statecraft');
    r.politicalCapital = 50; // exactly the Central Bank Charter cost
    expect(r.hasCentralBank()).toBe(false);
    advanceAutoplayStatehood(r);
    expect(r.hasCentralBank()).toBe(true);
    expect(r.passedLaws.has('central_bank_charter')).toBe(true);
  });

  it('withholds the central bank while political capital is short', () => {
    const r = RegionSim.create(1000);
    r.stateProclaimed = true;
    r.researched.add('income_tax');
    r.researched.add('statecraft');
    r.politicalCapital = 49; // one short of the £50 cost
    advanceAutoplayStatehood(r);
    expect(r.hasCentralBank()).toBe(false);
  });
});

describe('autoplayStatehood flag — reachability and gating in the sweep', () => {
  const runTo = (year: number, statehood: boolean): RegionSim => {
    const r = RegionSim.create(1000);
    r.autoDevelopPlayer = true;
    r.autoExpandPlayer = true;
    r.autoplayStatehood = statehood;
    while (r.year < year && !r.gameOver) r.tick();
    return r;
  };

  it('ON: the autoplayer reaches statehood AND charters a central bank', () => {
    const r = runTo(2019, true);
    expect(r.stateProclaimed).toBe(true);
    expect(r.has('statecraft')).toBe(true);
    expect(r.has('income_tax')).toBe(true);
    expect(r.hasCentralBank()).toBe(true);
  });

  it('OFF (default): the autoplayer stays a colony with no central bank', () => {
    const r = runTo(2019, false);
    expect(r.stateProclaimed).toBe(false);
    expect(r.hasCentralBank()).toBe(false);
    // …and it never picked up a research director either (the dormant baseline).
    expect(r.has('statecraft')).toBe(false);
  });
});

describe('autoplay STATE government-consumption sink — bounds the treasury', () => {
  const advanceMonths = (r: RegionSim, n: number): void => {
    for (let i = 0; i < n; i++) {
      const d0 = r.day;
      while (r.day < d0 + 30 && !r.gameOver) r.tick();
    }
  };

  it('spends a flush autoplay state treasury back down toward a ~1.5-month reserve', () => {
    const r = RegionSim.create(1000);
    r.autoDevelopPlayer = true;
    r.autoExpandPlayer = true;
    r.autoplayStatehood = true;
    // Reach statehood + a real GDP (the probe shows seed 1000 proclaims by ~1960).
    while (r.year < 1970 && !r.gameOver) r.tick();
    expect(r.stateProclaimed).toBe(true);
    const gdpMo = r.gdpLastMonth;
    expect(gdpMo).toBeGreaterThan(0);
    // Flush the treasury to the pre-sink balloon (~40 months of GDP) and let the
    // monthly gov-consumption skim run. It should pull the hoard down to the reserve.
    r.treasury = gdpMo * 40;
    advanceMonths(r, 12);
    // Steady state is reserve + net-inflow/skim ≈ 1.5 months; allow generous slack.
    expect(r.treasury).toBeLessThan(r.gdpLastMonth * 3);
  });

  it('never fires the sink when autoplayStatehood is OFF (the byte-identity guard)', () => {
    // With the director OFF the autoplayer stays a colony and the sink's guard
    // (autoplayStatehood && stateProclaimed) is false on both counts, so a flush
    // treasury is left alone — this is what keeps live human play byte-identical.
    const r = RegionSim.create(1000);
    r.autoDevelopPlayer = true;
    r.autoExpandPlayer = true;
    r.autoplayStatehood = false;
    while (r.year < 1970 && !r.gameOver) r.tick();
    expect(r.stateProclaimed).toBe(false);
    const gdpMo = Math.max(1, r.gdpLastMonth);
    r.treasury = gdpMo * 40;
    advanceMonths(r, 3);
    // No autoplay skim → the colony's modest economy leaves the hoard well above the
    // ~1.5-month reserve the sink would have imposed.
    expect(r.treasury).toBeGreaterThan(gdpMo * 10);
  });
});

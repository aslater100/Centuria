/**
 * §R2 — Ideology/coalition layer in elections (docs/specs/09-audit-nine.md).
 *
 * `runElection` used to score purely on `avgSat`. It now blends avgSat 50/50
 * with an estate blend (`Σ power×support / Σ power` over `r.factions`, the
 * three national estates) into `electoralApproval`, which drives political
 * capital, the LANDSLIDE/MAJORITY/MINORITY/LOST thresholds, and the
 * legitimacy bonus. No RNG is involved — the file's "no RNG" contract holds.
 */
import { describe, expect, it } from 'vitest';

import { RegionSim, type Faction } from '../src/sim/region';
import { runElection } from '../src/sim/systems/elections';

function freshSim(seed = 1): RegionSim {
  return RegionSim.create(seed, { currencySymbol: '$' });
}

function setAvgSat(r: RegionSim, sat: number): void {
  for (const t of r.settlements) t.satisfaction = sat;
}

function estates(power: number, support: number): Faction[] {
  return [
    { id: 'workers', name: 'Workers', power, support, demand: 'test' },
    { id: 'landowners', name: 'Landowners', power, support, demand: 'test' },
    { id: 'merchants', name: 'Merchants', power, support, demand: 'test' },
  ];
}

describe('§R2 electoralApproval blend', () => {
  it('falls back to avgSat alone when r.factions is empty (no RNG, deterministic)', () => {
    const r = freshSim(2);
    setAvgSat(r, 72);
    r.factions = [];
    runElection(r);
    const entry = r.log.find((l) => l.text.includes('ELECTION'));
    expect(entry).toBeDefined();
    // avgSat 72 alone -> LANDSLIDE (>=65), approval shown as 72
    expect(entry!.text).toContain('LANDSLIDE');
    expect(entry!.text).toContain('72%');
  });

  it('hostile high-power estates drag a healthy avgSat (60) below MAJORITY', () => {
    const r = freshSim(3);
    setAvgSat(r, 60);
    // Hostile estates: support ~20, high power (100) each -> estateBlend = 20
    r.factions = estates(100, 20);
    // electoralApproval = 0.5*60 + 0.5*20 = 40 -> MINORITY (35..<50), not MAJORITY
    runElection(r);
    const entry = r.log.find((l) => l.text.includes('ELECTION'));
    expect(entry).toBeDefined();
    expect(entry!.text).toContain('approval 40%');
    expect(entry!.text).toContain('MINORITY');
    expect(entry!.text).not.toContain('MAJORITY');
  });

  it('adoring high-power estates lift a weak avgSat (40) above MAJORITY', () => {
    const r = freshSim(4);
    setAvgSat(r, 40);
    // Adoring estates: support ~90, high power (100) each -> estateBlend = 90
    r.factions = estates(100, 90);
    // electoralApproval = 0.5*40 + 0.5*90 = 65 -> LANDSLIDE (>=65)
    runElection(r);
    const entry = r.log.find((l) => l.text.includes('ELECTION'));
    expect(entry).toBeDefined();
    expect(entry!.text).toContain('approval 65%');
    expect(entry!.text).toContain('LANDSLIDE');
  });

  it('political capital earned scales off the blended electoralApproval, not avgSat', () => {
    const r = freshSim(5);
    setAvgSat(r, 60);
    r.factions = estates(100, 20); // electoralApproval = 40
    r.politicalCapital = 0;
    runElection(r);
    // earned = round(20 + (40/100)*80) = round(52) = 52, not round(20+(60/100)*80)=68
    expect(r.politicalCapital).toBe(52);
  });

  it('legitimacy bonus follows the blended result for democracy/republic governments', () => {
    const r = freshSim(6);
    r.nationProclaimed = true;
    r.govType = 'democracy';
    r.legitimacy = 50;
    setAvgSat(r, 40);
    r.factions = estates(100, 90); // electoralApproval = 65 -> LANDSLIDE -> +20 legitimacy
    runElection(r);
    expect(r.legitimacy).toBe(70);
  });

  it('mixed-power estates weight the blend by power (not a flat average)', () => {
    const r = freshSim(7);
    setAvgSat(r, 50);
    // One dominant hostile estate (power 90, support 10) and two weak adoring ones
    // (power 5 each, support 100). estateBlend = (90*10 + 5*100 + 5*100) / 100 = 19
    r.factions = [
      { id: 'workers', name: 'Workers', power: 90, support: 10, demand: 'test' },
      { id: 'landowners', name: 'Landowners', power: 5, support: 100, demand: 'test' },
      { id: 'merchants', name: 'Merchants', power: 5, support: 100, demand: 'test' },
    ];
    runElection(r);
    // electoralApproval = 0.5*50 + 0.5*19 = 34.5 -> rounds to 35 in the log, but the
    // threshold check uses the unrounded value (34.5 < 35) -> LOST
    const entry = r.log.find((l) => l.text.includes('ELECTION'));
    expect(entry).toBeDefined();
    expect(entry!.text).toContain('LOST');
  });
});

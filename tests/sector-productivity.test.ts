import { describe, expect, it } from 'vitest';
import { RegionSim, SECTOR_IDS, SECTOR_TECH_CEILING } from '../src/sim/region';

/** Every tech that appears in any sector's boost table. */
const ALL_BOOST_TECHS = [
  'electrical_grid', 'combustion_engine', 'mass_production', 'green_revolution', 'renewables',
  'steel_industry', 'chemical_industry', 'atomic_age', 'automated_logistics',
  'free_press', 'labor_law', 'aviation', 'asphalt', 'smart_grid', 'computing',
  'telecommunications', 'internet', 'maglev',
];

describe('sector productivity calibration (the autoplay-statehood GDP-runaway guard)', () => {
  it('is exactly 1 for every sector with nothing beyond the starting techs', () => {
    const r = RegionSim.create(7);
    for (const id of SECTOR_IDS) {
      expect(r.sectorProductivity(id)).toBe(1);
    }
  });

  it('lands exactly on the documented cumulative ceiling with the FULL stack researched', () => {
    // The raw boost products had crept to ×47/×160/×114/×1200 as sessions added
    // techs, exploding autoplay-statehood GDP ~1500× by 2100. The log-normalized
    // curve must pin the full tree to the wage-calibration ceilings instead.
    const r = RegionSim.create(7);
    for (const tech of ALL_BOOST_TECHS) r.researched.add(tech);
    for (const id of SECTOR_IDS) {
      expect(r.sectorProductivity(id)).toBeCloseTo(SECTOR_TECH_CEILING[id], 6);
    }
  });

  it('never exceeds the ceiling at any partial stack, and every tech still adds output', () => {
    const r = RegionSim.create(7);
    const prev: Record<string, number> = {};
    for (const id of SECTOR_IDS) prev[id] = r.sectorProductivity(id);
    for (const tech of ALL_BOOST_TECHS) {
      r.researched.add(tech);
      for (const id of SECTOR_IDS) {
        const m = r.sectorProductivity(id);
        expect(m).toBeGreaterThanOrEqual(prev[id]); // monotone: research is never a downgrade
        expect(m).toBeLessThanOrEqual(SECTOR_TECH_CEILING[id] + 1e-9);
        prev[id] = m;
      }
    }
    // The full stack was reached, so the walk ended at the ceiling, not below it.
    for (const id of SECTOR_IDS) {
      expect(prev[id]).toBeCloseTo(SECTOR_TECH_CEILING[id], 6);
    }
  });

  it('keeps a single landmark tech meaningful but era-scaled (computing on services)', () => {
    const r = RegionSim.create(7);
    r.researched.add('computing');
    const m = r.sectorProductivity('services');
    // The office-PC leap is the largest single services boost — it must still be a
    // real jump (>2x) without singlehandedly blowing past the ~7x century ceiling.
    expect(m).toBeGreaterThan(2);
    expect(m).toBeLessThan(4);
  });
});

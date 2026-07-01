import { describe, expect, it } from 'vitest';
import {
  RegionSim,
  ARCHETYPE_GREEN_PROPENSITY,
  ARMAMENTS_WARPOWER_FLOOR,
  RIVAL_ARMS_BASE,
  RIVAL_ARMS_INDUSTRIAL,
  RIVAL_ARMS_MARKET,
  rivalArmsCapacity,
  rivalArmsCapacityCore,
  worldArmsScarcity,
  type RivalNation,
} from '../src/sim/region';
import { rivalWarWinChance } from '../src/sim/systems/diplomacy';

/**
 * RIVAL-SIDE ARMS BASE (flag `rivalClimateResponse`, default OFF → byte-identical).
 *
 * Session 14 made the PLAYER's military run on steel+chemicals; the abstract
 * rival↔rival wars still resolved on a pure pop-ratio roll. `rivalArmsCapacity`
 * is the off-map analogue: an autarkic fossil-industrial base (1 − green
 * propensity) plus world-market procurement (commerce weight) choked by world
 * steel/chemicals scarcity. `rivalWarWinChance` weights each side's population
 * by the same FLOOR + (1−FLOOR)×capacity equipment curve `warPower()` uses, so
 * who wins the abstract wars is scarcity-decided — but with the flag off both
 * capacities are exactly 1 and the legacy pop-ratio roll reproduces bit-for-bit.
 */

/** Push a synthetic off-map great power (mirrors tests/rival-climate-response.test.ts). */
function addRival(r: RegionSim, opts: {
  id: number; archetype?: RivalNation['archetype']; pop?: number; commerce?: number;
}): RivalNation {
  const rv = {
    id: opts.id,
    name: `Power ${opts.id}`,
    leader: 'the Directorate',
    archetype: opts.archetype ?? 'opportunist',
    weights: { expansion: 5, commerce: opts.commerce ?? 4.5, ideology: 5, honor: 5, risk: 5, grudge: 5 },
    regime: 'parliamentary',
    agenda: '',
    compass: 'north',
    pop: opts.pop ?? 50000,
    relations: 0,
    treaties: [],
    borderSettled: false,
    emergedYear: 1990,
    history: [],
    lastEnvoyDay: -999,
    lastGiftDay: -999,
  } as RivalNation;
  r.rivals.push(rv);
  return rv;
}

describe('rivalArmsCapacityCore (pure formula)', () => {
  it('a postureless, marketless rival still holds the base — no great power is unarmed', () => {
    expect(rivalArmsCapacityCore(0, 0, 0)).toBe(RIVAL_ARMS_BASE);
  });

  it('full industrial lean + full market access in an abundant world sums the three shares', () => {
    expect(rivalArmsCapacityCore(1, 9, 0)).toBeCloseTo(
      Math.min(1, RIVAL_ARMS_BASE + RIVAL_ARMS_INDUSTRIAL + RIVAL_ARMS_MARKET), 12);
  });

  it('total world scarcity chokes exactly the market share and nothing else', () => {
    expect(rivalArmsCapacityCore(1, 9, 1)).toBeCloseTo(RIVAL_ARMS_BASE + RIVAL_ARMS_INDUSTRIAL, 12);
    expect(rivalArmsCapacityCore(0, 9, 0) - rivalArmsCapacityCore(0, 9, 1)).toBeCloseTo(RIVAL_ARMS_MARKET, 12);
  });

  it('an autarkic industrial power is nearly scarcity-immune; a trader is not', () => {
    const hermitHit = rivalArmsCapacityCore(0.9, 1, 0) - rivalArmsCapacityCore(0.9, 1, 1);
    const traderHit = rivalArmsCapacityCore(0.0, 9, 0) - rivalArmsCapacityCore(0.0, 9, 1);
    expect(hermitHit).toBeLessThan(traderHit / 5);
  });

  it('clamps every input and the result to sane bounds', () => {
    expect(rivalArmsCapacityCore(5, 99, -3)).toBeLessThanOrEqual(1);
    expect(rivalArmsCapacityCore(-5, -9, 7)).toBe(RIVAL_ARMS_BASE);
  });
});

describe('rivalArmsCapacity (flag gating + live reads)', () => {
  it('flag OFF → exactly 1 for every rival, so the legacy peace roll is untouched', () => {
    const r = RegionSim.create(42);
    const hegemon = addRival(r, { id: 1, archetype: 'hegemon' });
    const trader = addRival(r, { id: 2, archetype: 'trading_republic' });
    expect(r.rivalClimateResponse).toBe(false);
    expect(rivalArmsCapacity(r, hegemon)).toBe(1);
    expect(rivalArmsCapacity(r, trader)).toBe(1);
  });

  it('flag ON → exact core value off archetype lean, commerce, and world scarcity', () => {
    const r = RegionSim.create(42);
    r.rivalClimateResponse = true;
    const hegemon = addRival(r, { id: 1, archetype: 'hegemon', commerce: 4 });
    const scar = worldArmsScarcity(r); // fresh sim: no unmet demand → 0
    expect(scar).toBe(0);
    const lean = 1 - ARCHETYPE_GREEN_PROPENSITY.hegemon;
    expect(rivalArmsCapacity(r, hegemon)).toBeCloseTo(rivalArmsCapacityCore(lean, 4, scar), 12);
  });
});

describe('rivalWarWinChance (the scarcity-decided peace)', () => {
  it('flag OFF → bit-for-bit the legacy pop-ratio', () => {
    const r = RegionSim.create(42);
    const a = addRival(r, { id: 1, archetype: 'hegemon', pop: 61234 });
    const b = addRival(r, { id: 2, archetype: 'trading_republic', pop: 38766 });
    expect(rivalWarWinChance(r, a, b)).toBe(a.pop / (a.pop + b.pop));
  });

  it('flag ON, equal populations → the industrial archetype now dictates more peaces', () => {
    const r = RegionSim.create(42);
    r.rivalClimateResponse = true;
    const hegemon = addRival(r, { id: 1, archetype: 'hegemon', pop: 50000, commerce: 4 });
    const trader = addRival(r, { id: 2, archetype: 'trading_republic', pop: 50000, commerce: 4 });
    expect(rivalWarWinChance(r, hegemon, trader)).toBeGreaterThan(0.5);
  });

  it('flag ON → the equipment curve floors at ARMAMENTS_WARPOWER_FLOOR, never zeroing a side', () => {
    const r = RegionSim.create(42);
    r.rivalClimateResponse = true;
    const a = addRival(r, { id: 1, archetype: 'hegemon', pop: 50000 });
    const b = addRival(r, { id: 2, archetype: 'trading_republic', pop: 50000 });
    // Worst arithmetically possible tilt at equal pop: FLOOR vs full equipment.
    const floorChance = ARMAMENTS_WARPOWER_FLOOR / (ARMAMENTS_WARPOWER_FLOOR + 1);
    const p = rivalWarWinChance(r, b, a);
    expect(p).toBeGreaterThan(floorChance);
    expect(p).toBeLessThan(0.5);
  });
});

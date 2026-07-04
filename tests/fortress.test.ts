/**
 * §FORT — Fortifications (docs/specs/10-chase-the-nines.md)
 *
 * (a) The `fortress` region building def loads, is gated on a real region-tier tech
 *     node, and its declarative `garrisonBonus` is consumed by `garrisonOf`.
 * (b) Seeded statistical trials (mirroring tests/military-battle.test.ts): a defender
 *     WITH a fortress wins a marginal 1:1 battle meaningfully more often than without.
 *     Unlike the military-battle suite (ambiguous province, rival defends), these
 *     trials run at the player's REAL founding settlement so the player defends and
 *     the fortress in `settlement.buildings` is what flips the band.
 * (c) The combined defender multiplier never exceeds BATTLE_DEFENDER_BONUS_CAP:
 *     1.10 home ground × 1.15 fort = 1.265 → clamps to 1.25.
 */

import { describe, it, expect } from 'vitest';
import { RegionSim, REGION_BUILDINGS_MAP, TECH_TREE, ProvincialArmy } from '../src/sim/region';
import {
  resolveProvinceBattle,
  battleDefenderMult,
  BATTLE_FORT_MULT,
  BATTLE_HOME_GROUND_MULT,
  BATTLE_DEFENDER_BONUS_CAP,
} from '../src/sim/systems/military';

const TRIALS = 100;

function makeRegion(seed = 42): RegionSim {
  return RegionSim.create(seed);
}

/** Same rival-injection convention as tests/military-battle.test.ts:
 *  expansion=7 → rivalBoost = 0.6 + 7*0.04 = 0.88. */
function injectRival(r: RegionSim): number {
  const sim = r as unknown as {
    rivals: Array<Record<string, unknown>>;
    nationProclaimed: boolean;
    stateProclaimed: boolean;
  };
  const id = 9001;
  sim.rivals.push({
    id, name: 'Testania', leader: 'Commander Test', archetype: 'hegemon',
    weights: { expansion: 7, commerce: 3, honor: 5, risk: 6, grudge: 3 },
    regime: 'junta', agenda: 'dominate', compass: 'east',
    pop: 80, relations: -70, treaties: [],
    borderSettled: false, emergedYear: 1920, history: [],
    lastEnvoyDay: -999, lastGiftDay: -999,
  });
  sim.nationProclaimed = true;
  sim.stateProclaimed = true;
  return id;
}

function freshProvincialArmy(ownerId: number, count: number, provinceId: number, r: RegionSim): ProvincialArmy {
  return {
    id: r.nextArmyId++,
    ownerId,
    provinceId,
    destinationId: null,
    transitDays: 0,
    units: [{ type: 'militia', count, morale: 100, suppliedDays: 90 }],
    supply: 1.0,
  };
}

/** Run TRIALS 1:1-calibrated battles at the player's home settlement and return the
 *  player's (defender's) win rate. The battle is at a REAL player-owned settlement,
 *  so the player defends: home ground applies to the player side, and the fortress
 *  (when present in `home.buildings`) is picked up by the §FORT check.
 *  Calibration: net-even without a fort — playerRaw × 1.10 = rivalRaw × 0.88,
 *  so playerCount = 100 × 0.88 / 1.10 = 80 vs rivalCount = 100. */
function defenderWinRate(withFortress: boolean, seed: number): number {
  const r = makeRegion(seed);
  const rivalId = injectRival(r);
  const home = r.settlements.find((s) => s.factionId === r.playerFactionId);
  expect(home).toBeDefined();
  if (!home) return 0;
  home.buildings = withFortress ? ['fortress'] : [];
  let playerWins = 0;
  for (let i = 0; i < TRIALS; i++) {
    r.provincialArmies = [
      freshProvincialArmy(0, 80, home.id, r),
      freshProvincialArmy(rivalId, 100, home.id, r),
    ];
    resolveProvinceBattle(r, home.id);
    const rivalPresent = r.provincialArmies.some((a) => a.ownerId === rivalId && a.provinceId === home.id);
    if (!rivalPresent) playerWins++;
  }
  return playerWins / TRIALS;
}

describe('§FORT (a) — fortress def loads and is gated on a real tech', () => {
  it('exists in region_buildings.json with the sibling field set', () => {
    const def = REGION_BUILDINGS_MAP.get('fortress');
    expect(def).toBeDefined();
    if (!def) return;
    expect(def.name).toBe('Fortress');
    expect(def.cost).toBeGreaterThan(0);
    expect(def.upkeep).toBeGreaterThan(0);
    expect(def.max).toBe(1);
    expect(def.garrisonBonus).toBeGreaterThan(0);
  });

  it('prereq is a real node in the region-tier tech tree', () => {
    const def = REGION_BUILDINGS_MAP.get('fortress');
    expect(def?.prereq).toBeTruthy();
    const node = TECH_TREE.find((n) => n.id === def?.prereq);
    expect(node).toBeDefined();
  });

  it('garrisonBonus is consumed by garrisonOf', () => {
    const r = makeRegion();
    const home = r.settlements.find((s) => s.factionId === r.playerFactionId);
    expect(home).toBeDefined();
    if (!home) return;
    const def = REGION_BUILDINGS_MAP.get('fortress');
    const before = r.garrisonOf(home);
    home.buildings.push('fortress');
    expect(r.garrisonOf(home)).toBe(before + (def?.garrisonBonus ?? 0));
  });
});

describe('§FORT (b) — fortress flips a marginal 1:1 battle band', () => {
  it('defender with a fortress wins meaningfully more often than without', () => {
    const without = defenderWinRate(false, 42);
    const withFort = defenderWinRate(true, 43);
    // 1:1 net without a fort → coin-flip band (mirrors the military-battle 35-65% band).
    expect(without).toBeGreaterThanOrEqual(0.30);
    expect(without).toBeLessThanOrEqual(0.70);
    // Fort raises defender mult 1.10 → 1.25 (round-win odds ~90/10 the defender's way).
    expect(withFort).toBeGreaterThanOrEqual(0.80);
    expect(withFort - without).toBeGreaterThanOrEqual(0.15);
  });
});

describe('§FORT (c) — defender multiplier never exceeds the cap', () => {
  it('home ground × fort clamps to BATTLE_DEFENDER_BONUS_CAP', () => {
    expect(BATTLE_HOME_GROUND_MULT * BATTLE_FORT_MULT).toBeGreaterThan(BATTLE_DEFENDER_BONUS_CAP);
    expect(battleDefenderMult(true)).toBe(BATTLE_DEFENDER_BONUS_CAP);
    expect(battleDefenderMult(false)).toBe(BATTLE_HOME_GROUND_MULT);
    expect(battleDefenderMult(true)).toBeLessThanOrEqual(BATTLE_DEFENDER_BONUS_CAP);
    expect(battleDefenderMult(false)).toBeLessThanOrEqual(BATTLE_DEFENDER_BONUS_CAP);
  });
});

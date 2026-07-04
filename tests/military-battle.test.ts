/**
 * §M1 — Multi-round battle resolution (docs/specs/09-audit-nine.md)
 *
 * resolveProvinceBattle and resolveArmyGroupBattle (src/sim/systems/military.ts) now
 * run up to 3 attrition rounds instead of a single power-ratio roll. Each round: both
 * sides' effective power is computed (morale-weighted base × home-ground/fortification
 * defender bonus × under-supply penalty), the round is won by
 * `attackerPower >= defenderPower * (0.85 + rng*0.3)`, the loser takes ×0.85 count/
 * manpower and −8 morale, the winner ×0.95 and −3 morale, and a rout (either side's
 * power below 30% of its round-1 value) ends the battle immediately with an extra
 * −10 morale for the routed side. Best-of-3 rounds decides the battle; a tie holds for
 * the defender. §FORT (docs/specs/10-chase-the-nines.md) has since activated the
 * fortification axis (`fortress` in region_buildings.json — see tests/fortress.test.ts);
 * these trials use a province with no settlement, so no fortress applies and only the
 * flat home-ground ×1.10 fires (well under the ×1.25 cap).
 *
 * These trials use a province id that matches no real settlement, so
 * `r.settlement(provinceId)` is undefined and the side ownership check is ambiguous —
 * per spec that resolves to "the rival defends (player is marching in)", which is the
 * scenario exercised below. The player-side raw power is calibrated so that, net of the
 * rival's home-ground bonus (and, for resolveProvinceBattle, its rivalBoost), the
 * opening effective-power ratio lands exactly on 1.5:1 or 1:1.
 */

import { describe, it, expect } from 'vitest';
import { RegionSim, ArmyGroup, ProvincialArmy } from '../src/sim/region';
import { resolveProvinceBattle, resolveArmyGroupBattle } from '../src/sim/systems/military';

const PROVINCE_ID = 90001; // no settlement has this id — ownership is ambiguous
const TRIALS = 100;

function makeRegion(seed = 42): RegionSim {
  return RegionSim.create(seed);
}

/** Inject a rival with expansion=7 (rivalBoost = 0.6 + 7*0.04 = 0.88), matching the
 *  other military test suites' convention (tests/phase16.test.ts, tests/war-materiel.test.ts). */
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

function freshProvincialArmy(ownerId: number, count: number, r: RegionSim): ProvincialArmy {
  return {
    id: r.nextArmyId++,
    ownerId,
    provinceId: PROVINCE_ID,
    destinationId: null,
    transitDays: 0,
    units: [{ type: 'militia', count, morale: 100, suppliedDays: 90 }],
    supply: 1.0,
  };
}

function freshArmyGroup(ownerId: number, id: number, manpower: number): ArmyGroup {
  return {
    id, ownerId, provinceId: PROVINCE_ID, transitDays: 0,
    manpower, equipmentLevel: 100, supply: 1.0, doctrine: 100, morale: 100,
  };
}

describe('resolveProvinceBattle — §M1 3-round attrition', () => {
  it('(a) stronger side (1.5:1 net effective power) wins >= 70% over 100 trials', () => {
    const r = makeRegion();
    const rivalId = injectRival(r);
    // defenderPower = rivalCount * rivalBoost(0.88) * homeGround(1.10) = rivalCount * 0.968
    // playerCount = 1.5 * 0.968 * rivalCount, rivalCount=100 -> 145
    let playerWins = 0;
    for (let i = 0; i < TRIALS; i++) {
      r.provincialArmies = [freshProvincialArmy(0, 145, r), freshProvincialArmy(rivalId, 100, r)];
      resolveProvinceBattle(r, PROVINCE_ID);
      const rivalPresent = r.provincialArmies.some((a) => a.ownerId === rivalId && a.provinceId === PROVINCE_ID);
      if (!rivalPresent) playerWins++;
    }
    expect(playerWins / TRIALS).toBeGreaterThanOrEqual(0.70);
  });

  it('(a) even sides (1:1 net effective power, defender bonus cancelled) split 35-65% over 100 trials', () => {
    const r = makeRegion();
    const rivalId = injectRival(r);
    // playerCount = 0.968 * rivalCount, rivalCount=100 -> 97
    let playerWins = 0;
    let rivalWins = 0;
    for (let i = 0; i < TRIALS; i++) {
      r.provincialArmies = [freshProvincialArmy(0, 97, r), freshProvincialArmy(rivalId, 100, r)];
      resolveProvinceBattle(r, PROVINCE_ID);
      const rivalPresent = r.provincialArmies.some((a) => a.ownerId === rivalId && a.provinceId === PROVINCE_ID);
      if (rivalPresent) rivalWins++; else playerWins++;
    }
    expect(playerWins / TRIALS).toBeGreaterThanOrEqual(0.35);
    expect(playerWins / TRIALS).toBeLessThanOrEqual(0.65);
    expect(rivalWins / TRIALS).toBeGreaterThanOrEqual(0.35);
    expect(rivalWins / TRIALS).toBeLessThanOrEqual(0.65);
  });

  it('(b) unit counts never drop below 0 or lose more than were committed', () => {
    const r = makeRegion();
    const rivalId = injectRival(r);
    for (const [playerCount, rivalCount] of [[1, 1], [2, 50], [50, 2], [3, 3], [200, 4]] as const) {
      for (let i = 0; i < 20; i++) {
        r.provincialArmies = [freshProvincialArmy(0, playerCount, r), freshProvincialArmy(rivalId, rivalCount, r)];
        const before = { player: playerCount, rival: rivalCount };
        resolveProvinceBattle(r, PROVINCE_ID);
        for (const a of r.provincialArmies) {
          const committed = a.ownerId === 0 ? before.player : before.rival;
          for (const u of a.units) {
            expect(u.count).toBeGreaterThanOrEqual(0);
            expect(u.count).toBeLessThanOrEqual(committed);
            expect(u.morale).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });
});

describe('resolveArmyGroupBattle — §M1 3-round attrition', () => {
  it('(a) stronger side (1.5:1 net effective power) wins >= 70% over 100 trials', () => {
    const r = makeRegion();
    const rivalId = injectRival(r);
    // computeCombatPower(m) = m^0.6 * 1.95 (equip/doctrine/morale maxed, supply=1)
    // defenderPower = rivalManpower^0.6 * 1.95 * homeGround(1.10); solved for R=1.5 -> playerManpower ≈ 231
    let playerWins = 0;
    for (let i = 0; i < TRIALS; i++) {
      const groups = r as unknown as { armyGroups: ArmyGroup[] };
      groups.armyGroups = [freshArmyGroup(0, 1, 231), freshArmyGroup(rivalId, 2, 100)];
      resolveArmyGroupBattle(r, PROVINCE_ID);
      if (r.lastBattleWon) playerWins++;
    }
    expect(playerWins / TRIALS).toBeGreaterThanOrEqual(0.70);
  });

  it('(a) even sides (1:1 net effective power, defender bonus cancelled) split 35-65% over 100 trials', () => {
    const r = makeRegion();
    const rivalId = injectRival(r);
    // Solved for R=1.0 -> playerManpower ≈ 117
    let playerWins = 0;
    for (let i = 0; i < TRIALS; i++) {
      const groups = r as unknown as { armyGroups: ArmyGroup[] };
      groups.armyGroups = [freshArmyGroup(0, 1, 117), freshArmyGroup(rivalId, 2, 100)];
      resolveArmyGroupBattle(r, PROVINCE_ID);
      if (r.lastBattleWon) playerWins++;
    }
    const rivalWins = TRIALS - playerWins;
    expect(playerWins / TRIALS).toBeGreaterThanOrEqual(0.35);
    expect(playerWins / TRIALS).toBeLessThanOrEqual(0.65);
    expect(rivalWins / TRIALS).toBeGreaterThanOrEqual(0.35);
    expect(rivalWins / TRIALS).toBeLessThanOrEqual(0.65);
  });

  it('(b) manpower never drops below 0 or loses more than was committed', () => {
    const r = makeRegion();
    const rivalId = injectRival(r);
    for (const [playerManpower, rivalManpower] of [[1, 1], [2, 500], [500, 2], [3, 3], [1000, 40]] as const) {
      for (let i = 0; i < 20; i++) {
        const groups = r as unknown as { armyGroups: ArmyGroup[] };
        groups.armyGroups = [freshArmyGroup(0, 1, playerManpower), freshArmyGroup(rivalId, 2, rivalManpower)];
        resolveArmyGroupBattle(r, PROVINCE_ID);
        for (const a of groups.armyGroups) {
          const committed = a.ownerId === 0 ? playerManpower : rivalManpower;
          expect(a.manpower).toBeGreaterThanOrEqual(0);
          expect(a.manpower).toBeLessThanOrEqual(committed);
          expect(a.morale).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

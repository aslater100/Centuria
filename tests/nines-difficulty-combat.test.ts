/**
 * Spec 11 — Difficulty run-enders + combat depth (docs/specs/11-nines-difficulty-combat.md)
 *
 * Three proofs, all deterministic (no autoplay):
 *   §COMBAT-COMP — the combined-arms counter matrix + terrain reweighting is a real
 *     tactical axis (pure functions compositionMult / terrainWeight, plus one seeded
 *     province-battle band showing the counter decides an otherwise-even fight).
 *   §ECON-COLLAPSE — the sovereign-default loss route is reachable: 12 forced insolvent
 *     months end the run, it is escapable until then, and it is gated by difficulty teeth.
 *   §STATE-COLLAPSE — the terminal-revolution loss route is reachable: a low-legitimacy
 *     state falls to a rung-5 revolution, a healthy state survives the same revolt, and
 *     easy tier never lets a revolution turn terminal.
 */

import { describe, it, expect } from 'vitest';
import {
  RegionSim,
  applyDifficultyPreset,
  INSOLVENCY_COLLAPSE_MONTHS,
  STATE_COLLAPSE_LEGITIMACY,
  SAVE_SCHEMA_VERSION,
} from '../src/sim/region';
import type { ArmyUnit, ArmyUnitType, ProvincialArmy } from '../src/sim/region';
import {
  compositionMult,
  terrainWeight,
  COMP_SWING,
  COMBINED_ARMS_BONUS,
  resolveProvinceBattle,
  rivalWarComposition,
} from '../src/sim/systems/military';
import { tickUnrestLadder } from '../src/sim/systems/demographics';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** One homogeneous stack of `count` `type` units at full morale. */
const stack = (type: ArmyUnitType, count: number): ArmyUnit[] => [
  { type, count, morale: 100, suppliedDays: 60 },
];

/** A proclaimed nation with the monetary machinery on (mirrors audit-nine's `nation`). */
function nation(seed: number): RegionSim {
  const r = RegionSim.create(seed);
  r.stateProclaimed = true;
  r.nationProclaimed = true;
  r.govType = 'republic';
  r.legitimacy = 60;
  r.activePolicies = [];
  r.treasury = 1000;
  r.passedLaws.add('central_bank_charter');
  r.passedLaws.add('income_tax');
  return r;
}

// ===========================================================================
// §COMBAT-COMP — combined-arms counter matrix (pure, deterministic, no RNG)
// ===========================================================================

describe('§COMBAT-COMP counter matrix', () => {
  it('COMP_SWING and COMBINED_ARMS_BONUS carry the spec-11 constants', () => {
    expect(COMP_SWING).toBe(0.5);
    expect(COMBINED_ARMS_BONUS).toBe(1.08);
  });

  it('cavalry hard-counters artillery: attacker ×1.5, target ×0.5', () => {
    const cav = stack('cavalry', 100);
    const art = stack('artillery', 100);
    expect(compositionMult(cav, art, undefined)).toBeCloseTo(1.5, 6);
    expect(compositionMult(art, cav, undefined)).toBeCloseTo(0.5, 6);
  });

  it('militia hard-counters cavalry, artillery hard-counters militia (the full triangle)', () => {
    const mil = stack('militia', 100);
    const cav = stack('cavalry', 100);
    const art = stack('artillery', 100);
    // militia > cavalry
    expect(compositionMult(mil, cav, undefined)).toBeCloseTo(1.5, 6);
    expect(compositionMult(cav, mil, undefined)).toBeCloseTo(0.5, 6);
    // artillery > militia
    expect(compositionMult(art, mil, undefined)).toBeCloseTo(1.5, 6);
    expect(compositionMult(mil, art, undefined)).toBeCloseTo(0.5, 6);
  });

  it('a mirror match is neutral: identical compositions score equal multipliers of 1.0', () => {
    const a = stack('cavalry', 100);
    const b = stack('cavalry', 100);
    expect(compositionMult(a, b, undefined)).toBe(compositionMult(b, a, undefined));
    expect(compositionMult(a, b, undefined)).toBeCloseTo(1.0, 6);
  });

  it('the swing multiplier stays clamped to [0.5, 1.5] for extreme mono-arm mismatches', () => {
    // Perfect hard-counters (mono forces, no combined-arms bonus) sit exactly on the rails.
    for (const [mine, enemy] of [
      [stack('cavalry', 999), stack('artillery', 1)],
      [stack('artillery', 1), stack('cavalry', 999)],
      [stack('militia', 500), stack('cavalry', 3)],
    ] as const) {
      const m = compositionMult(mine, enemy, undefined);
      expect(m).toBeGreaterThanOrEqual(0.5);
      expect(m).toBeLessThanOrEqual(1.5);
    }
  });

  it('terrain reweights land power by unit type', () => {
    // rough ground favours infantry, blunts horse; open ground favours cavalry.
    expect(terrainWeight('cavalry', 'forest')).toBeLessThan(1);
    expect(terrainWeight('cavalry', 'plains')).toBeGreaterThan(1);
    expect(terrainWeight('cavalry', 'forest')).toBeLessThan(terrainWeight('cavalry', 'plains'));
    expect(terrainWeight('militia', 'forest')).toBeGreaterThan(1);
    expect(terrainWeight('militia', undefined)).toBe(1); // neutral/unknown biome
  });

  it('a power-balanced 3-arm force earns the combined-arms bonus; a mono-arm force does not', () => {
    // Balance by POWER, not count: powerPerUnit militia 1, cavalry 1.5, artillery 2.
    // 60 militia (60) · 40 cavalry (60) · 30 artillery (60) → each arm ≈33% of land power.
    const balanced: ArmyUnit[] = [
      { type: 'militia', count: 60, morale: 100, suppliedDays: 60 },
      { type: 'cavalry', count: 40, morale: 100, suppliedDays: 60 },
      { type: 'artillery', count: 30, morale: 100, suppliedDays: 60 },
    ];
    const mono = stack('cavalry', 100);
    // Mirror matchup isolates the bonus: swing is 1.0, so the result IS the arms factor.
    expect(compositionMult(balanced, balanced, undefined)).toBeCloseTo(COMBINED_ARMS_BONUS, 6);
    expect(compositionMult(mono, mono, undefined)).toBeCloseTo(1.0, 6);

    // A token second arm below the 15%-of-power floor does NOT qualify (still mono).
    const almostMono: ArmyUnit[] = [
      { type: 'cavalry', count: 100, morale: 100, suppliedDays: 60 }, // power 150
      { type: 'militia', count: 1, morale: 100, suppliedDays: 60 }, //   power 1  (<15%)
    ];
    expect(compositionMult(almostMono, almostMono, undefined)).toBeCloseTo(1.0, 6);
  });

  it('a hard-counter army wins a numerically-even province battle far more than 50% (seeded, 100 trials)', () => {
    // No settlement has this id → ownership ambiguous → the rival defends, player marches in.
    const PROVINCE_ID = 90001;
    const TRIALS = 100;
    const r = RegionSim.create(42);
    const sim = r as unknown as {
      rivals: Array<Record<string, unknown>>;
      nationProclaimed: boolean;
      stateProclaimed: boolean;
    };
    const rivalId = 9001;
    sim.rivals.push({
      id: rivalId, name: 'Testania', leader: 'Commander Test', archetype: 'hegemon',
      weights: { expansion: 7, commerce: 3, honor: 5, risk: 6, grudge: 3 },
      regime: 'junta', agenda: 'dominate', compass: 'east',
      pop: 80, relations: -70, treaties: [],
      borderSettled: false, emergedYear: 1920, history: [],
      lastEnvoyDay: -999, lastGiftDay: -999,
    });
    sim.nationProclaimed = true;
    sim.stateProclaimed = true;

    const army = (ownerId: number, type: ArmyUnitType, count: number): ProvincialArmy => ({
      id: r.nextArmyId++, ownerId, provinceId: PROVINCE_ID, destinationId: null,
      transitDays: 0, units: stack(type, count), supply: 1.0,
    });

    // Equal counts (100 vs 100). On RAW power the rival is AHEAD — artillery pp 2.0 (200) vs
    // cavalry pp 1.5 (150) — and it also collects rivalBoost + home-ground. The cavalry→artillery
    // hard-counter (×1.5 vs ×0.5) is the ONLY thing that flips the fight, so a decisive win here
    // is proof the composition axis, not brute numbers, decided it.
    let playerWins = 0;
    for (let i = 0; i < TRIALS; i++) {
      r.provincialArmies = [army(0, 'cavalry', 100), army(rivalId, 'artillery', 100)];
      resolveProvinceBattle(r, PROVINCE_ID);
      const rivalPresent = r.provincialArmies.some(
        (a) => a.ownerId === rivalId && a.provinceId === PROVINCE_ID,
      );
      if (!rivalPresent) playerWins++;
    }
    expect(playerWins / TRIALS).toBeGreaterThan(0.6);
  });
});

// ===========================================================================
// §ECON-COLLAPSE — sovereign-default death spiral (deterministic, forced state)
// ===========================================================================

/** A proclaimed nation pinned into the isInsolvent() band:
 *  rating 'D', debt > 2× annual GDP, treasury below a month of GDP. */
function insolventNation(seed: number): RegionSim {
  const r = nation(seed);
  r.gdpLastMonth = 1000; // annual GDP 12_000
  r.nationalDebt = r.gdpLastMonth * 12 * 3; // 36_000 > 2×annual (24_000)
  r.creditRating = 'D';
  r.treasury = -1; // < gdpLastMonth (a month of GDP)
  return r;
}

describe('§ECON-COLLAPSE sovereign default', () => {
  it('twelve consecutive insolvent months end the run — and not a month before', () => {
    const r = insolventNation(7);
    applyDifficultyPreset(r, 'standard'); // teeth on (unrestPressure 1)
    expect(r.isInsolvent()).toBe(true);

    for (let m = 1; m < INSOLVENCY_COLLAPSE_MONTHS; m++) {
      r.tickSolvency();
      expect(r.insolvencyMonths).toBe(m);
      expect(r.gameOver).toBe(false); // escapable right up to the wire
    }
    r.tickSolvency(); // month 12
    expect(r.insolvencyMonths).toBe(INSOLVENCY_COLLAPSE_MONTHS);
    expect(r.gameOver).toBe(true);
    expect(r.gameOverCause).toBe('insolvency');
  });

  it('pulling the credit rating off D resets the counter (austerity is a real escape)', () => {
    const r = insolventNation(7);
    applyDifficultyPreset(r, 'standard');
    for (let m = 0; m < 6; m++) r.tickSolvency();
    expect(r.insolvencyMonths).toBe(6);
    expect(r.gameOver).toBe(false);

    r.creditRating = 'BBB'; // rating recovers → no longer insolvent
    expect(r.isInsolvent()).toBe(false);
    r.tickSolvency();
    expect(r.insolvencyMonths).toBe(0);
    expect(r.gameOver).toBe(false);
  });

  it('easy tier never collapses on insolvency, however long it runs (no teeth = coast)', () => {
    const r = insolventNation(7);
    applyDifficultyPreset(r, 'easy'); // unrestPressure 0
    for (let m = 0; m < INSOLVENCY_COLLAPSE_MONTHS + 6; m++) r.tickSolvency();
    expect(r.insolvencyMonths).toBeGreaterThanOrEqual(INSOLVENCY_COLLAPSE_MONTHS);
    expect(r.gameOver).toBe(false);
    expect(r.gameOverCause).toBeNull();
  });

  it('insolvencyMonths round-trips through serialize/deserialize (schema v4)', () => {
    expect(SAVE_SCHEMA_VERSION).toBe(4);
    const r = RegionSim.create(7);
    r.insolvencyMonths = 7;
    const r2 = RegionSim.deserialize(r.serialize());
    expect(r2.insolvencyMonths).toBe(7);
    expect(typeof r2.insolvencyMonths).toBe('number');
  });
});

// ===========================================================================
// §STATE-COLLAPSE — terminal revolution (deterministic loop over RNG-gated rung 5)
// ===========================================================================

/** Force the rung-5 revolution preconditions: max grievance on every player town,
 *  the ladder pinned at rung 5, and the given legitimacy. */
function primeRevolt(r: RegionSim, legitimacy: number): void {
  r.legitimacy = legitimacy;
  for (const t of r.settlements.filter((s) => s.factionId === r.playerFactionId)) {
    t.grievance = 100;
  }
  r.unrestLevel = 5;
}

describe('§STATE-COLLAPSE terminal revolution', () => {
  it('a low-legitimacy state falls to a rung-5 revolution (terminal, game over = revolution)', () => {
    const r = nation(11);
    applyDifficultyPreset(r, 'standard'); // teeth on
    // Grievance stays pinned until a revolution actually fires, so no re-forcing needed.
    primeRevolt(r, 10); // legitimacy < STATE_COLLAPSE_LEGITIMACY (15)
    expect(r.legitimacy).toBeLessThan(STATE_COLLAPSE_LEGITIMACY);

    for (let m = 0; m < 600 && !r.gameOver; m++) tickUnrestLadder(r);
    expect(r.gameOver).toBe(true);
    expect(r.gameOverCause).toBe('revolution');
    expect(r.revolutionsFired).toBeGreaterThanOrEqual(1);
  });

  it('a legitimate state survives the same revolt: the revolution fires but is non-terminal', () => {
    const r = nation(11);
    applyDifficultyPreset(r, 'standard'); // teeth on
    // A non-terminal revolution de-escalates the ladder, so re-prime each month.
    for (let m = 0; m < 600 && !r.gameOver; m++) {
      primeRevolt(r, 80); // healthy legitimacy → revolt survivable
      tickUnrestLadder(r);
    }
    expect(r.gameOver).toBe(false);
    expect(r.gameOverCause).toBeNull();
    expect(r.revolutionsFired).toBeGreaterThanOrEqual(1); // it DID revolt, just didn't fall
  });

  it('easy tier: revolutions fire but never turn terminal (no teeth = coast)', () => {
    const r = nation(11);
    applyDifficultyPreset(r, 'easy'); // unrestPressure 0
    for (let m = 0; m < 600; m++) {
      primeRevolt(r, 10); // even at collapse-line legitimacy, easy never ends the run
      tickUnrestLadder(r);
      expect(r.gameOver).toBe(false);
    }
    expect(r.revolutionsFired).toBeGreaterThanOrEqual(1);
    expect(r.gameOverCause).toBeNull();
  });
});

describe('§COMBAT-COMP — player-war composition (the main combat path)', () => {
  const mk = (type: ArmyUnitType, count: number): ArmyUnit => ({ type, count, morale: 100, suppliedDays: 60 });

  it('rivals field an era-appropriate composition (infantry+horse → +guns → combined arms)', () => {
    const types = (yr: number) => new Set(rivalWarComposition(yr).map((u) => u.type));
    expect(types(1910)).toEqual(new Set(['militia', 'cavalry']));
    expect(types(1945)).toEqual(new Set(['militia', 'artillery']));
    expect(types(1990)).toEqual(new Set(['militia', 'cavalry', 'artillery']));
  });

  it('countering the era threat beats fielding the countered arm, vs the same rival', () => {
    // 1945 rival = militia + artillery. Cavalry counters artillery; a mono-militia army is
    // itself countered by that artillery. The counter must out-multiply the countered force.
    const rival = rivalWarComposition(1945);
    const counterArmy = compositionMult([mk('cavalry', 100)], rival, undefined);
    const counteredArmy = compositionMult([mk('militia', 100)], rival, undefined);
    expect(counterArmy).toBeGreaterThan(counteredArmy);
    expect(counteredArmy).toBeLessThan(1); // the rival's artillery hard-counters mono-militia
  });

  it('empty player units → neutral multiplier (a pre-unit / abstract war is unchanged)', () => {
    expect(compositionMult([], rivalWarComposition(1945), undefined)).toBe(1);
  });
});

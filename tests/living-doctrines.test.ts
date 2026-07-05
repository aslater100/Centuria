/**
 * Spec 13 — Living rival doctrines (docs/specs/13-living-doctrines.md)
 *
 * Phase 1, all deterministic (pure functions, no RNG, no autoplay):
 *   §A — rivalComposition re-weights the era baseline by rival temperament, so every
 *        opponent is a different counter problem; a neutral temperament reproduces the
 *        old era stub exactly.
 *   §B — terrain (the home theater) feeds the same compositionMult, reshaping the duel.
 */

import { describe, it, expect } from 'vitest';
import type { ArmyUnit, ArmyUnitType, RivalPersonality } from '../src/sim/region';
import {
  rivalComposition,
  rivalWarComposition,
  compositionMult,
} from '../src/sim/systems/military';

/** A rival with the given offensive dials; the other weights are neutral (5). */
const rival = (expansion: number, risk: number): { weights: RivalPersonality } => ({
  weights: { expansion, commerce: 5, ideology: 5, honor: 5, risk, grudge: 5 },
});

const countOf = (units: ArmyUnit[], type: ArmyUnitType): number =>
  units.find((u) => u.type === type)?.count ?? 0;

describe('§A rivalComposition — temperament-differentiated doctrine', () => {
  it('a neutral temperament (offense 0.5) reproduces the era baseline exactly', () => {
    // expansion 5 + risk 5 → offense = 10/20 = 0.5 → every multiplier is 1.
    for (const year of [1905, 1945, 1980]) {
      expect(rivalComposition(rival(5, 5), year)).toEqual(rivalWarComposition(year));
    }
  });

  it('an aggressive expansionist skews to shock+gun arms; a cautious isolationist masses infantry', () => {
    const aggressive = rivalComposition(rival(9, 7), 1980); // offense 0.8
    const cautious = rivalComposition(rival(2, 2), 1980); // offense 0.2

    expect(countOf(aggressive, 'militia')).toBeLessThan(countOf(cautious, 'militia'));
    expect(countOf(aggressive, 'cavalry')).toBeGreaterThan(countOf(cautious, 'cavalry'));
    expect(countOf(aggressive, 'artillery')).toBeGreaterThan(countOf(cautious, 'artillery'));
  });

  it('is deterministic — pure over (weights, year)', () => {
    const a = rivalComposition(rival(8, 6), 1955);
    const b = rivalComposition(rival(8, 6), 1955);
    expect(a).toEqual(b);
  });

  it('never emits a zero- or negative-count stack (multipliers floored)', () => {
    for (const [e, k] of [[10, 10], [0, 0], [10, 0], [0, 10]] as const) {
      for (const u of rivalComposition(rival(e, k), 1980)) {
        expect(u.count).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('§A — the opponent decides the counter (the point of the axis)', () => {
  // Modern era (3 arms). Aggressive = cavalry/gun heavy; cautious = militia heavy.
  const aggressive = rivalComposition(rival(9, 7), 1980);
  const cautious = rivalComposition(rival(2, 2), 1980);
  const stack = (type: ArmyUnitType): ArmyUnit[] => [{ type, count: 100, morale: 100, suppliedDays: 60 }];

  it('artillery (counters infantry) fares better against the infantry-massing cautious power', () => {
    expect(compositionMult(stack('artillery'), cautious, undefined)).toBeGreaterThan(
      compositionMult(stack('artillery'), aggressive, undefined),
    );
  });

  it('militia (counters cavalry) fares better against the cavalry-heavy aggressive power', () => {
    expect(compositionMult(stack('militia'), aggressive, undefined)).toBeGreaterThan(
      compositionMult(stack('militia'), cautious, undefined),
    );
  });
});

describe('§B — theater terrain reshapes the player-vs-rival duel', () => {
  const enemy = rivalComposition(rival(9, 7), 1980); // cavalry-heavy
  const myMilitia: ArmyUnit[] = [{ type: 'militia', count: 100, morale: 100, suppliedDays: 60 }];

  it('theater is a real input — the same duel resolves differently by biome', () => {
    // Old code always passed undefined; §B now feeds the home theater, so terrain moves the number.
    const flat = compositionMult(myMilitia, enemy, undefined);
    expect(compositionMult(myMilitia, enemy, 'forest')).not.toBe(flat);
    expect(compositionMult(myMilitia, enemy, 'plains')).not.toBe(flat);
  });

  it('open ground amplifies the enemy horse, rewarding the anti-cavalry militia counter', () => {
    // plains ×1.1 the enemy cavalry the militia is built to beat; rough ground blunts it.
    expect(compositionMult(myMilitia, enemy, 'plains')).toBeGreaterThan(
      compositionMult(myMilitia, enemy, 'forest'),
    );
  });
});

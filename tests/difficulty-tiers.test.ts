import { describe, expect, it } from 'vitest';

import {
  RegionSim,
  DEFAULT_DIFFICULTY_SETTINGS,
  DIFFICULTY_PRESETS,
  applyDifficultyPreset,
} from '../src/sim/region';
import { tickDemographicTransition } from '../src/sim/systems/demographics';

/** Spec 10 §DIFF — the difficulty ladder contract (owner-approved 2026-07-04).
 *  The single most important pin: EASY IS THE LEGACY GAME. Every pre-rebalance
 *  behavior (the coast-to-2100 feel all older balance tests were tuned against)
 *  must remain selectable, exactly, forever. */
describe('difficulty tier ladder', () => {
  it('easy preset is identical to the legacy defaults (the old game is never lost)', () => {
    expect(DIFFICULTY_PRESETS.easy).toEqual(DEFAULT_DIFFICULTY_SETTINGS);
  });

  it('the ladder is strictly increasing in pressure', () => {
    const tiers = ['easy', 'standard', 'hard', 'brutal'] as const;
    for (let i = 1; i < tiers.length; i++) {
      const lo = DIFFICULTY_PRESETS[tiers[i - 1]];
      const hi = DIFFICULTY_PRESETS[tiers[i]];
      expect(hi.crisisFrequency).toBeGreaterThan(lo.crisisFrequency);
      expect(hi.aiAggression).toBeGreaterThan(lo.aiAggression);
      expect(hi.economicVolatility).toBeGreaterThan(lo.economicVolatility);
      expect(hi.pensionMult ?? 1).toBeGreaterThanOrEqual(lo.pensionMult ?? 1);
    }
  });

  it('standard has real teeth: strictly harder than easy on every axis', () => {
    const s = DIFFICULTY_PRESETS.standard;
    expect(s.crisisFrequency).toBeGreaterThan(1.0);
    expect(s.aiAggression).toBeGreaterThan(1.0);
    expect(s.economicVolatility).toBeGreaterThan(1.0);
    expect(s.pensionMult ?? 1).toBeGreaterThan(1.0);
  });

  it('applyDifficultyPreset installs a copy, not a shared reference', () => {
    const r = RegionSim.create(7);
    applyDifficultyPreset(r, 'standard');
    expect(r.difficultySettings).toEqual(DIFFICULTY_PRESETS.standard);
    r.difficultySettings.crisisFrequency = 99;
    expect(DIFFICULTY_PRESETS.standard.crisisFrequency).not.toBe(99);
  });

  it('difficultySettings (with pensionMult) survives a serialize round-trip', () => {
    const r = RegionSim.create(7);
    applyDifficultyPreset(r, 'hard');
    const r2 = RegionSim.deserialize(r.serialize());
    expect(r2.difficultySettings).toEqual(DIFFICULTY_PRESETS.hard);
  });

  it('the aging-crisis pension burden consumes pensionMult', () => {
    const drain = (tier: 'easy' | 'standard'): number => {
      const r = RegionSim.create(7);
      applyDifficultyPreset(r, tier);
      // Force the aging-crisis branch on: the tick recomputes the phase from
      // education/urbanization (unreachable in a fresh-colony fixture), so stub
      // the computation; the year fast-forward satisfies the yr > 2050 guard.
      r.computeDemographicPhase = () => 'post_transition';
      r.minute += (2060 - r.year) * 60 * 24 * 60; // fast-forward the calendar past 2050
      r.gdpLastMonth = 120000;
      r.treasury = 1000000;
      const before = r.treasury;
      tickDemographicTransition(r);
      return before - r.treasury;
    };
    const easyDrain = drain('easy');
    const standardDrain = drain('standard');
    expect(easyDrain).toBeGreaterThan(0);
    expect(standardDrain / easyDrain).toBeCloseTo(
      (DIFFICULTY_PRESETS.standard.pensionMult ?? 1) / (DIFFICULTY_PRESETS.easy.pensionMult ?? 1),
      5,
    );
  });
});

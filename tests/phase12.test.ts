/**
 * Phase 12: Media & Misinformation System tests (GDD §8.3)
 *
 * Covers:
 *   1.  mediaReach transitions at correct year + tech thresholds
 *   2.  opinionVelocity() returns correct multiplier per reach stage
 *   3.  Controlled press (pressFreedom < 35) accumulates credibilityGap monthly
 *   4.  credibilityGap >= 80 + spark event → legitimacy cliff drop (-30)
 *   5.  Free press (pressFreedom > 65) decays credibilityGap
 *   6.  misinformationEra triggers when year >= 2015 + digital_economy researched
 *   7.  polarization grows in misinformation era
 *   8.  enactPlatformRegulation() reduces polarization growth rate
 *   9.  mediaLiteracyInvested reduces polarization after 15-year lag
 *   10. Serialize/deserialize round-trip preserves all new fields
 */

import { describe, expect, it } from 'vitest';
import { RegionSim, REGION_MINUTES_PER_TICK } from '../src/sim/region';
import { MINUTES_PER_DAY, DAYS_PER_YEAR, START_YEAR } from '../src/sim/defs';

const ticksPerDay = MINUTES_PER_DAY / REGION_MINUTES_PER_TICK;

function runDays(r: RegionSim, days: number): void {
  for (let i = 0; i < days * ticksPerDay; i++) r.tick();
}

function runMonths(r: RegionSim, months: number): void {
  runDays(r, months * 30);
}

/** Create a minimal region with statehood granted and enough to avoid bankruptcy. */
function stateRegion(seed = 42): RegionSim {
  const r = RegionSim.create(seed, { aiDifficulty: 'normal', currencySymbol: '$' });
  // Manually proclaim state so player actions are available
  r.stateProclaimed = true;
  r.treasury = 100000;
  r.gdpLastMonth = 5000;
  r.politicalCapital = 999;
  r.legitimacy = 70;
  return r;
}

/** Advance minute counter so year() returns the target year, without running full sim. */
function setYear(r: RegionSim, targetYear: number): void {
  const targetDay = (targetYear - START_YEAR) * DAYS_PER_YEAR;
  r.minute = targetDay * MINUTES_PER_DAY;
}

describe('Phase 12: Media & Misinformation System', () => {
  // ---- 1. mediaReach transitions ----
  describe('mediaReach transitions', () => {
    it('starts at word_of_mouth', () => {
      const r = stateRegion();
      expect(r.mediaReach).toBe('word_of_mouth');
    });

    it('transitions to press at year >= 1925', () => {
      const r = stateRegion();
      setYear(r, 1925);
      r.updateMediaReach();
      expect(r.mediaReach).toBe('press');
    });

    it('does not transition to press before 1925', () => {
      const r = stateRegion();
      setYear(r, 1924);
      r.updateMediaReach();
      expect(r.mediaReach).toBe('word_of_mouth');
    });

    it('transitions to radio at year >= 1935 with radio_broadcasting researched', () => {
      const r = stateRegion();
      r.mediaReach = 'press';
      r.researched.add('radio_broadcasting');
      setYear(r, 1935);
      r.updateMediaReach();
      expect(r.mediaReach).toBe('radio');
    });

    it('stays at press at year >= 1935 without radio_broadcasting', () => {
      const r = stateRegion();
      r.mediaReach = 'press';
      setYear(r, 1935);
      r.updateMediaReach();
      expect(r.mediaReach).toBe('press');
    });

    it('transitions to television at year >= 1950 with television tech', () => {
      const r = stateRegion();
      r.mediaReach = 'radio';
      r.researched.add('television');
      setYear(r, 1950);
      r.updateMediaReach();
      expect(r.mediaReach).toBe('television');
    });

    it('transitions to internet at year >= 1995 with digital_economy researched', () => {
      const r = stateRegion();
      r.mediaReach = 'television';
      r.researched.add('digital_economy');
      setYear(r, 1995);
      r.updateMediaReach();
      expect(r.mediaReach).toBe('internet');
    });

    it('transitions to algorithmic at year >= 2015 when misinformationEra is true', () => {
      const r = stateRegion();
      r.mediaReach = 'internet';
      r.misinformationEra = true;
      setYear(r, 2015);
      r.updateMediaReach();
      expect(r.mediaReach).toBe('algorithmic');
    });

    it('stays at internet if misinformationEra is false', () => {
      const r = stateRegion();
      r.mediaReach = 'internet';
      r.misinformationEra = false;
      setYear(r, 2020);
      r.updateMediaReach();
      expect(r.mediaReach).toBe('internet');
    });
  });

  // ---- 2. opinionVelocity ----
  describe('opinionVelocity()', () => {
    it('returns 0.2 for word_of_mouth', () => {
      const r = stateRegion();
      r.mediaReach = 'word_of_mouth';
      expect(r.opinionVelocity()).toBeCloseTo(0.2);
    });

    it('returns 0.5 for press', () => {
      const r = stateRegion();
      r.mediaReach = 'press';
      expect(r.opinionVelocity()).toBeCloseTo(0.5);
    });

    it('returns 0.8 for radio', () => {
      const r = stateRegion();
      r.mediaReach = 'radio';
      expect(r.opinionVelocity()).toBeCloseTo(0.8);
    });

    it('returns 1.0 for television', () => {
      const r = stateRegion();
      r.mediaReach = 'television';
      expect(r.opinionVelocity()).toBeCloseTo(1.0);
    });

    it('returns 1.5 for internet', () => {
      const r = stateRegion();
      r.mediaReach = 'internet';
      expect(r.opinionVelocity()).toBeCloseTo(1.5);
    });

    it('returns 2.5 for algorithmic', () => {
      const r = stateRegion();
      r.mediaReach = 'algorithmic';
      expect(r.opinionVelocity()).toBeCloseTo(2.5);
    });
  });

  // ---- 3. Controlled press accumulates credibilityGap ----
  describe('controlled press credibilityGap accumulation', () => {
    it('accumulates credibilityGap when pressFreedom < 35 and propagandaNarrative > 0', () => {
      const r = stateRegion();
      r.pressFreedom = 20;
      r.propagandaNarrative = 1.0;
      r.credibilityGap = 0;
      const priv = r as unknown as { tickMedia(): void };
      priv.tickMedia();
      // growth = 1.5 × 1.0 × (1 − 20/100) = 1.5 × 0.8 = 1.2
      expect(r.credibilityGap).toBeGreaterThan(0);
      expect(r.credibilityGap).toBeCloseTo(1.2, 1);
    });

    it('credibilityGap does not grow with zero propagandaNarrative', () => {
      const r = stateRegion();
      r.pressFreedom = 20;
      r.propagandaNarrative = 0;
      r.credibilityGap = 0;
      const priv = r as unknown as { tickMedia(): void };
      priv.tickMedia();
      expect(r.credibilityGap).toBe(0);
    });

    it('credibilityGap grows more with higher propagandaNarrative', () => {
      const r1 = stateRegion(1);
      const r2 = stateRegion(2);
      r1.pressFreedom = r2.pressFreedom = 20;
      r1.propagandaNarrative = 0.5;
      r2.propagandaNarrative = 1.0;
      const priv1 = r1 as unknown as { tickMedia(): void };
      const priv2 = r2 as unknown as { tickMedia(): void };
      priv1.tickMedia();
      priv2.tickMedia();
      expect(r2.credibilityGap).toBeGreaterThan(r1.credibilityGap);
    });
  });

  // ---- 4. credibilityGap >= 80 + spark → legitimacy cliff ----
  describe('credibilityGap spark events', () => {
    it('drops legitimacy by 30 when credibilityGap >= 80 and treasury < 0', () => {
      const r = stateRegion();
      r.pressFreedom = 20;
      r.credibilityGap = 85;
      r.legitimacy = 60;
      r.treasury = -1; // spark: negative treasury
      const priv = r as unknown as { tickMedia(): void };
      priv.tickMedia();
      expect(r.legitimacy).toBeLessThanOrEqual(30); // 60 - 30 = 30
    });

    it('drops legitimacy by 30 when credibilityGap >= 80 and average grievance > 70', () => {
      const r = stateRegion();
      r.pressFreedom = 20;
      r.credibilityGap = 85;
      r.legitimacy = 60;
      // Add a settlement with high grievance
      r.settlements[0].grievance = 80;
      const priv = r as unknown as { tickMedia(): void };
      priv.tickMedia();
      expect(r.legitimacy).toBeLessThanOrEqual(30);
    });

    it('does NOT drop legitimacy when credibilityGap < 80', () => {
      const r = stateRegion();
      r.pressFreedom = 20;
      r.credibilityGap = 70;
      r.legitimacy = 60;
      r.treasury = -1;
      const priv = r as unknown as { tickMedia(): void };
      priv.tickMedia();
      expect(r.legitimacy).toBe(60); // unchanged
    });

    it('does NOT drop legitimacy when no spark and credibilityGap >= 80', () => {
      const r = stateRegion();
      r.pressFreedom = 20;
      r.credibilityGap = 85;
      r.legitimacy = 60;
      r.treasury = 10000; // healthy treasury — no spark
      // Clear settlement grievance
      for (const s of r.settlements) s.grievance = 10;
      r.playerWar = null;
      const priv = r as unknown as { tickMedia(): void };
      priv.tickMedia();
      // Legitimacy should NOT drop (no spark)
      expect(r.legitimacy).toBeGreaterThanOrEqual(55); // no major drop
    });
  });

  // ---- 5. Free press decays credibilityGap ----
  describe('free press credibilityGap decay', () => {
    it('decays credibilityGap by 1/month when pressFreedom > 50', () => {
      const r = stateRegion();
      r.pressFreedom = 70;
      r.credibilityGap = 30;
      const priv = r as unknown as { tickMedia(): void };
      priv.tickMedia();
      expect(r.credibilityGap).toBe(29); // decayed by 1
    });

    it('decays credibilityGap by 2/month when publicMediaFunded and pressFreedom > 50', () => {
      const r = stateRegion();
      r.pressFreedom = 70;
      r.credibilityGap = 30;
      r.publicMediaFunded = true;
      const priv = r as unknown as { tickMedia(): void };
      priv.tickMedia();
      expect(r.credibilityGap).toBe(28); // decayed by 2
    });

    it('credibilityGap does not go below 0', () => {
      const r = stateRegion();
      r.pressFreedom = 70;
      r.credibilityGap = 0.5;
      const priv = r as unknown as { tickMedia(): void };
      priv.tickMedia();
      expect(r.credibilityGap).toBe(0);
    });
  });

  // ---- 6. misinformationEra trigger ----
  describe('misinformationEra trigger', () => {
    it('triggers misinformationEra at year >= 2015 with digital_economy', () => {
      const r = stateRegion();
      r.researched.add('digital_economy');
      setYear(r, 2015);
      expect(r.misinformationEra).toBe(false);
      const priv = r as unknown as { tickMedia(): void };
      priv.tickMedia();
      expect(r.misinformationEra).toBe(true);
    });

    it('does NOT trigger misinformationEra before 2015 even with digital_economy', () => {
      const r = stateRegion();
      r.researched.add('digital_economy');
      setYear(r, 2014);
      const priv = r as unknown as { tickMedia(): void };
      priv.tickMedia();
      expect(r.misinformationEra).toBe(false);
    });

    it('does NOT trigger misinformationEra without digital_economy at year >= 2015', () => {
      const r = stateRegion();
      setYear(r, 2020);
      const priv = r as unknown as { tickMedia(): void };
      priv.tickMedia();
      expect(r.misinformationEra).toBe(false);
    });
  });

  // ---- 7. Polarization grows in misinformation era ----
  describe('polarization in misinformation era', () => {
    it('polarization grows 0.01/month in misinformation era', () => {
      const r = stateRegion();
      r.misinformationEra = true;
      r.polarization = 0;
      const priv = r as unknown as { tickMedia(): void };
      priv.tickMedia();
      expect(r.polarization).toBeCloseTo(0.01, 3);
    });

    it('polarization does not grow when misinformationEra is false', () => {
      const r = stateRegion();
      r.misinformationEra = false;
      r.polarization = 0.1;
      const priv = r as unknown as { tickMedia(): void };
      priv.tickMedia();
      expect(r.polarization).toBeCloseTo(0.1, 3); // unchanged
    });

    it('polarization is capped at 1.0', () => {
      const r = stateRegion();
      r.misinformationEra = true;
      r.polarization = 0.999;
      const priv = r as unknown as { tickMedia(): void };
      priv.tickMedia();
      expect(r.polarization).toBeLessThanOrEqual(1.0);
    });
  });

  // ---- 8. enactPlatformRegulation reduces growth ----
  describe('enactPlatformRegulation()', () => {
    it('reduces polarization growth to 0.005/month', () => {
      const r = stateRegion();
      r.misinformationEra = true;
      r.polarization = 0;
      r.researched.add('digital_economy');
      r.enactPlatformRegulation();
      expect(r.platformRegulationEnacted).toBe(true);
      const priv = r as unknown as { tickMedia(): void };
      priv.tickMedia();
      // growth should be 0.01 - 0.005 = 0.005
      expect(r.polarization).toBeCloseTo(0.005, 3);
    });

    it('cannot be enacted twice', () => {
      const r = stateRegion();
      r.researched.add('digital_economy');
      const first = r.enactPlatformRegulation();
      const second = r.enactPlatformRegulation();
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(false);
    });

    it('requires digital_economy tech', () => {
      const r = stateRegion();
      const result = r.enactPlatformRegulation();
      expect(result.ok).toBe(false);
    });

    it('angers merchants (power -8)', () => {
      const r = stateRegion();
      r.researched.add('digital_economy');
      // Ensure factions are initialized
      r.factions = [
        { id: 'merchants', name: 'Merchants', power: 50, support: 50, demand: '' },
        { id: 'workers', name: 'Workers', power: 50, support: 50, demand: '' },
        { id: 'landowners', name: 'Landowners', power: 50, support: 50, demand: '' },
      ];
      r.enactPlatformRegulation();
      const merchants = r.factions.find(f => f.id === 'merchants')!;
      expect(merchants.power).toBe(42); // 50 - 8
    });
  });

  // ---- 9. mediaLiteracyInvested reduces polarization after 15-year lag ----
  describe('mediaLiteracyInvested 15-year lag', () => {
    it('investMediaLiteracy() sets mediaLiteracyInvested and records year', () => {
      const r = stateRegion();
      r.treasury = 100000;
      r.gdpLastMonth = 1000;
      setYear(r, 2020);
      r.investMediaLiteracy();
      expect(r.mediaLiteracyInvested).toBe(true);
      expect(r.mediaLiteracyYear).toBe(2020);
    });

    it('does NOT reduce polarization before 15 years', () => {
      const r = stateRegion();
      r.misinformationEra = true;
      r.mediaLiteracyInvested = true;
      r.mediaLiteracyYear = 2020;
      r.polarization = 0.5;
      setYear(r, 2034); // 14 years later — not yet
      const priv = r as unknown as { tickMedia(): void };
      priv.tickMedia();
      expect(r.mediaLiteracyApplied).toBe(false);
      expect(r.polarization).toBeGreaterThan(0.35); // not reduced by 0.15 yet
    });

    it('reduces polarization by 0.15 after 15 years', () => {
      const r = stateRegion();
      r.misinformationEra = true;
      r.mediaLiteracyInvested = true;
      r.mediaLiteracyYear = 2020;
      r.mediaLiteracyApplied = false;
      r.polarization = 0.5;
      setYear(r, 2035); // exactly 15 years later
      const priv = r as unknown as { tickMedia(): void };
      priv.tickMedia();
      expect(r.mediaLiteracyApplied).toBe(true);
      // polarization should have decreased by 0.15 (then grown 0.01 this tick)
      expect(r.polarization).toBeCloseTo(0.36, 1); // 0.5 - 0.15 + 0.01
    });

    it('applies polarization reduction only once', () => {
      const r = stateRegion();
      r.misinformationEra = true;
      r.mediaLiteracyInvested = true;
      r.mediaLiteracyYear = 2000;
      r.mediaLiteracyApplied = false;
      r.polarization = 0.5;
      setYear(r, 2020);
      const priv = r as unknown as { tickMedia(): void };
      priv.tickMedia();
      const afterFirst = r.polarization;
      priv.tickMedia(); // second tick — should NOT re-apply
      // Second tick only adds 0.01 growth (no second -0.15)
      expect(r.polarization).toBeCloseTo(afterFirst + 0.01, 2);
    });
  });

  // ---- 10. Serialize/deserialize round-trip ----
  describe('serialize/deserialize round-trip', () => {
    it('preserves all Phase 12 fields', () => {
      const r = stateRegion();
      r.mediaReach = 'radio';
      r.pressFreedom = 42;
      r.propagandaNarrative = 0.7;
      r.credibilityGap = 55;
      r.polarization = 0.33;
      r.misinformationEra = true;
      r.platformRegulationEnacted = true;
      r.publicMediaFunded = true;
      r.mediaLiteracyInvested = true;
      r.mediaLiteracyYear = 2030;
      r.mediaLiteracyApplied = false;

      const json = r.serialize();
      const r2 = RegionSim.deserialize(json);

      expect(r2.mediaReach).toBe('radio');
      expect(r2.pressFreedom).toBe(42);
      expect(r2.propagandaNarrative).toBeCloseTo(0.7);
      expect(r2.credibilityGap).toBe(55);
      expect(r2.polarization).toBeCloseTo(0.33);
      expect(r2.misinformationEra).toBe(true);
      expect(r2.platformRegulationEnacted).toBe(true);
      expect(r2.publicMediaFunded).toBe(true);
      expect(r2.mediaLiteracyInvested).toBe(true);
      expect(r2.mediaLiteracyYear).toBe(2030);
      expect(r2.mediaLiteracyApplied).toBe(false);
    });

    it('backfills defaults for old saves without Phase 12 fields', () => {
      // Simulate an old save by creating a region and stripping Phase 12 fields from JSON
      const r = stateRegion();
      const parsed = JSON.parse(r.serialize());
      delete parsed.mediaReach;
      delete parsed.pressFreedom;
      delete parsed.propagandaNarrative;
      delete parsed.credibilityGap;
      delete parsed.polarization;
      delete parsed.misinformationEra;
      delete parsed.platformRegulationEnacted;
      delete parsed.publicMediaFunded;
      delete parsed.mediaLiteracyInvested;
      delete parsed.mediaLiteracyYear;
      delete parsed.mediaLiteracyApplied;

      const r2 = RegionSim.deserialize(JSON.stringify(parsed));

      expect(r2.mediaReach).toBe('word_of_mouth');
      expect(r2.pressFreedom).toBe(60);
      expect(r2.propagandaNarrative).toBe(0);
      expect(r2.credibilityGap).toBe(0);
      expect(r2.polarization).toBe(0);
      expect(r2.misinformationEra).toBe(false);
      expect(r2.platformRegulationEnacted).toBe(false);
      expect(r2.publicMediaFunded).toBe(false);
      expect(r2.mediaLiteracyInvested).toBe(false);
      expect(r2.mediaLiteracyYear).toBe(-1);
      expect(r2.mediaLiteracyApplied).toBe(false);
    });
  });

  // ---- Additional player action tests ----
  describe('player actions', () => {
    it('grantPressLicense increases pressFreedom by 20', () => {
      const r = stateRegion();
      r.pressFreedom = 50;
      const result = r.grantPressLicense();
      expect(result.ok).toBe(true);
      expect(r.pressFreedom).toBe(70);
    });

    it('censorMedia decreases pressFreedom by 20', () => {
      const r = stateRegion();
      r.pressFreedom = 50;
      const result = r.censorMedia();
      expect(result.ok).toBe(true);
      expect(r.pressFreedom).toBe(30);
    });

    it('setPressFreedom clamps to 0-100', () => {
      const r = stateRegion();
      r.setPressFreedom(150);
      expect(r.pressFreedom).toBe(100);
      r.setPressFreedom(-10);
      expect(r.pressFreedom).toBe(0);
    });

    it('setPropagandaNarrative clamps to 0-1', () => {
      const r = stateRegion();
      r.setPropagandaNarrative(2.5);
      expect(r.propagandaNarrative).toBe(1);
      r.setPropagandaNarrative(-0.5);
      expect(r.propagandaNarrative).toBe(0);
    });

    it('effectiveApproval is buffered by propaganda when pressFreedom < 35', () => {
      const r = stateRegion();
      r.pressFreedom = 20;
      r.propagandaNarrative = 1.0;
      // Set settlement satisfaction to known value
      for (const s of r.settlements) s.satisfaction = 40;
      // effectiveApproval = min(95, 40 + 1.0 × 25) = 65
      expect(r.effectiveApproval).toBe(65);
    });

    it('effectiveApproval equals base satisfaction when pressFreedom >= 35', () => {
      const r = stateRegion();
      r.pressFreedom = 70;
      r.propagandaNarrative = 1.0;
      for (const s of r.settlements) s.satisfaction = 40;
      expect(r.effectiveApproval).toBeCloseTo(40, 0);
    });

    it('investMediaLiteracy requires sufficient treasury', () => {
      const r = stateRegion();
      r.gdpLastMonth = 10000;
      r.treasury = 0; // can't afford 5% of 10000 = 500
      const result = r.investMediaLiteracy();
      expect(result.ok).toBe(false);
    });

    it('grantPressLicense fails without State tier', () => {
      const r = RegionSim.create(42, { currencySymbol: '$' });
      r.politicalCapital = 999;
      const result = r.grantPressLicense();
      expect(result.ok).toBe(false);
    });
  });
});

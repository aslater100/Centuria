import { describe, expect, it } from 'vitest';
import { RegionSim } from '../src/sim/region';

/**
 * Bounds-sweep guard for src/sim/systems/monetary.ts (GDD §5.2). The unit
 * suites exercise the credit-cycle/inflation/bond primitives in isolation;
 * this closes the gap the same way tests/region-longrun.test.ts closes it
 * for the whole-nation tier — run RegionSim for real, seed by seed, year by
 * year, and assert the monetary outputs never leave their design envelope.
 * Setup mirrors tests/region-longrun.test.ts's `nation()`/`runYears()`
 * pattern exactly, so both suites stay directly comparable.
 */

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

/** Ticks `r` forward one calendar year. */
function tickOneYear(r: RegionSim): void {
  const targetYear = r.year + 1;
  while (r.year < targetYear) r.tick();
}

const SEED_COUNT = 20;
const YEARS = 100; // 20 seeds × 100 years measured at ~29s of tick time locally
// (see exploration run); comfortably inside the ~60s budget alongside vitest's
// own startup/collect overhead, so no reduction from the plan §R1 target was
// needed.

/** Annualized inflation envelope (plan §R1). `tickMonetary` itself clamps to
 *  [0, 0.50] and `tickFX`'s gold-standard branch can drag it to -0.05 (its own
 *  floor), so this is a tighter *design-intent* envelope, not the hard clamp —
 *  a seed that legitimately exercises print/regime-crisis paths could exceed
 *  it without that being a code bug. */
const INFLATION_MIN = -0.05;
const INFLATION_MAX = 0.30;

/** Policy/bond interest-rate envelope (plan §R1). `policyRate` itself is only
 *  constrained to [0.03, 0.08] under the gold standard (tickFX) and
 *  [MIN_POLICY_RATE, MAX_POLICY_RATE] = [0.01, 0.15] elsewhere; `bondRate`
 *  additionally carries a credit-rating spread up to 0.25 (CREDIT_RATING_SPREADS.D
 *  in region.ts), so it is *possible* in principle for bondRate to clear 0.30
 *  for a badly-rated nation on the gold standard — again a design-envelope
 *  check, not the hard clamp. */
const RATE_MIN = 0;
const RATE_MAX = 0.30;

/**
 * Seeds that broke the design envelope above under this exact sweep. Per
 * plan §R1, a violation here is a signal to investigate — NOT license to
 * retune monetary.ts's hand-tuned constants to paper over it. Empty as of
 * this writing: none of seeds 1–20 broke the envelope over 100 years (see
 * the handoff report for the observed ranges). Keep this list if/when a
 * seed does violate, with a one-line note of which bound and where.
 */
const EXCLUDED_SEEDS = new Set<number>([]);

describe('Monetary system — design-envelope sweep (plan §R1)', () => {
  for (let seed = 1; seed <= SEED_COUNT; seed++) {
    if (EXCLUDED_SEEDS.has(seed)) continue;

    it(`seed ${seed}: inflation and interest rates stay within the design envelope over ${YEARS} years`, () => {
      const r = nation(seed);
      for (let year = 0; year < YEARS; year++) {
        tickOneYear(r);

        expect(Number.isFinite(r.inflationRate), `seed ${seed} year ${year}: inflationRate not finite`).toBe(true);
        expect(r.inflationRate, `seed ${seed} year ${year}: inflationRate below envelope`).toBeGreaterThanOrEqual(INFLATION_MIN);
        expect(r.inflationRate, `seed ${seed} year ${year}: inflationRate above envelope`).toBeLessThanOrEqual(INFLATION_MAX);

        expect(Number.isFinite(r.policyRate), `seed ${seed} year ${year}: policyRate not finite`).toBe(true);
        expect(r.policyRate, `seed ${seed} year ${year}: policyRate below envelope`).toBeGreaterThanOrEqual(RATE_MIN);
        expect(r.policyRate, `seed ${seed} year ${year}: policyRate above envelope`).toBeLessThanOrEqual(RATE_MAX);

        expect(Number.isFinite(r.bondRate), `seed ${seed} year ${year}: bondRate not finite`).toBe(true);
        expect(r.bondRate, `seed ${seed} year ${year}: bondRate below envelope`).toBeGreaterThanOrEqual(RATE_MIN);
        expect(r.bondRate, `seed ${seed} year ${year}: bondRate above envelope`).toBeLessThanOrEqual(RATE_MAX);
      }
    });
  }
});

import { describe, expect, it } from 'vitest';

import { RegionSim } from '../src/sim/region';
import type { RivalNation } from '../src/sim/region';

function makeRegion(seed: number): RegionSim {
  return RegionSim.create(seed, { aiDifficulty: 'normal', currencySymbol: '$' });
}

function ensureRival(r: RegionSim): RivalNation {
  if (r.rivals.length === 0) {
    (r as unknown as { spawnRival: () => void }).spawnRival();
  }
  return r.rivals[0];
}

describe('counterOffer (spec §M2)', () => {
  it('is a no-op when the rival has no standing offer', () => {
    const r = makeRegion(1);
    const rv = ensureRival(r);
    const result = r.counterOffer(rv.id);
    expect(result).toEqual({ accepted: false, gift: 0 });
  });

  it('accept path: treaty signed, treasury up by the gift, offer withdrawn, relations +2', () => {
    const r = makeRegion(1);
    const rv = ensureRival(r);
    // Personality/relations pushed to the accept-favoring extreme so p clamps to 0.9.
    // (90, not 100, so the post-accept +2 relations bump stays inside clampRel's ±100 band.)
    rv.relations = 90;
    rv.weights.commerce = 10;
    rv.weights.honor = 10;
    rv.weights.grudge = 0;
    rv.pop = 5000;
    r.offers.push({ rivalId: rv.id, kind: 'trade_agreement', expiresDay: r.day + 180 });
    const treasuryBefore = r.treasury;
    const relationsBeforeCounter = rv.relations;

    const result = r.counterOffer(rv.id);

    expect(result.accepted).toBe(true);
    expect(result.gift).toBe(Math.round(50 + rv.pop * 0.01));
    expect(rv.treaties).toContain('trade_agreement');
    expect(r.treasury).toBeCloseTo(treasuryBefore + result.gift, 6);
    expect(rv.relations).toBe(relationsBeforeCounter + 2);
    expect(r.offerFor(rv.id)).toBeUndefined();
    expect(r.log.some((l) => l.text.includes('sweeten the accord'))).toBe(true);
  });

  it('reject path: no treaty, offer withdrawn, relations -3', () => {
    const r = makeRegion(1);
    const rv = ensureRival(r);
    // Personality/relations pushed to the reject-favoring extreme so p clamps to 0.05.
    // (-90, not -100, so the post-reject -3 relations penalty stays inside clampRel's ±100 band.)
    rv.relations = -90;
    rv.weights.commerce = 0;
    rv.weights.honor = 0;
    rv.weights.grudge = 10;
    r.offers.push({ rivalId: rv.id, kind: 'trade_agreement', expiresDay: r.day + 180 });
    const relationsBeforeCounter = rv.relations;

    const result = r.counterOffer(rv.id);

    expect(result.accepted).toBe(false);
    expect(rv.treaties).not.toContain('trade_agreement');
    expect(rv.relations).toBe(relationsBeforeCounter - 3);
    expect(r.offerFor(rv.id)).toBeUndefined();
    expect(r.log.some((l) => l.text.includes('takes the haggling as an insult'))).toBe(true);
  });
});

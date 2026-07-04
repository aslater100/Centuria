import { describe, expect, it } from 'vitest';

import { RegionSim } from '../src/sim/region';
import type { RivalNation, Notable } from '../src/sim/region';
import { tickNegotiations } from '../src/sim/systems/diplomacy';
import { tickNotableArcs } from '../src/sim/systems/notables';

function makeRegion(seed: number): RegionSim {
  return RegionSim.create(seed, { aiDifficulty: 'normal', currencySymbol: '$' });
}

function ensureRival(r: RegionSim): RivalNation {
  if (r.rivals.length === 0) {
    (r as unknown as { spawnRival: () => void }).spawnRival();
  }
  return r.rivals[0];
}

function standOffer(r: RegionSim, rv: RivalNation): void {
  r.offers.push({ rivalId: rv.id, kind: 'trade_agreement', expiresDay: r.day + 180 });
}

// ---------------------------------------------------------------------------
// Spec 10 §NEG — persistent multi-round negotiation
// ---------------------------------------------------------------------------

describe('§NEG negotiations', () => {
  it('openNegotiation consumes the offer and opens with the player terms', () => {
    const r = makeRegion(3);
    const rv = ensureRival(r);
    standOffer(r, rv);
    const neg = r.openNegotiation(rv.id, 500, 'goodwill');
    expect(neg).not.toBeNull();
    expect(r.offerFor(rv.id)).toBeUndefined();
    expect(neg!.gift).toBe(500);
    expect(neg!.sweetener).toBe('goodwill');
    expect(neg!.round).toBe(1);
    expect(neg!.lastMoveBy).toBe('player');
  });

  it('at most 2 negotiations can be open at once', () => {
    const r = makeRegion(3);
    const rv = ensureRival(r);
    (r as unknown as { spawnRival: () => void }).spawnRival();
    (r as unknown as { spawnRival: () => void }).spawnRival();
    const [a, b, c] = r.rivals;
    for (const x of [a, b, c].filter(Boolean)) standOffer(r, x);
    expect(r.openNegotiation(a.id, 100)).not.toBeNull();
    if (b) expect(r.openNegotiation(b.id, 100)).not.toBeNull();
    if (c) expect(r.openNegotiation(c.id, 100)).toBeNull();
    expect(r.negotiations.length).toBeLessThanOrEqual(2);
  });

  it('negotiations survive a serialize round-trip (schema v3)', () => {
    const r = makeRegion(3);
    const rv = ensureRival(r);
    standOffer(r, rv);
    r.openNegotiation(rv.id, 321, 'goodwill');
    const r2 = RegionSim.deserialize(r.serialize());
    expect(r2.negotiations).toHaveLength(1);
    expect(r2.negotiations[0].gift).toBe(321);
    expect(r2.negotiations[0].sweetener).toBe('goodwill');
  });

  it('round 4 always settles: after the tick the negotiation is gone (accepted or walked)', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const r = makeRegion(seed);
      const rv = ensureRival(r);
      standOffer(r, rv);
      const neg = r.openNegotiation(rv.id, r.negotiationBaseGift(rv) * 2)!;
      neg.round = 4;
      tickNegotiations(r);
      expect(r.negotiations).toHaveLength(0);
    }
  });

  it('a rival-court negotiation expires: withdrawn with a relations ding', () => {
    const r = makeRegion(3);
    const rv = ensureRival(r);
    standOffer(r, rv);
    const neg = r.openNegotiation(rv.id, 100)!;
    neg.lastMoveBy = 'rival';
    neg.expiresDay = r.day; // already due
    const rel = rv.relations;
    tickNegotiations(r);
    expect(r.negotiations).toHaveLength(0);
    expect(rv.relations).toBe(Math.max(-100, rel - 2));
  });

  it('every negotiation terminates within the round cap, and acceptance credits the gift', () => {
    for (const seed of [11, 12, 13, 14, 15]) {
      const r = makeRegion(seed);
      const rv = ensureRival(r);
      rv.pop = 5000;
      standOffer(r, rv);
      const ask = Math.round(r.negotiationBaseGift(rv) * 1.2);
      r.openNegotiation(rv.id, ask);
      const treasuryBefore = r.treasury;
      let months = 0;
      while (r.negotiations.length > 0 && months < 12) {
        // If the rival countered, the player stubbornly re-counters at the original ask.
        const neg = r.negotiations[0];
        if (neg.lastMoveBy === 'rival') r.recounterNegotiation(neg.id, ask);
        tickNegotiations(r);
        months++;
      }
      expect(r.negotiations).toHaveLength(0);
      if (rv.treaties.includes('trade_agreement')) {
        expect(r.treasury).toBeGreaterThan(treasuryBefore);
      }
    }
  });

  it('lowball asks are accepted at least as often as greedy asks (personality pricing)', () => {
    let lowAccepts = 0;
    let highAccepts = 0;
    for (let seed = 100; seed < 160; seed++) {
      for (const [ask, bucket] of [[0.8, 'low'], [2.5, 'high']] as const) {
        const r = makeRegion(seed);
        const rv = ensureRival(r);
        rv.pop = 5000;
        standOffer(r, rv);
        r.openNegotiation(rv.id, Math.round(r.negotiationBaseGift(rv) * ask));
        tickNegotiations(r);
        if (rv.treaties.includes('trade_agreement')) {
          if (bucket === 'low') lowAccepts++;
          else highAccepts++;
        }
      }
    }
    expect(lowAccepts).toBeGreaterThan(highAccepts);
  });
});

// ---------------------------------------------------------------------------
// Spec 10 §ARC — notable narrative arcs
// ---------------------------------------------------------------------------

function livingNotables(r: RegionSim): Notable[] {
  return r.notables.filter((n) => n.alive);
}

/** Strip every alive notable of arc-eligible traits so seeding is impossible,
 *  then hand back one subject to configure explicitly. */
function quietWorld(r: RegionSim): Notable {
  for (const n of livingNotables(r)) {
    n.traits = ['cautious'];
    n.arc = null;
    n.age = Math.max(n.age, 30);
  }
  return livingNotables(r)[0];
}

describe('§ARC notable arcs', () => {
  it('never seeds an arc when no notable carries an arc-eligible trait', () => {
    const r = makeRegion(5);
    quietWorld(r);
    for (let m = 0; m < 120; m++) tickNotableArcs(r);
    expect(livingNotables(r).every((n) => !n.arc || n.arc.resolved)).toBe(true);
  });

  it('a due arc always moves: escalates a stage or fizzles resolved, and the chronicle grows', () => {
    for (const seed of [21, 22, 23, 24, 25, 26]) {
      const r = makeRegion(seed);
      const n = quietWorld(r);
      n.traits = ['corrupt'];
      n.arc = { kind: 'scandal', stage: 0, startedDay: r.day, nextBeatDay: r.day, resolved: false };
      const bioBefore = n.bio.length;
      tickNotableArcs(r);
      expect(n.bio.length).toBeGreaterThan(bioBefore);
      const arc = n.arc!;
      expect(arc.resolved ? arc.stage === 0 || arc.stage === 3 : arc.stage === 1).toBe(true);
    }
  });

  it('a scandal that runs to stage 3 disgraces the notable and dents home satisfaction', () => {
    // Loop seeds until one path reaches stage 3 — deterministic per seed, so the
    // first qualifying seed exercises the terminal branch for every future run.
    let terminalSeen = false;
    for (let seed = 30; seed < 90 && !terminalSeen; seed++) {
      const r = makeRegion(seed);
      const n = quietWorld(r);
      n.traits = ['corrupt'];
      n.arc = { kind: 'scandal', stage: 0, startedDay: r.day, nextBeatDay: r.day, resolved: false };
      for (let m = 0; m < 40 && !n.arc!.resolved; m++) {
        n.arc!.nextBeatDay = r.day; // force each stage due immediately
        tickNotableArcs(r);
      }
      if (n.arc!.stage === 3) {
        terminalSeen = true;
        expect(n.traits).toContain('disgraced');
        expect(n.arc!.resolved).toBe(true);
      }
    }
    expect(terminalSeen).toBe(true);
  });

  it('redemption terminal lifts loyalty and clears the disgrace', () => {
    let terminalSeen = false;
    for (let seed = 30; seed < 120 && !terminalSeen; seed++) {
      const r = makeRegion(seed);
      const n = quietWorld(r);
      n.traits = ['diligent', 'disgraced'];
      n.loyalty = 40;
      n.arc = { kind: 'redemption', stage: 0, startedDay: r.day, nextBeatDay: r.day, resolved: false };
      for (let m = 0; m < 40 && !n.arc!.resolved; m++) {
        n.arc!.nextBeatDay = r.day;
        tickNotableArcs(r);
      }
      if (n.arc!.stage === 3) {
        terminalSeen = true;
        expect(n.traits).not.toContain('disgraced');
        expect(n.loyalty).toBeGreaterThanOrEqual(60);
      }
    }
    expect(terminalSeen).toBe(true);
  });

  it("a feud closes quietly when the opposite number dies", () => {
    const r = makeRegion(7);
    const n = quietWorld(r);
    const others = livingNotables(r).filter((p) => p.id !== n.id);
    expect(others.length).toBeGreaterThan(0);
    const target = others[0];
    n.arc = { kind: 'feud', stage: 1, startedDay: r.day, nextBeatDay: r.day, targetNotableId: target.id, resolved: false };
    target.alive = false;
    tickNotableArcs(r);
    expect(n.arc!.resolved).toBe(true);
  });

  it('the global cap holds: active arcs never exceed the cap (ARC_GLOBAL_CAP=4)', () => {
    const CAP = 4;
    const r = makeRegion(9);
    quietWorld(r);
    const pool = livingNotables(r);
    // Guarantee enough notables, all maximally seed-prone.
    for (const n of pool) n.traits = ['corrupt', 'bold'];
    // Pre-seed the cap with long-running (never-due) arcs so only over-cap seeding could grow it.
    for (const n of pool.slice(0, CAP)) {
      n.arc = { kind: 'scandal', stage: 0, startedDay: r.day, nextBeatDay: r.day + 100000, resolved: false };
    }
    if (pool.length > CAP) {
      for (let m = 0; m < 120; m++) tickNotableArcs(r);
      const active = livingNotables(r).filter((n) => n.arc && !n.arc.resolved).length;
      expect(active).toBeLessThanOrEqual(CAP);
    }
  });

  it('arc state survives a serialize round-trip (schema v3)', () => {
    const r = makeRegion(3);
    const n = quietWorld(r);
    n.arc = { kind: 'ambition', stage: 2, startedDay: r.day, nextBeatDay: r.day + 90, resolved: false };
    const r2 = RegionSim.deserialize(r.serialize());
    const n2 = r2.notables.find((p) => p.id === n.id)!;
    expect(n2.arc).toEqual(n.arc);
  });

  it('every minted notable carries a generated backstory', () => {
    const r = makeRegion(3);
    const t = r.settlements[0];
    const minted = r.mintNotable('Reeve', t.id);
    expect(minted.backstory).toBeTruthy();
    expect(minted.backstory!.length).toBeGreaterThan(20);
  });
});

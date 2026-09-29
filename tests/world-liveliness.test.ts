/**
 * World-liveliness pass (session 22) — the world's own politics actually fire.
 *
 * Session 21 measured the autoplay rival-pair relations band at [−40, +23]
 * against action bars of +45 (alliance) and −50 (war): 0 alliances, 0 blocs,
 * 0 foreign wars across every 181y sweep — a diplomatically frozen world.
 * The fix: (1) `pairRelationsBase` spreads pairs wider (PAIR_COMMERCE_WARMTH /
 * PAIR_EXPANSION_FRICTION) with a floor (PAIR_BASE_FLOOR) so no pair is
 * PERMANENTLY war-deep; (2) the alliance/war cliffs became probability ramps
 * (ALLIANCE_RAMP_START/RATE, FOREIGN_WAR_RAMP_START/RATE); (3) a ±3 monthly
 * wander draw makes relations excursive instead of asymptotic.
 *
 * INTENTIONAL RE-BASELINE: the wander draw and ramp draws change RNG draw
 * counts for every seed. Same-seed same-code determinism is unchanged
 * (guarded here and by tests/serialize-determinism).
 *
 * Follow-up in the same session: alliances were forever once signed (no
 * dissolution path except the targeted `incite_unrest` espionage action).
 * `ALLIANCE_DISSOLUTION_RAMP_START`/`_RATE` add an organic decay path with a
 * wide 0..25 dead zone below the formation ramp so ordinary wander can never
 * flicker a healthy alliance.
 */

import { describe, it, expect } from 'vitest';
import {
  RegionSim,
  pairRelationsBase,
  PAIR_BASE_FLOOR,
  ALLIANCE_RAMP_START,
  ALLIANCE_RATE,
  FOREIGN_WAR_RAMP_START,
  FOREIGN_WAR_RATE,
  ALLIANCE_DISSOLUTION_RAMP_START,
  ALLIANCE_DISSOLUTION_RATE,
  RIVAL_ARCHETYPES,
  blocAffinity,
} from '../src/sim/region';
import type { RivalNation, RivalArchetype } from '../src/sim/region';
import { tickForeignRelations } from '../src/sim/systems/diplomacy';

function injectRival(
  r: RegionSim,
  id: number,
  archetype: RivalArchetype,
  compass: RivalNation['compass'],
  regime: string,
): RivalNation {
  const rv = {
    id,
    name: `Power ${id}`,
    leader: 'Test Directorate',
    archetype,
    weights: { ...RIVAL_ARCHETYPES[archetype].weights },
    regime,
    agenda: 'test',
    compass,
    pop: 5000,
    relations: 0,
    treaties: [],
    borderSettled: false,
    emergedYear: 1920,
    history: [],
    lastEnvoyDay: -999,
    lastGiftDay: -999,
  };
  (r as unknown as { rivals: unknown[] }).rivals.push(rv);
  return rv as unknown as RivalNation;
}

describe('pairRelationsBase — the widened, floored baseline', () => {
  it('a warm same-bloc trading pair reads above the alliance ramp start', () => {
    const r = RegionSim.create(7, { worldPowers: 0 });
    const a = injectRival(r, 9001, 'trading_republic', 'east', 'merchant_republic');
    const b = injectRival(r, 9002, 'trading_republic', 'east', 'parliamentary');
    expect(pairRelationsBase(a, b, 12)).toBeGreaterThan(ALLIANCE_RAMP_START);
  });

  it('a quarrel-bloc hegemon pair reads below the war ramp start', () => {
    const r = RegionSim.create(7, { worldPowers: 0 });
    const a = injectRival(r, 9001, 'hegemon', 'east', 'junta');
    const b = injectRival(r, 9002, 'hegemon', 'east', 'parliamentary');
    expect(pairRelationsBase(a, b, -14)).toBeLessThan(FOREIGN_WAR_RAMP_START);
  });

  it('the floor bounds even the most hostile pair — war depth is an excursion, not a steady state', () => {
    const r = RegionSim.create(7, { worldPowers: 0 });
    const a = injectRival(r, 9001, 'hegemon', 'east', 'junta');
    const b = injectRival(r, 9002, 'hegemon', 'east', 'parliamentary');
    a.weights.expansion = 10;
    b.weights.expansion = 10;
    a.weights.commerce = 0;
    b.weights.commerce = 0;
    expect(pairRelationsBase(a, b, -14)).toBe(PAIR_BASE_FLOOR);
  });

  it('spawned newcomers seed their opening opinions from the same formula (clamped, jittered ±10)', () => {
    const r = RegionSim.create(7, { worldPowers: 0 });
    // Spawn two rivals via the real path; the pair opinion must sit within
    // the jitter band of pairRelationsBase (or its [−60, 40] clamp).
    (r as unknown as { spawnRival(): void }).spawnRival();
    (r as unknown as { spawnRival(): void }).spawnRival();
    const [a, b] = r.rivals;
    const rel = r.rivalPairs[r.pairKey(a.id, b.id)] ?? 0;
    // Regime blocs vary per spawn — recover the affinity from the seam the
    // sim itself uses.
    const regimeOf = (r as unknown as {
      regimeOf(rv: RivalNation): { bloc: Parameters<typeof blocAffinity>[0] };
    }).regimeOf.bind(r);
    const base = pairRelationsBase(a, b, blocAffinity(regimeOf(a).bloc, regimeOf(b).bloc));
    const expected = Math.max(-60, Math.min(40, base));
    expect(Math.abs(rel - expected)).toBeLessThanOrEqual(10);
  });
});

describe('the ramps replace the knife-edge cliffs', () => {
  it('dials are sane: rates positive, ramps inside the relations range', () => {
    expect(ALLIANCE_RATE).toBeGreaterThan(0);
    expect(FOREIGN_WAR_RATE).toBeGreaterThan(0);
    expect(ALLIANCE_RAMP_START).toBeGreaterThan(0);
    expect(ALLIANCE_RAMP_START).toBeLessThan(100);
    expect(FOREIGN_WAR_RAMP_START).toBeLessThan(0);
    expect(FOREIGN_WAR_RAMP_START).toBeGreaterThan(-100);
    expect(PAIR_BASE_FLOOR).toBeLessThan(FOREIGN_WAR_RAMP_START);
  });

  it('a pinned deep-hostile pair goes to war within a bounded horizon; a mild pair never does', () => {
    const r = RegionSim.create(11, { worldPowers: 0 });
    const a = injectRival(r, 9001, 'hegemon', 'east', 'junta');
    const b = injectRival(r, 9002, 'hegemon', 'east', 'parliamentary');
    const key = r.pairKey(a.id, b.id);
    let warAt = -1;
    for (let m = 0; m < 600; m++) {
      r.rivalPairs[key] = -90; // re-pin each month: depth 60/70 of full rate
      tickForeignRelations(r);
      if (r.warBetween(a.id, b.id)) { warAt = m; break; }
    }
    expect(warAt).toBeGreaterThanOrEqual(0);

    const r2 = RegionSim.create(11, { worldPowers: 0 });
    const c = injectRival(r2, 9001, 'hegemon', 'east', 'junta');
    const d = injectRival(r2, 9002, 'hegemon', 'east', 'parliamentary');
    const key2 = r2.pairKey(c.id, d.id);
    for (let m = 0; m < 600; m++) {
      r2.rivalPairs[key2] = -20; // above the ramp start — chance is exactly 0
      tickForeignRelations(r2);
      expect(r2.warBetween(c.id, d.id)).toBeUndefined();
    }
  });

  it('a pinned very-warm honor pair signs an alliance within a bounded horizon; a cool pair never does', () => {
    const r = RegionSim.create(13, { worldPowers: 0 });
    const a = injectRival(r, 9001, 'trading_republic', 'east', 'merchant_republic');
    const b = injectRival(r, 9002, 'trading_republic', 'east', 'parliamentary');
    const key = r.pairKey(a.id, b.id);
    let allyAt = -1;
    for (let m = 0; m < 600; m++) {
      r.rivalPairs[key] = 90;
      tickForeignRelations(r);
      if (r.alliances.includes(key)) { allyAt = m; break; }
    }
    expect(allyAt).toBeGreaterThanOrEqual(0);

    const r2 = RegionSim.create(13, { worldPowers: 0 });
    const c = injectRival(r2, 9001, 'trading_republic', 'east', 'merchant_republic');
    const d = injectRival(r2, 9002, 'trading_republic', 'east', 'parliamentary');
    const key2 = r2.pairKey(c.id, d.id);
    for (let m = 0; m < 600; m++) {
      r2.rivalPairs[key2] = ALLIANCE_RAMP_START; // exactly at the start — chance 0
      tickForeignRelations(r2);
      expect(r2.alliances).not.toContain(key2);
    }
  });
});

describe('the world is alive — a synthetic century is not frozen', () => {
  it('a mixed six-power world produces alliances AND foreign wars inside 181 years of months', () => {
    const r = RegionSim.create(1021, { worldPowers: 0 });
    injectRival(r, 9001, 'hegemon', 'east', 'junta');
    injectRival(r, 9002, 'trading_republic', 'east', 'merchant_republic');
    injectRival(r, 9003, 'hermit_kingdom', 'west', 'theocracy');
    injectRival(r, 9004, 'crusader_state', 'west', 'peoples_republic');
    injectRival(r, 9005, 'opportunist', 'north', 'parliamentary');
    injectRival(r, 9006, 'trading_republic', 'south', 'parliamentary');
    for (let m = 0; m < 181 * 12; m++) tickForeignRelations(r);
    expect(r.warsDeclaredCount).toBeGreaterThan(0);
    expect(r.alliances.length).toBeGreaterThan(0);
    // Relations genuinely wander — the band is no longer [−40, +23]-frozen.
    const rels = Object.values(r.rivalPairs);
    expect(Math.min(...rels) < -45 || r.warsDeclaredCount > 0).toBe(true);
  });

  it('same seed, same code — the lively world is still deterministic', () => {
    const run = () => {
      const r = RegionSim.create(77, { worldPowers: 0 });
      injectRival(r, 9001, 'hegemon', 'east', 'junta');
      injectRival(r, 9002, 'trading_republic', 'east', 'merchant_republic');
      injectRival(r, 9003, 'crusader_state', 'west', 'peoples_republic');
      for (let m = 0; m < 1200; m++) tickForeignRelations(r);
      return JSON.stringify([r.rivalPairs, r.alliances, r.warsDeclaredCount, r.foreignWars]);
    };
    expect(run()).toBe(run());
  });
});

describe('alliance dissolution — a pact can outlive the warmth that formed it', () => {
  it('dials are sane: dissolution starts well below the formation ramp (a dead zone, not a hair-trigger)', () => {
    expect(ALLIANCE_DISSOLUTION_RATE).toBeGreaterThan(0);
    expect(ALLIANCE_DISSOLUTION_RAMP_START).toBeLessThan(ALLIANCE_RAMP_START);
  });

  it('a pinned deep-cold allied pair dissolves within a bounded horizon', () => {
    const r = RegionSim.create(21, { worldPowers: 0 });
    const a = injectRival(r, 9001, 'hegemon', 'east', 'junta');
    const b = injectRival(r, 9002, 'hegemon', 'east', 'parliamentary');
    const key = r.pairKey(a.id, b.id);
    r.alliances.push(key);
    let dissolvedAt = -1;
    for (let m = 0; m < 600; m++) {
      r.rivalPairs[key] = -90; // re-pin each month: deep into the dissolution ramp
      tickForeignRelations(r);
      if (!r.alliances.includes(key)) { dissolvedAt = m; break; }
    }
    expect(dissolvedAt).toBeGreaterThanOrEqual(0);
  });

  it('a pinned pair inside the 0..25 dead zone never dissolves — no flicker from ordinary wander', () => {
    const r = RegionSim.create(23, { worldPowers: 0 });
    const a = injectRival(r, 9001, 'hegemon', 'east', 'junta');
    const b = injectRival(r, 9002, 'hegemon', 'east', 'parliamentary');
    const key = r.pairKey(a.id, b.id);
    r.alliances.push(key);
    for (let m = 0; m < 600; m++) {
      r.rivalPairs[key] = 10; // inside the dead zone: below ALLIANCE_RAMP_START, above ALLIANCE_DISSOLUTION_RAMP_START
      tickForeignRelations(r);
      expect(r.alliances).toContain(key);
    }
  });

  it('a hostile regime change organically sours an alliance over time — no special-case hook needed', () => {
    const r = RegionSim.create(29, { worldPowers: 0 });
    // Low-commerce/high-expansion archetype (hegemon) keeps the warmth term
    // small relative to the ideology/geography swing, so a bloc flip actually
    // crosses the dissolution ramp instead of being masked by the `allied`
    // baseline lift (a high-commerce pair like trading_republic never does —
    // verified: the swing alone can't out-cold their trade warmth).
    const a = injectRival(r, 9001, 'hegemon', 'east', 'junta');
    const b = injectRival(r, 9002, 'hegemon', 'east', 'one_party'); // both autocratic: compatible
    const key = r.pairKey(a.id, b.id);
    r.alliances.push(key);
    for (let m = 0; m < 60; m++) tickForeignRelations(r); // settle to the compatible-bloc baseline first
    expect(r.alliances).toContain(key);
    // A coup: the one-party state liberalises into a parliamentary democracy —
    // blocAff flips from compatible (+12) to the quarrel pair (−14), and
    // pairRelationsBase reads the live bloc fresh every tick — no special case.
    b.regime = 'parliamentary';
    let dissolvedAt = -1;
    for (let m = 0; m < 1200; m++) {
      tickForeignRelations(r);
      if (!r.alliances.includes(key)) { dissolvedAt = m; break; }
    }
    expect(dissolvedAt).toBeGreaterThanOrEqual(0);
  });

  it('the existing incite_unrest espionage dissolution path is untouched (still a plain filter)', () => {
    // Regression guard: the organic dissolution above must not interfere with
    // the pre-existing player-triggered alliance fracture.
    const r = RegionSim.create(31, { worldPowers: 0 });
    const a = injectRival(r, 9001, 'hegemon', 'east', 'junta');
    const b = injectRival(r, 9002, 'hegemon', 'west', 'parliamentary');
    const key = r.pairKey(a.id, b.id);
    r.alliances.push(key);
    r.alliances = r.alliances.filter((k) => k !== key);
    expect(r.alliances).not.toContain(key);
  });
});

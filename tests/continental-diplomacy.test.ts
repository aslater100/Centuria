/**
 * Continental diplomacy (GDD §6.4) — geography enters the world's own politics.
 *
 * Session 21. Rivals are off-map powers looming beyond a compass horizon; the
 * visible map is the player's home region. Powers beyond the SAME horizon are
 * neighbours on one continent (`rivalContinent`/`sameContinent` — the seam
 * Phase C multi-continent will re-implement with real landmasses). Geography
 * amplifies ideology between neighbours (continentTerm in the relations
 * baseline), wars cluster on shared ground (CONTINENT_WAR_MULT vs
 * OVERSEAS_WAR_MULT), and — commit 2 — trade blocs organise by continent.
 *
 * INTENTIONAL RE-BASELINE: bloc membership feeds back into future RNG draw
 * counts, so headless sweeps diverge from HEAD by design (documented in the
 * session-21 handoff). Same-seed same-code runs stay deterministic — guarded
 * here and by tests/serialize-determinism.
 */

import { describe, it, expect } from 'vitest';
import {
  RegionSim,
  rivalContinent,
  sameContinent,
  continentTerm,
  CONTINENT_NEIGHBOR_AFFINITY,
  CONTINENT_NEIGHBOR_FRICTION,
  CONTINENT_WAR_MULT,
  OVERSEAS_WAR_MULT,
  blocAffinity,
} from '../src/sim/region';
import type { RivalNation } from '../src/sim/region';
import { tickForeignRelations } from '../src/sim/systems/diplomacy';

// ---- helpers (the front-occupation.test.ts inject-rival pattern) ----

type RivalOpts = {
  id: number;
  compass: RivalNation['compass'];
  regime?: string;
  weights?: Partial<RivalNation['weights']>;
};

function injectRival(r: RegionSim, opts: RivalOpts): RivalNation {
  const rv = {
    id: opts.id,
    name: `Power ${opts.id}`,
    leader: 'Test Directorate',
    archetype: 'hegemon',
    weights: {
      expansion: 5, commerce: 3, ideology: 3, honor: 3, risk: 5, grudge: 3,
      ...opts.weights,
    },
    regime: opts.regime ?? 'junta',
    agenda: 'test',
    compass: opts.compass,
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

function pairRel(r: RegionSim, a: number, b: number): number {
  return r.rivalPairs[r.pairKey(a, b)] ?? 0;
}

describe('the continent seam (compass horizon = continent, Phase C re-implements)', () => {
  it('rivalContinent is the compass horizon and sameContinent compares it', () => {
    const r = RegionSim.create(42);
    const a = injectRival(r, { id: 9001, compass: 'east' });
    const b = injectRival(r, { id: 9002, compass: 'east' });
    const c = injectRival(r, { id: 9003, compass: 'west' });
    expect(rivalContinent(a)).toBe('east');
    expect(sameContinent(a, b)).toBe(true);
    expect(sameContinent(a, c)).toBe(false);
    expect(sameContinent(b, c)).toBe(false);
  });

  it('continentTerm: nothing across oceans, bond for compatible neighbours, friction for incompatible', () => {
    const r = RegionSim.create(42);
    const a = injectRival(r, { id: 9001, compass: 'north' });
    const b = injectRival(r, { id: 9002, compass: 'north' });
    const c = injectRival(r, { id: 9003, compass: 'south' });
    expect(continentTerm(a, c, 12)).toBe(0);
    expect(continentTerm(a, c, -14)).toBe(0);
    expect(continentTerm(a, b, 12)).toBe(CONTINENT_NEIGHBOR_AFFINITY);
    expect(continentTerm(a, b, 0)).toBe(CONTINENT_NEIGHBOR_AFFINITY);
    expect(continentTerm(a, b, -14)).toBe(-CONTINENT_NEIGHBOR_FRICTION);
  });
});

describe('geography in the relations drift baseline', () => {
  it('compatible neighbours drift closer than the same pair an ocean apart', () => {
    const r = RegionSim.create(42);
    // A/B share the eastern horizon, C is identical but west — junta all
    // round (same regime bloc, blocAffinity +12 ≥ 0 → neighbour bond).
    const a = injectRival(r, { id: 9001, compass: 'east' });
    const b = injectRival(r, { id: 9002, compass: 'east' });
    const c = injectRival(r, { id: 9003, compass: 'west' });
    tickForeignRelations(r);
    const near = pairRel(r, a.id, b.id);
    const far = pairRel(r, a.id, c.id);
    expect(near).toBeGreaterThan(far);
    // One drift step eases 3% of the baseline gap — exactly the affinity term.
    expect(near - far).toBeCloseTo(CONTINENT_NEIGHBOR_AFFINITY * 0.03, 6);
    // And C's two cross-continent pairs read identical baselines.
    expect(far).toBeCloseTo(pairRel(r, b.id, c.id), 6);
  });

  it('incompatible neighbours grind below the same quarrel an ocean apart', () => {
    const r = RegionSim.create(42);
    // A junta (autocratic) beside B parliamentary (liberal) — the quarrel
    // pair (blocAffinity −14 < 0) with a shared border to grind against.
    const a = injectRival(r, { id: 9001, compass: 'east' });
    const b = injectRival(r, { id: 9002, compass: 'east', regime: 'parliamentary' });
    const c = injectRival(r, { id: 9003, compass: 'west', regime: 'parliamentary' });
    expect(blocAffinity('autocratic', 'liberal')).toBeLessThan(0);
    tickForeignRelations(r);
    const near = pairRel(r, a.id, b.id);
    const far = pairRel(r, a.id, c.id);
    expect(near).toBeLessThan(far);
    expect(far - near).toBeCloseTo(CONTINENT_NEIGHBOR_FRICTION * 0.03, 6);
  });
});

describe('wars cluster on shared ground', () => {
  it('the dials point the right way', () => {
    expect(CONTINENT_WAR_MULT).toBeGreaterThan(1);
    expect(OVERSEAS_WAR_MULT).toBeLessThan(1);
    expect(OVERSEAS_WAR_MULT).toBeGreaterThan(0);
  });

  it('hostile neighbours come to blows measurably more often than hostile distant powers', () => {
    const hostile = { expansion: 8, commerce: 0, honor: 0, risk: 8, grudge: 5 };
    const countWars = (compassB: RivalNation['compass']): number => {
      const r = RegionSim.create(7);
      const a = injectRival(r, { id: 9001, compass: 'east', weights: hostile });
      const b = injectRival(r, { id: 9002, compass: compassB, weights: hostile });
      const key = r.pairKey(a.id, b.id);
      let wars = 0;
      for (let m = 0; m < 800; m++) {
        r.rivalPairs[key] = -60; // re-pin: drift keeps it < −50, the war gate
        r.foreignWars = [];
        tickForeignRelations(r);
        if (r.foreignWars.length > 0) wars++;
      }
      return wars;
    };
    const near = countWars('east');
    const far = countWars('west');
    // p ≈ 0.081 × 1.5 vs × 0.6 over 800 pinned months — a wide, stable gap.
    expect(near).toBeGreaterThan(far * 1.5);
    expect(far).toBeGreaterThan(0); // overseas wars are rarer, not extinct
  });
});

describe('determinism (same seed, same code → same world)', () => {
  it('two same-seed runs of the geography-aware drift stay byte-identical', () => {
    const run = (): string => {
      const r = RegionSim.create(1000);
      injectRival(r, { id: 9001, compass: 'east' });
      injectRival(r, { id: 9002, compass: 'east', regime: 'parliamentary' });
      injectRival(r, { id: 9003, compass: 'west' });
      for (let m = 0; m < 240; m++) tickForeignRelations(r);
      return JSON.stringify([r.rivalPairs, r.alliances, r.foreignWars.length]);
    };
    expect(run()).toBe(run());
  });
});

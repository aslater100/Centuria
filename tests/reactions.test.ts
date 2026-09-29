import { describe, expect, it } from 'vitest';
import { RegionSim, REGION_MINUTES_PER_TICK } from '../src/sim/region';
import { MINUTES_PER_DAY } from '../src/sim/defs';
import { issue } from '../src/sim/commands';
import { recordDeed, reputation, deedSalience, DEED_HALF_LIFE_DAYS } from '../src/sim/memory';
import { REACTION_RULES, reactionChance, listActors } from '../src/sim/reactions';

function runDays(r: RegionSim, days: number): void {
  const ticks = Math.round((days * MINUTES_PER_DAY) / REGION_MINUTES_PER_TICK);
  for (let i = 0; i < ticks; i++) r.tick();
}

/** Key-order-insensitive JSON (a reload may reorder object keys). */
function canonical(json: string): string {
  const sortKeys = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]));
    }
    return v;
  };
  return JSON.stringify(sortKeys(JSON.parse(json)));
}

function withRivals(seed = 5, n = 3): RegionSim {
  const r = RegionSim.create(seed);
  for (let i = 0; i < n; i++) r.spawnRival();
  return r;
}

describe('Memory & reactions (Centuria 2.0 §B/§C)', () => {
  it('every reaction rule references a valid deed and delay window', () => {
    for (const rule of REACTION_RULES) {
      expect(rule.delay[0]).toBeLessThanOrEqual(rule.delay[1]);
      expect(rule.text.length).toBeGreaterThan(0);
    }
  });

  it('a war against a power draws its fury within days, and it remembers why', () => {
    const r = withRivals();
    const rv = r.rivals[0];
    const before = rv.relations;
    recordDeed(r, { tag: 'aggression', weight: 3, targetKind: 'rival', targetId: rv.id });
    expect(r.pendingReactions.some((p) => p.actorId === rv.id && p.ruleId === 'war_victim_fury')).toBe(true);
    runDays(r, 12);
    expect(rv.relations).toBeLessThan(before);
    expect(rv.opinion?.[0]?.tag).toBe('aggression');
    expect(rv.opinion?.[0]?.delta).toBeLessThan(0);
    expect(r.log.some((l) => l.text.includes(rv.name))).toBe(true);
  });

  it('issued commands become deeds (sanctions provoke the target)', () => {
    const r = withRivals();
    r.stateProclaimed = true;
    const rv = r.rivals[0];
    const res = issue(r, 'imposeSanction', rv.id);
    expect(res.ok).toBe(true);
    expect(r.deeds.some((d) => d.tag === 'sanction' && d.targetId === rv.id)).toBe(true);
  });

  it('failed commands leave no deed', () => {
    const r = withRivals();
    r.stateProclaimed = false;
    issue(r, 'imposeSanction', r.rivals[0].id);
    expect(r.deeds.length).toBe(0);
  });

  it('personality shapes who answers: a humanitarian quirk raises crackdown outrage', () => {
    const r = withRivals(9, 2);
    const [a] = listActors(r).filter((x) => x.kind === 'rival');
    if (a.kind !== 'rival') throw new Error('expected rival');
    const rule = REACTION_RULES.find((x) => x.id === 'crackdown_humanitarian')!;
    const deed = { id: 1, day: r.day, tag: 'crackdown' as const, weight: 2 };
    a.rv.identity = { ...a.rv.identity!, quirks: ['pragmatist'] };
    const plain = reactionChance(r, rule, a, deed);
    a.rv.identity = { ...a.rv.identity!, quirks: ['humanitarian'] };
    expect(reactionChance(r, rule, a, deed)).toBeGreaterThan(plain);
  });

  it('deeds fade and shape reputation', () => {
    const r = withRivals();
    const d = recordDeed(r, { tag: 'broke_treaty', weight: 3 });
    expect(reputation(r).trustworthy).toBeLessThan(0);
    expect(deedSalience(d, d.day + DEED_HALF_LIFE_DAYS)).toBeCloseTo(1.5, 5);
  });

  it('reactions are deterministic and survive a save mid-flight', () => {
    const make = () => {
      const r = withRivals(21);
      recordDeed(r, { tag: 'aggression', weight: 3, targetKind: 'rival', targetId: r.rivals[1].id });
      runDays(r, 5);
      return r;
    };
    const a = make();
    const b = RegionSim.deserialize(make().serialize());
    runDays(a, 60);
    runDays(b, 60);
    expect(canonical(b.serialize())).toBe(canonical(a.serialize()));
  });
});

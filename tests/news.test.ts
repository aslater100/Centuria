import { describe, expect, it } from 'vitest';
import { RegionSim } from '../src/sim/region';
import { expand } from '../src/sim/narrative/grammar';
import { classify, headline, registerFor, masthead } from '../src/sim/narrative/press';
import { newsFeed, briefHeadline } from '../src/sim/news';
import { agenda, agendaDemandsPause } from '../src/sim/agenda';
import { recordDeed } from '../src/sim/memory';

describe('Press & news (Centuria 2.0 §E)', () => {
  it('grammar expansion is deterministic per key and honours vars', () => {
    const g = { s: ['a #x#', 'b #x#'], x: ['1', '2'] };
    expect(expand(g, '#s#', 'k1')).toBe(expand(g, '#s#', 'k1'));
    expect(expand(g, '#who.upper#', 'k', { who: 'Varnesia' })).toBe('VARNESIA');
  });

  it('the press register follows the century', () => {
    expect(registerFor(1920)).toBe('broadsheet');
    expect(registerFor(1960)).toBe('wire');
    expect(registerFor(1990)).toBe('broadcast');
    expect(registerFor(2040)).toBe('feed');
    expect(masthead(1920, 'Founders Rest', 1)).toMatch(/Founders Rest/);
    expect(headline('war', 'Kest', 1920, 'x')).toMatch(/KEST|GUNS/);
  });

  it('log prefixes classify into news categories', () => {
    expect(classify('WAR: Kest marches.').cat).toBe('war');
    expect(classify('FRONTIER: our border advances.').cat).toBe('frontier');
    expect(classify('REVOLUTION in Kest: the crown falls.').body).toBe('The crown falls.');
    expect(classify('A quiet harvest.').cat).toBe('domestic');
  });

  it('briefs headline themselves from their first clause', () => {
    expect(briefHeadline('Drought strikes Portside — Dry weeks bake the fields.', 1990)).toBe('Drought strikes Portside');
  });

  it('reactions reach the feed with the speaking power attached', () => {
    const r = RegionSim.create(5);
    r.spawnRival();
    const rv = r.rivals[0];
    recordDeed(r, { tag: 'aggression', weight: 3, targetKind: 'rival', targetId: rv.id });
    for (let i = 0; i < 48 * 12; i++) r.tick();
    const item = newsFeed(r).find((n) => n.cat === 'reaction');
    expect(item?.actor).toEqual({ kind: 'rival', id: rv.id });
    expect(item?.subject).toBe(rv.name);
  });

  it('the agenda surfaces fresh foreign reactions and asks for a pause on urgent matters', () => {
    const r = RegionSim.create(5);
    r.spawnRival();
    recordDeed(r, { tag: 'broke_treaty', weight: 3, targetKind: 'rival', targetId: r.rivals[0].id });
    for (let i = 0; i < 48 * 12; i++) r.tick();
    const items = agenda(r);
    expect(items.some((i) => i.kind === 'reaction')).toBe(true);
    expect(agendaDemandsPause(items)).toBe(true);
  });
});

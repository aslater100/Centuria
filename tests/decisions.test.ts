import { describe, expect, it } from 'vitest';
import { RegionSim } from '../src/sim/region';
import { issue } from '../src/sim/commands';
import { DECISION_EVENTS, validateEvents, activateEvent, eventDef } from '../src/sim/events/decisions';
import { evalTrigger } from '../src/sim/events/trigger';
import { agenda } from '../src/sim/agenda';

describe('Decision events & trigger DSL (Centuria 2.0 §D)', () => {
  it('all shipped events validate', () => {
    expect(validateEvents()).toEqual([]);
    expect(DECISION_EVENTS.length).toBeGreaterThan(5);
  });

  it('the trigger DSL composes', () => {
    const r = RegionSim.create(2);
    expect(evalTrigger(r, { all: [{ year: { gte: 1900 } }, { not: { flag: 'atWar' } }] })).toBe(true);
    expect(evalTrigger(r, { any: [{ stat: 'towns', gte: 99 }, { eventFlag: 'nope' }] })).toBe(false);
  });

  it('a choice applies effects, records its deed and schedules the chain', () => {
    const r = RegionSim.create(2);
    const def = eventDef('strike_wave')!;
    activateEvent(r, def);
    expect(agenda(r).find((i) => i.kind !== 'milestone')?.kind).toBe('decision');
    expect(issue(r, 'chooseEventOption', 'strike_wave', 1)).toBe(true);
    expect(r.activeDecisions.length).toBe(0);
    expect(r.deeds.some((d) => d.tag === 'crackdown')).toBe(true);
    expect(r.eventFlags).toContain('broke_the_strike');
    expect(r.scheduledEvents[0].eventId).toBe('strike_martyrs');
    expect(RegionSim.deserialize(r.serialize()).scheduledEvents).toEqual(r.scheduledEvents);
  });

  it('ignored decisions resolve themselves with the default option', () => {
    const r = RegionSim.create(2);
    activateEvent(r, eventDef('strike_wave')!);
    for (let i = 0; i < 48 * 100; i++) r.tick();
    expect(r.activeDecisions.some((a) => a.eventId === 'strike_wave')).toBe(false);
  });

  it('a distant seceding town proclaims a new nation', () => {
    const r = RegionSim.create(2);
    const home = r.settlements.find((s) => s.factionId === r.playerFactionId)!;
    const far = { ...home, id: 9_999, name: 'Farhold', x: Math.min(98, home.x + 40), y: home.y, grievance: 90 };
    r.settlements.push(far);
    r.faction(r.playerFactionId)!.settlementIds.push(far.id);
    for (const f of r.regionalFactions) if (f.id !== r.playerFactionId) f.settlementIds = [];
    const before = r.regionalFactions.length;
    expect(r.secedeSettlement(far)).toBe(true);
    expect(r.regionalFactions.length).toBe(before + 1);
    const nf = r.regionalFactions[r.regionalFactions.length - 1];
    expect(nf.name).toMatch(/Farhold/);
    expect(far.factionId).toBe(nf.id);
    expect(r.deeds.some((d) => d.tag === 'secession')).toBe(true);
  });
});

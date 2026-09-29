import { describe, expect, it } from 'vitest';
import { RegionSim, REGION_MINUTES_PER_TICK } from '../src/sim/region';
import { MINUTES_PER_DAY } from '../src/sim/defs';
import { issue, onCommand, replay } from '../src/sim/commands';

function runDays(r: RegionSim, days: number): void {
  const ticks = Math.round((days * MINUTES_PER_DAY) / REGION_MINUTES_PER_TICK);
  for (let i = 0; i < ticks; i++) r.tick();
}

describe('Command layer (Centuria 2.0 §A)', () => {
  it('issue() records the command and applies it', () => {
    const r = RegionSim.create(7);
    const town = r.settlements[0];
    issue(r, 'setTownFocus', town.id, 'industry');
    expect(town.focus).toBe('industry');
    expect(r.commandLog).toEqual([{ day: r.day, name: 'setTownFocus', args: [town.id, 'industry'] }]);
  });

  it('the command log survives a save round-trip', () => {
    const r = RegionSim.create(7);
    issue(r, 'setRouteBudget', 2);
    const back = RegionSim.deserialize(r.serialize());
    expect(back.commandLog).toEqual(r.commandLog);
  });

  it('listeners observe every issued command', () => {
    const r = RegionSim.create(7);
    const seen: string[] = [];
    const off = onCommand((_r, cmd) => seen.push(cmd.name));
    issue(r, 'setRouteBudget', 1);
    off();
    issue(r, 'setRouteBudget', 2);
    expect(seen).toEqual(['setRouteBudget']);
  });

  it('same seed + replayed command tape reproduces the same save', () => {
    const a = RegionSim.create(11);
    runDays(a, 10);
    issue(a, 'setTownFocus', a.settlements[0].id, 'agriculture');
    runDays(a, 40);
    issue(a, 'setRouteBudget', 2);
    runDays(a, 40);

    const b = RegionSim.create(11);
    const tape = [...a.commandLog];
    let next = 0;
    const endDay = a.day;
    while (b.day < endDay || b.minute < a.minute) {
      while (next < tape.length && tape[next].day === b.day) replay(b, tape[next++]);
      b.tick();
    }
    b.commandLog = tape;
    expect(b.serialize()).toBe(a.serialize());
  });
});

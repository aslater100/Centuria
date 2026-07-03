import { describe, it, expect } from 'vitest';
import { RegionSim } from '../src/sim/region';
import { tickHistoricalAnchors } from '../src/sim/systems/historical';
import { MINUTES_PER_DAY } from '../src/sim/defs';

function makeNation(seed = 42): RegionSim {
  const r = RegionSim.create(seed);
  r.stateProclaimed = true;
  r.nationProclaimed = true;
  r.treasury = 2000;
  return r;
}

/** Force r.day to an exact value (day is derived from minute) and run one anchor tick. */
function tickAtDay(r: RegionSim, day: number): void {
  r.minute = day * MINUTES_PER_DAY;
  tickHistoricalAnchors(r);
}

type Internals = RegionSim & {
  worldWarFired: boolean;
  oilShockFired: boolean;
  crashFired: boolean;
  crashMonthCounter: number;
  pandemicFired: boolean;
  foreignWars: { a: number; b: number; startedDay: number; endsDay: number }[];
  rawEmbargoes: Record<string, { until: number; cut: number }>;
  spawnRival(): void;
};

describe('Historical anchor follow-up beats (LOG-ONLY)', () => {
  it('world war: fires a mid-war and an armistice beat at the derived days, and only then', () => {
    const r = makeNation() as Internals;
    r.spawnRival();
    r.spawnRival();
    const [a, b] = r.rivals;
    r.worldWarFired = true;
    r.foreignWars.push({ a: a.id, b: b.id, startedDay: 3000, endsDay: 3480 });

    tickAtDay(r, 3000); // trigger day itself — neither follow-up yet
    expect(r.log.some((l) => l.text.includes('THE LONG FRONT'))).toBe(false);
    expect(r.log.some((l) => l.text.includes('THE ARMISTICE'))).toBe(false);

    tickAtDay(r, 3240); // rounded midpoint of the window
    expect(r.log.some((l) => l.text.includes('THE LONG FRONT'))).toBe(true);
    expect(r.log.some((l) => l.text.includes('THE ARMISTICE'))).toBe(false);

    tickAtDay(r, 3480); // endsDay
    expect(r.log.some((l) => l.text.includes('THE ARMISTICE'))).toBe(true);
  });

  it('oil shock: fires a mid-embargo and a taps-reopen beat off rawEmbargoes.until', () => {
    const r = makeNation() as Internals;
    r.oilShockFired = true;
    r.rawEmbargoes['oil'] = { until: 5400, cut: 0.6 };

    tickAtDay(r, 5220); // one tick before midpoint
    expect(r.log.some((l) => l.text.includes('THE LONG QUEUE'))).toBe(false);

    tickAtDay(r, 5310); // until - OIL_EMBARGO_DAYS/2
    expect(r.log.some((l) => l.text.includes('THE LONG QUEUE'))).toBe(true);
    expect(r.log.some((l) => l.text.includes('THE TAPS REOPEN'))).toBe(false);

    tickAtDay(r, 5400); // until
    expect(r.log.some((l) => l.text.includes('THE TAPS REOPEN'))).toBe(true);
  });

  it('depression: fires a long-winter and a slow-mend beat off crashMonthCounter', () => {
    const r = makeNation() as Internals;
    r.crashFired = true;

    r.crashMonthCounter = 14;
    tickHistoricalAnchors(r);
    expect(r.log.some((l) => l.text.includes('THE LONG WINTER'))).toBe(false);

    r.crashMonthCounter = 15;
    tickHistoricalAnchors(r);
    expect(r.log.some((l) => l.text.includes('THE LONG WINTER'))).toBe(true);
    expect(r.log.some((l) => l.text.includes('THE SLOW MEND'))).toBe(false);

    r.crashMonthCounter = 30;
    tickHistoricalAnchors(r);
    expect(r.log.some((l) => l.text.includes('THE SLOW MEND'))).toBe(true);
  });

  it('pandemic: fires a quiet-streets and an all-clear beat off the wave\'s untilDay', () => {
    const r = makeNation() as Internals;
    r.pandemicFired = true;
    r.researched.delete('antibiotics');
    r.researched.delete('welfare_state');
    r.settlements[0].activeEvents.push({ kind: 'pandemic_wave', untilDay: 8100, severity: 1 });

    tickAtDay(r, 8010); // one tick before midpoint (no antibiotics -> halfDuration=60)
    expect(r.log.some((l) => l.text.includes('THE QUIET STREETS'))).toBe(false);

    tickAtDay(r, 8040); // untilDay - 60
    expect(r.log.some((l) => l.text.includes('THE QUIET STREETS'))).toBe(true);
    expect(r.log.some((l) => l.text.includes('THE ALL-CLEAR'))).toBe(false);

    tickAtDay(r, 8070); // untilDay - 30, the last still-visible tick
    expect(r.log.some((l) => l.text.includes('THE ALL-CLEAR'))).toBe(true);
  });

  it('none of the follow-up beats change any numeric state', () => {
    const r = makeNation() as Internals;
    r.spawnRival();
    r.spawnRival();
    const [a, b] = r.rivals;
    r.worldWarFired = true;
    r.oilShockFired = true;
    r.crashFired = true;
    r.pandemicFired = true;
    r.foreignWars.push({ a: a.id, b: b.id, startedDay: 3000, endsDay: 3480 });
    r.rawEmbargoes['oil'] = { until: 5400, cut: 0.6 };
    r.crashMonthCounter = 15;
    r.researched.delete('antibiotics');
    r.researched.delete('welfare_state');
    r.settlements[0].activeEvents.push({ kind: 'pandemic_wave', untilDay: 8100, severity: 1 });

    const snapshot = {
      treasury: r.treasury,
      confidence: r.confidence,
      inflationRate: r.inflationRate,
      depressionDepth: r.depressionDepth,
      exportEarningsLastMonth: r.exportEarningsLastMonth,
    };

    tickAtDay(r, 3240);
    tickAtDay(r, 5310);
    tickAtDay(r, 8040);
    tickHistoricalAnchors(r);

    expect(r.treasury).toBe(snapshot.treasury);
    expect(r.confidence).toBe(snapshot.confidence);
    expect(r.inflationRate).toBe(snapshot.inflationRate);
    expect(r.depressionDepth).toBe(snapshot.depressionDepth);
    expect(r.exportEarningsLastMonth).toBe(snapshot.exportEarningsLastMonth);
  });
});

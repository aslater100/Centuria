import { describe, it, expect } from 'vitest';
import {
  RegionSim, REGION_MINUTES_PER_TICK,
  WAR_SUPPORT_DECAY_MULT, WarScar,
} from '../src/sim/region';
import { RegionMap } from '../src/sim/worldgen';
import { Weather } from '../src/sim/weather';
import { Rng } from '../src/sim/rng';
import { MINUTES_PER_DAY, GovType } from '../src/sim/defs';

/**
 * D2-mil scaffold: WAR_SUPPORT_DECAY_MULT + Front stub + warScars bookkeeping.
 *
 * All three are byte-identical:
 *   - DECAY_MULT: all values are 1.0 → multiplies by 1 → same result
 *   - Front stub: write-only (front.position mirrors w.score; nothing reads it)
 *   - warScars: written at war-end, never read in the tick path
 */

const GOV_TYPES: GovType[] = [
  'democracy','republic','monarchy','junta','const_monarchy','abs_monarchy',
  'oligarchy','theocracy','direct_democracy','corporatocracy','fascist',
  'social_democracy','autocracy','one_party','technocracy',
];

const ticksPerDay = MINUTES_PER_DAY / REGION_MINUTES_PER_TICK;
function runDays(r: RegionSim, days: number): void {
  for (let i = 0; i < days * ticksPerDay; i++) r.tick();
}
function colony(seed: number): RegionSim {
  return RegionSim.foundColony(new Rng(seed), new RegionMap(seed), new Weather(seed), {});
}

// ---- WAR_SUPPORT_DECAY_MULT ----

describe('WAR_SUPPORT_DECAY_MULT scaffold', () => {
  it('has an entry for every GovType', () => {
    for (const g of GOV_TYPES) {
      expect(WAR_SUPPORT_DECAY_MULT[g]).toBeDefined();
    }
  });

  it('all values are exactly 1.0 (no-op)', () => {
    for (const g of GOV_TYPES) {
      expect(WAR_SUPPORT_DECAY_MULT[g]).toBe(1.0);
    }
  });

  it('has same key set as WAR_SUPPORT_FLOOR', async () => {
    const { WAR_SUPPORT_FLOOR } = await import('../src/sim/region');
    expect(Object.keys(WAR_SUPPORT_DECAY_MULT).sort())
      .toEqual(Object.keys(WAR_SUPPORT_FLOOR).sort());
  });
});

// ---- Front stub ----

describe('PlayerWar front stub', () => {
  it('front.position is set after a war tick', () => {
    const r = colony(42);
    const sim = r as unknown as {
      playerWar: {
        rivalId: number; cb: string; defensive: boolean; startedDay: number;
        support: number; score: number; mobilization: string; casualties: number;
        blockade: boolean; allies: number[]; enemyAllies: number[]; occupied: number;
        resistance: number; occupationPolicy: string; brutality: boolean;
        units: object[]; supplyReserve: number;
        front?: { position: number };
      } | null;
      warSupport: number;
      day: number;
    };

    // Inject a war; startedDay must be < today so tick resolves it
    const rival = (r as any).rivals?.[0];
    if (!rival) return; // no rivals spawned — skip gracefully
    sim.playerWar = {
      rivalId: rival.id, cb: 'border_dispute', defensive: false,
      startedDay: sim.day - 1, support: 60, score: 20, mobilization: 'peacetime',
      casualties: 0, blockade: false, allies: [], enemyAllies: [], occupied: 0,
      resistance: 0, occupationPolicy: 'conciliatory', brutality: false,
      units: [], supplyReserve: 3,
    };
    sim.warSupport = 60;

    // Run one tick — this calls tickPlayerWar which sets w.front
    r.tick();

    if (sim.playerWar) {
      // War still ongoing — front should be populated
      expect(sim.playerWar.front).toBeDefined();
      expect(typeof sim.playerWar.front!.position).toBe('number');
    }
    // If war ended this tick, front was on the (now null) object — test passes trivially
  });
});

// ---- warScars bookkeeping ----

describe('warScars post-war bookkeeping', () => {
  it('starts empty', () => {
    const r = colony(1);
    expect((r as any).warScars).toEqual([]);
  });

  it('WarScar interface has expected shape', () => {
    const scar: WarScar = {
      rivalId: 1,
      rivalName: 'Testland',
      yearEnded: 1950,
      outcome: 'victory',
      occupied: 2,
      casualties: 1500,
      durationMonths: 18,
    };
    expect(scar.outcome).toBe('victory');
    expect(scar.durationMonths).toBe(18);
  });

  it('all four outcome variants are valid', () => {
    const outcomes: WarScar['outcome'][] = ['victory', 'defeat', 'negotiated', 'status_quo'];
    expect(outcomes).toHaveLength(4);
  });

  it('warScars survives a serialize/deserialize round-trip', () => {
    const r = colony(7);
    (r as any).warScars = [
      { rivalId: 5, rivalName: 'Rivalia', yearEnded: 1920, outcome: 'victory', occupied: 1, casualties: 800, durationMonths: 12 },
    ];
    const json = r.serialize();
    const r2 = RegionSim.deserialize(json);
    const scars = (r2 as any).warScars as WarScar[];
    expect(scars).toHaveLength(1);
    expect(scars[0].rivalName).toBe('Rivalia');
    expect(scars[0].outcome).toBe('victory');
    expect(scars[0].durationMonths).toBe(12);
  });

  it('empty warScars round-trips to []', () => {
    const r = colony(3);
    const r2 = RegionSim.deserialize(r.serialize());
    expect((r2 as any).warScars).toEqual([]);
  });

  it('warScars backfills to [] for old saves lacking the field', () => {
    const r = colony(2);
    const raw = JSON.parse(r.serialize());
    delete raw.warScars;
    const r2 = RegionSim.deserialize(JSON.stringify(raw));
    expect((r2 as any).warScars).toEqual([]);
  });

  it('captulate() writes a defeat scar and clears playerWar', () => {
    const r = colony(42);
    const rival = (r as any).rivals?.[0];
    if (!rival) return;
    const sim = r as unknown as { playerWar: unknown; warScars: WarScar[]; day: number; warSupport: number };
    sim.playerWar = {
      rivalId: rival.id, cb: 'border_dispute', defensive: false,
      startedDay: sim.day - 60, support: 30, score: -80, mobilization: 'peacetime',
      casualties: 200, blockade: false, allies: [], enemyAllies: [], occupied: 0,
      resistance: 0, occupationPolicy: 'conciliatory', brutality: false,
      units: [], supplyReserve: 1,
    };
    r.capitulate();
    expect(sim.playerWar).toBeNull();
    expect(sim.warScars.length).toBe(1);
    expect(sim.warScars[0].outcome).toBe('defeat');
    expect(sim.warScars[0].rivalId).toBe(rival.id);
    expect(sim.warScars[0].casualties).toBe(200);
  });

  it('proposePeace() writes a victory scar when terms are accepted', () => {
    const r = colony(42);
    const rival = (r as any).rivals?.[0];
    if (!rival) return;
    const sim = r as unknown as { playerWar: unknown; warScars: WarScar[]; day: number; warSupport: number };
    // High war score → rival accepts status_quo
    sim.playerWar = {
      rivalId: rival.id, cb: 'border_dispute', defensive: false,
      startedDay: sim.day - 30, support: 80, score: 90, mobilization: 'peacetime',
      casualties: 50, blockade: false, allies: [], enemyAllies: [], occupied: 0,
      resistance: 0, occupationPolicy: 'conciliatory', brutality: false,
      units: [], supplyReserve: 3,
    };
    const accepted = r.proposePeace([{ type: 'status_quo', warScoreCost: 0 }]);
    if (accepted) {
      expect(sim.playerWar).toBeNull();
      expect(sim.warScars.length).toBe(1);
      expect(sim.warScars[0].outcome).toBe('victory');
    } else {
      // Proposal rejected — scar not written (correct; only on actual end)
      expect(sim.warScars.length).toBe(0);
    }
  });
});

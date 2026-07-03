import { describe, it, expect } from 'vitest';
import { RegionSim } from '../src/sim/region';
import type { Settlement, ArmyGroup, PlayerWar, ForeignWar } from '../src/sim/region';
import { migrate, warRefugees } from '../src/sim/systems/migration';

/**
 * War refugee migration (GDD §7.4), mirroring the climate-refugee flight in
 * systems/climate.ts: front-line settlements (an enemy army group present)
 * bleed population to the largest safe settlement of the same nation while a
 * war is active. Flight rate: min(1%, 0.1% × severity) per monthly tick —
 * same shape as the climate-refugee gate.
 */

const RIVAL_ID = 9001;

function makeRegion() {
  const r = RegionSim.create(3, {});
  r.stateProclaimed = true;
  r.nationProclaimed = true;

  // Front-line player settlement (source). Pop must clear both the >5 gate
  // AND the movers<0.1 rounding floor at the baseline flight rate (0.1%),
  // i.e. > ~100 souls.
  const front = r.settlements[0];
  front.name = 'Border Town';
  front.cohorts = { bands: [0, 60, 50, 20, 10] }; // ~140 souls

  // Safe player settlement (destination) — larger population
  const safe = structuredClone(front) as Settlement;
  safe.id = front.id + 500;
  safe.name = 'Capital City';
  safe.cohorts = { bands: [0, 200, 100, 50, 20] }; // ~370 souls
  r.settlements.push(safe);

  return { r, front, safe };
}

function forceWar(r: RegionSim, opts: { occupied?: number; brutality?: boolean } = {}): void {
  const w: PlayerWar = {
    rivalId: RIVAL_ID, cb: 'border_dispute', defensive: false, startedDay: -1,
    support: 60, score: 30, mobilization: 'peacetime', casualties: 0,
    blockade: false, allies: [], enemyAllies: [],
    occupied: opts.occupied ?? 0, resistance: 0,
    occupationPolicy: 'conciliatory', brutality: opts.brutality ?? false,
    units: [], supplyReserve: 3,
  };
  r.playerWar = w;
}

function stationEnemyArmy(r: RegionSim, provinceId: number, ownerId: number = RIVAL_ID): void {
  const ag: ArmyGroup = {
    id: 1, ownerId, provinceId, transitDays: 0,
    manpower: 500, equipmentLevel: 50, supply: 1, doctrine: 0, morale: 100,
  };
  r.armyGroups.push(ag);
}

describe('war refugee migration', () => {
  it('no war, no army groups → nothing changes', () => {
    const { r, front, safe } = makeRegion();
    const frontBefore = r.popOf(front);
    const safeBefore = r.popOf(safe);
    migrate(r);
    expect(r.popOf(front)).toBeCloseTo(frontBefore, 5);
    expect(r.popOf(safe)).toBeCloseTo(safeBefore, 5);
  });

  it('war active but no enemy army present → nothing changes (no front line)', () => {
    const { r, front, safe } = makeRegion();
    forceWar(r);
    const frontBefore = r.popOf(front);
    const safeBefore = r.popOf(safe);
    warRefugees(r);
    expect(r.popOf(front)).toBeCloseTo(frontBefore, 5);
    expect(r.popOf(safe)).toBeCloseTo(safeBefore, 5);
  });

  it('enemy army at a settlement with no active war (no playerWar/foreignWars) → nothing changes', () => {
    const { r, front, safe } = makeRegion();
    stationEnemyArmy(r, front.id);
    const frontBefore = r.popOf(front);
    const safeBefore = r.popOf(safe);
    warRefugees(r);
    expect(r.popOf(front)).toBeCloseTo(frontBefore, 5);
    expect(r.popOf(safe)).toBeCloseTo(safeBefore, 5);
  });

  it('war active + enemy army at the front settlement → refugees flow to the largest safe town', () => {
    const { r, front, safe } = makeRegion();
    forceWar(r);
    stationEnemyArmy(r, front.id);
    const frontBefore = r.popOf(front);
    const safeBefore = r.popOf(safe);

    warRefugees(r);

    const frontAfter = r.popOf(front);
    const safeAfter = r.popOf(safe);
    expect(frontAfter).toBeLessThan(frontBefore);
    expect(safeAfter).toBeGreaterThan(safeBefore);
    // Conservation: what left the front arrived at the safe town
    expect(safeAfter - safeBefore).toBeCloseTo(frontBefore - frontAfter, 5);
  });

  it('is dispatched from migrate() (the monthly tick entry point)', () => {
    const { r, front, safe } = makeRegion();
    forceWar(r);
    stationEnemyArmy(r, front.id);
    const frontBefore = r.popOf(front);

    migrate(r);

    expect(r.popOf(front)).toBeLessThan(frontBefore);
  });

  it('active occupation (w.occupied > 0) produces a larger flow than a plain war', () => {
    const { r: r1, front: f1 } = makeRegion();
    forceWar(r1, { occupied: 0 });
    stationEnemyArmy(r1, f1.id);
    const before1 = r1.popOf(f1);
    warRefugees(r1);
    const loss1 = before1 - r1.popOf(f1);

    const { r: r2, front: f2 } = makeRegion();
    forceWar(r2, { occupied: 2 });
    stationEnemyArmy(r2, f2.id);
    const before2 = r2.popOf(f2);
    warRefugees(r2);
    const loss2 = before2 - r2.popOf(f2);

    expect(loss2).toBeGreaterThan(loss1);
  });

  it('brutal occupation policy produces a larger flow than a plain war', () => {
    const { r: r1, front: f1 } = makeRegion();
    forceWar(r1, { brutality: false });
    stationEnemyArmy(r1, f1.id);
    const before1 = r1.popOf(f1);
    warRefugees(r1);
    const loss1 = before1 - r1.popOf(f1);

    const { r: r2, front: f2 } = makeRegion();
    forceWar(r2, { brutality: true });
    stationEnemyArmy(r2, f2.id);
    const before2 = r2.popOf(f2);
    warRefugees(r2);
    const loss2 = before2 - r2.popOf(f2);

    expect(loss2).toBeGreaterThan(loss1);
  });

  it('a front-line settlement with pop ≤ 5 does not bleed refugees', () => {
    const { r, front, safe } = makeRegion();
    front.cohorts = { bands: [0, 2, 1, 0, 0] }; // ~3 souls, below the gate
    forceWar(r);
    stationEnemyArmy(r, front.id);
    const frontBefore = r.popOf(front);
    const safeBefore = r.popOf(safe);
    warRefugees(r);
    expect(r.popOf(front)).toBeCloseTo(frontBefore, 5);
    expect(r.popOf(safe)).toBeCloseTo(safeBefore, 5);
  });

  it('no safe destination (only the front-line settlement exists) → no crash, no phantom pop', () => {
    const { r, front } = makeRegion();
    r.settlements = r.settlements.filter((t) => t.id === front.id);
    forceWar(r);
    stationEnemyArmy(r, front.id);
    const frontBefore = r.popOf(front);
    warRefugees(r);
    expect(r.popOf(front)).toBeCloseTo(frontBefore, 5);
    expect(Number.isFinite(r.popOf(front))).toBe(true);
  });

  it('foreign wars (AI vs AI, no player involvement) also bleed refugees between rival settlements', () => {
    const r = RegionSim.create(3, {});
    r.stateProclaimed = true;
    r.nationProclaimed = true;

    const rivalAId = 9002;
    const rivalBId = 9003;

    const front = r.settlements[0];
    front.name = 'Contested Marches';
    front.factionId = rivalAId;
    front.cohorts = { bands: [0, 60, 50, 20, 10] }; // ~140 souls

    const safe = structuredClone(front) as Settlement;
    safe.id = front.id + 500;
    safe.name = 'Rival Capital';
    safe.factionId = rivalAId;
    safe.cohorts = { bands: [0, 200, 100, 50, 20] };
    r.settlements.push(safe);

    const fw: ForeignWar = { a: rivalAId, b: rivalBId, startedDay: -1, endsDay: 999999 };
    r.foreignWars.push(fw);
    stationEnemyArmy(r, front.id, rivalBId);

    const frontBefore = r.popOf(front);
    const safeBefore = r.popOf(safe);

    warRefugees(r);

    expect(r.popOf(front)).toBeLessThan(frontBefore);
    expect(r.popOf(safe)).toBeGreaterThan(safeBefore);
    // Player faction (0) settlements are untouched by a war it isn't in.
    expect(r.playerWar).toBeNull();
  });
});

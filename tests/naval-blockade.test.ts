/**
 * Wartime naval blockade (spec §M3, docs/specs/09-audit-nine.md).
 *
 * `blockadeMult = 0.65 + 0.35 * min(1, warships / 6)` squeezes the sea-lane
 * term of `navalTradeIncome` while an active player war runs; harbor base
 * income is untouched. Peacetime (`r.playerWar === null`) must stay
 * byte-identical to the pre-change formula, with no extra RNG draw.
 */
import { describe, expect, it } from 'vitest';
import { RegionSim } from '../src/sim/region';
import { Rng } from '../src/sim/rng';
import { navalTradeIncome } from '../src/sim/systems/naval';

function makeRegion(seed: number): RegionSim {
  return RegionSim.create(seed);
}

/** Mark the capital as a harbor town — the sole harbor in this fixture. */
function addHarbor(r: RegionSim): void {
  const home = r.settlements[0];
  if (!home.buildings.includes('harbor')) home.buildings = [...home.buildings, 'harbor'];
}

/** Second player-owned town, standing in as the far end of a sea lane. */
function addOverseasTown(r: RegionSim): number {
  const home = r.settlements[0];
  const id = r.nextId++;
  r.settlements.push({
    ...home,
    id,
    name: `Overseas ${id}`,
    buildings: [],
    placedBuildings: [],
    placedDistricts: [],
    construction: null,
  });
  return id;
}

/** One overseas sea lane between two player towns (path/geometry irrelevant
 *  to navalTradeIncome, which only reads `sea` and the endpoints' owners). */
function addSeaLane(r: RegionSim, a: number, b: number): void {
  r.routes.push({
    a, b, kind: 'trail', condition: 100, path: [], terrainCost: 0,
    freight: 0, cargoType: null, sea: true,
  });
}

/** Force an active player war fielding `warshipCount` warships. */
function forceWar(r: RegionSim, warshipCount: number): void {
  (r as unknown as { playerWar: Record<string, unknown> | null }).playerWar = {
    rivalId: 9001, cb: 'border_dispute', defensive: false, startedDay: -1,
    support: 60, score: 30, mobilization: 'peacetime', casualties: 0,
    blockade: false, allies: [], enemyAllies: [], occupied: 0,
    resistance: 0, occupationPolicy: 'conciliatory', brutality: false,
    units: [{ type: 'warship', count: warshipCount, morale: 100, suppliedDays: 90 }],
    supplyReserve: 3,
  };
}

/** One harbor town + one overseas sea lane — the fixture every case shares. */
function riggedRegion(seed: number): { r: RegionSim; townB: number } {
  const r = makeRegion(seed);
  addHarbor(r);
  const townB = addOverseasTown(r);
  addSeaLane(r, r.settlements[0].id, townB);
  return { r, townB };
}

describe('navalTradeIncome — wartime blockade multiplier (spec §M3)', () => {
  it('war + 0 warships: sea-lane term is scaled by 0.65, harbor term untouched', () => {
    const { r } = riggedRegion(11);
    forceWar(r, 0);
    const before = r.treasury;
    navalTradeIncome(r);

    const perHarbor = 12; // + warships*2, warships = 0
    const perLane = 9;
    const expected = 1 * perHarbor + 1 * perLane * 0.65;
    expect(r.treasury - before).toBeCloseTo(expected, 10);
  });

  it('war + 6 warships: blockade multiplier saturates at 1.0 (min(1, warships/6))', () => {
    const { r } = riggedRegion(12);
    forceWar(r, 6);
    const before = r.treasury;
    navalTradeIncome(r);

    const perHarbor = 12 + 6 * 2;
    const perLane = 9 + 6 * 2;
    // blockadeMult == 1.0 exactly ⇒ same total as if no multiplier existed.
    const expectedUnblockaded = 1 * perHarbor + 1 * perLane;
    expect(r.treasury - before).toBeCloseTo(expectedUnblockaded, 10);
  });

  it('no war: income and RNG draws are byte-identical to the pre-change formula', () => {
    const { r } = riggedRegion(13);
    // r.playerWar stays null (fresh sim, no war started).
    expect(r.playerWar).toBeNull();

    const stateBefore = r.rng.getState();
    const before = r.treasury;
    navalTradeIncome(r);
    const stateAfterActual = r.rng.getState();

    const perHarbor = 12; // warships read from playerWar ?? 0
    const perLane = 9;
    const expected = 1 * perHarbor + 1 * perLane; // blockadeMult === 1, no-op
    expect(r.treasury - before).toBeCloseTo(expected, 10);

    // Determinism guard: replay the exact pre-change draw sequence (a single
    // chance(0.3) roll, and only on a hit, one int() pick of the harbor) and
    // confirm the multiplier branch consumed no extra RNG state.
    const replay = new Rng(0);
    replay.setState(stateBefore);
    const willLog = replay.chance(0.3);
    if (willLog) replay.int(1); // one harbor town in this fixture
    expect(stateAfterActual).toBe(replay.getState());
  });

  it('an intermediate fleet (3 of 6) yields the linear blockade multiplier', () => {
    const { r } = riggedRegion(14);
    forceWar(r, 3);
    const before = r.treasury;
    navalTradeIncome(r);

    const perHarbor = 12 + 3 * 2;
    const perLane = 9 + 3 * 2;
    const mult = 0.65 + 0.35 * (3 / 6);
    const expected = 1 * perHarbor + 1 * perLane * mult;
    expect(r.treasury - before).toBeCloseTo(expected, 10);
  });
});

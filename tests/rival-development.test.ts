import { describe, it, expect } from 'vitest';
import { RegionSim, REGION_BUILDINGS, DISTRICT_DEFS, REGION_MINUTES_PER_TICK } from '../src/sim/region';
import { RegionMap } from '../src/sim/worldgen';
import { Weather } from '../src/sim/weather';
import { Rng } from '../src/sim/rng';
import { MINUTES_PER_DAY, START_YEAR } from '../src/sim/defs';

/**
 * Spatial-4X — rivals PLAY SPATIALLY. Before this, the AI owned land but never
 * built on it: in autoplay no faction ever raised a regular building or zoned a
 * district, so every spatial bonus (terrain-match, district adjacency, district
 * zones) was dormant and the headless balance suite tested a different game than
 * a human plays. Now a rival faction develops its towns each AI update — it
 * raises the era-ready building that best fits a town's land on the hex that
 * MAXIMIZES the realized spatial bonus, and zones a district once a same-sector
 * cluster exists to reward. Funded ONLY from the surplus above a famine floor
 * (RIVAL_DEV_RESERVE_MONTHS), aiRng-gated so the main RNG stream is untouched.
 * Intentional headless re-baseline.
 */

const ticksPerDay = MINUTES_PER_DAY / REGION_MINUTES_PER_TICK;
function runDays(r: RegionSim, days: number): void {
  for (let i = 0; i < days * ticksPerDay; i++) r.tick();
}

type Sector = 'agriculture' | 'industry' | 'services' | 'information';
type Faction = { treasury: number; settlementIds: number[] };
type Settle = {
  id: number; factionId: number; site: { coastal: boolean };
  buildings: string[];
  placedBuildings: { id: string; cell: number }[];
  placedDistricts: { id: string; cell: number }[];
  construction: { id: string; doneDay: number; cell?: number } | null;
};
type Priv = {
  prereqEraYear: (prereq?: string) => number;
  bestPlacementCell: (t: Settle, scoreFn: (cell: number) => number) => number;
  autoPlaceCell: (t: Settle) => number;
  tileYieldFor: (t: Settle) => Record<Sector, number>;
  tryBuildRivalBuilding: (f: Faction, t: Settle, reserve: number) => boolean;
  tryZoneRivalDistrict: (f: Faction, t: Settle, reserve: number) => boolean;
  buildingCount: (t: Settle, id: string) => number;
  cityBuildCost: (def: { cost: number }) => number;
  districtCost: (def: { cost: number }) => number;
  placementPreview: (townId: number, cell: number, defId: string) => { total: number } | null;
};
const priv = (r: RegionSim) => r as unknown as Priv;

function colony(seed: number): RegionSim {
  return RegionSim.foundColony(new Rng(seed), new RegionMap(seed), new Weather(seed), {});
}
const byId = (id: string) => REGION_BUILDINGS.find((b) => b.id === id)!;
const districtById = (id: string) => DISTRICT_DEFS.find((d) => d.id === id)!;

/** A fresh colony whose founding town has a non-empty worked ring (so placement
 *  logic has somewhere to go) — most seeds qualify; assert it to be explicit. */
function townWithRing(seed: number): { r: RegionSim; t: Settle } {
  const r = colony(seed);
  const t = r.settlements[0] as unknown as Settle;
  expect(r.buildablePlacementCells(t.id).length, 'founding town should have a worked ring').toBeGreaterThan(0);
  return { r, t };
}

/** Reference re-implementation of tryBuildRivalBuilding's pick, for an independent
 *  expectation of WHICH building a rival raises (best fit = flat bonus + the town's
 *  terrain yield in that sector). First-wins on ties, mirroring the loop. */
function refPickBuilding(r: RegionSim, t: Settle, faction: Faction, reserve: number): { id: string } | null {
  const P = priv(r);
  const yields = P.tileYieldFor(t);
  let pick: { id: string } | null = null, score = -Infinity;
  for (const b of REGION_BUILDINGS) {
    if (b.unique) continue;
    if (P.buildingCount(t, b.id) >= b.max) continue;
    if (b.coastal_only && !t.site.coastal) continue;
    if (b.prereq && r.year < P.prereqEraYear(b.prereq)) continue;
    if (faction.treasury - P.cityBuildCost(b) < reserve) continue;
    const sy = b.sector === 'all' ? 0 : (yields[b.sector as Sector] ?? 0);
    const s = b.bonus + sy;
    if (s > score) { score = s; pick = b; }
  }
  return pick;
}

// ---- 1. The era gate (rivals lack a researched-node set) ----

describe('rival development — prereq era gate', () => {
  it('maps a prereq tech to its era-year; no prereq → START_YEAR', () => {
    const P = priv(colony(1));
    expect(P.prereqEraYear(undefined)).toBe(START_YEAR);
    expect(P.prereqEraYear('mass_production')).toBe(1922);
    expect(P.prereqEraYear('computing')).toBe(1965);
  });
});

// ---- 2. bestPlacementCell — the AI's spatial brain ----

describe('bestPlacementCell — deterministic max-score siting', () => {
  it('returns the single highest-scoring legal cell', () => {
    const { r, t } = townWithRing(7);
    const cells = r.buildablePlacementCells(t.id);
    const target = cells[Math.floor(cells.length / 2)];
    const best = priv(r).bestPlacementCell(t, (c) => (c === target ? 1 : 0));
    expect(best).toBe(target);
  });

  it('falls back to the autoPlaceCell heuristic (nearest-centre, then index) on a flat tie', () => {
    const { r, t } = townWithRing(7);
    expect(priv(r).bestPlacementCell(t, () => 0)).toBe(priv(r).autoPlaceCell(t));
  });

  it('returns -1 when the worked ring is full', () => {
    const { r, t } = townWithRing(7);
    for (const cell of r.buildablePlacementCells(t.id)) t.placedBuildings.push({ id: 'waterworks', cell });
    expect(priv(r).bestPlacementCell(t, () => 1)).toBe(-1);
  });
});

// ---- 3. tryBuildRivalBuilding — terrain-fit choice + spatial siting ----

describe('tryBuildRivalBuilding — builds to the land, sites on the best hex', () => {
  it('breaks ground on the best-fit building, on the bonus-maximizing cell, debiting the real cost', () => {
    const { r, t } = townWithRing(7);
    const faction: Faction = { treasury: 100_000, settlementIds: [t.id] };
    const expectDef = refPickBuilding(r, t, faction, 0)!;
    expect(expectDef, 'a no-prereq building is available at game start').toBeTruthy();
    // The bonus-maximizing cell, computed on the still-clean ring (before the
    // pending construction occupies it).
    const bestCell = priv(r).bestPlacementCell(t, (c) => priv(r).placementPreview(t.id, c, expectDef.id)?.total ?? -Infinity);

    const before = faction.treasury;
    const ok = priv(r).tryBuildRivalBuilding(faction, t, 0);
    expect(ok).toBe(true);
    expect(t.construction).toBeTruthy();
    expect(t.construction!.id).toBe(expectDef.id);
    expect(t.construction!.cell).toBe(bestCell);
    // paid the player's real (dev-scaled) build cost
    expect(faction.treasury).toBe(before - priv(r).cityBuildCost(byId(expectDef.id)));
  });

  it('respects the per-building max (will not start one already built/under way)', () => {
    const { r, t } = townWithRing(7);
    const faction: Faction = { treasury: 100_000, settlementIds: [t.id] };
    // Pre-stock every non-unique buildable type to its max.
    for (const b of REGION_BUILDINGS) {
      if (b.unique) continue;
      if (b.coastal_only && !t.site.coastal) continue;
      if (b.prereq && r.year < priv(r).prereqEraYear(b.prereq)) continue;
      for (let i = 0; i < b.max; i++) t.buildings.push(b.id);
    }
    expect(priv(r).tryBuildRivalBuilding(faction, t, 0)).toBe(false);
    expect(t.construction).toBeNull();
  });

  it('charges nothing when the ring is full (no legal cell to site on)', () => {
    const { r, t } = townWithRing(7);
    const faction: Faction = { treasury: 100_000, settlementIds: [t.id] };
    // Fill the ring so no legal cell remains → no build, no charge.
    for (const cell of r.buildablePlacementCells(t.id)) t.placedBuildings.push({ id: 'waterworks', cell });
    const before = faction.treasury;
    expect(priv(r).tryBuildRivalBuilding(faction, t, 0)).toBe(false);
    expect(faction.treasury).toBe(before);
  });
});

// ---- 4. The famine-buffer guarantee (the death-spiral lesson) ----

describe('rival development — never spends below the famine floor', () => {
  it('builds NOTHING when the whole treasury sits at/below the reserve', () => {
    const { r, t } = townWithRing(7);
    const faction: Faction = { treasury: 100_000, settlementIds: [t.id] };
    const before = faction.treasury;
    // reserve above the entire treasury → no building is affordable above it.
    const ok = priv(r).tryBuildRivalBuilding(faction, t, faction.treasury + 1);
    expect(ok).toBe(false);
    expect(t.construction).toBeNull();
    expect(faction.treasury).toBe(before); // buffer untouched
  });

  it('zones NOTHING below the reserve even with a qualifying cluster', () => {
    const { r, t } = townWithRing(7);
    const cells = r.buildablePlacementCells(t.id);
    // a 2-building agriculture cluster (qualifies a farming_district by sector)
    t.placedBuildings.push({ id: 'grain_exchange', cell: cells[0] });
    t.placedBuildings.push({ id: 'grain_exchange', cell: cells[1] });
    const faction: Faction = { treasury: 100_000, settlementIds: [t.id] };
    const before = faction.treasury;
    expect(priv(r).tryZoneRivalDistrict(faction, t, faction.treasury + 1)).toBe(false);
    expect(t.placedDistricts.length).toBe(0);
    expect(faction.treasury).toBe(before);
  });
});

// ---- 5. tryZoneRivalDistrict — zones onto an established cluster ----

describe('tryZoneRivalDistrict — rewards an existing cluster', () => {
  it('zones the district matching a ≥2 same-sector cluster, debiting the real cost', () => {
    const { r, t } = townWithRing(7);
    const cells = r.buildablePlacementCells(t.id);
    t.placedBuildings.push({ id: 'grain_exchange', cell: cells[0] });
    t.buildings.push('grain_exchange');
    t.placedBuildings.push({ id: 'grain_exchange', cell: cells[1] }); // 2 agri → farming cluster
    t.buildings.push('grain_exchange');
    const faction: Faction = { treasury: 100_000, settlementIds: [t.id] };
    const before = faction.treasury;

    const ok = priv(r).tryZoneRivalDistrict(faction, t, 0);
    expect(ok).toBe(true);
    expect(t.placedDistricts.length).toBe(1);
    expect(t.placedDistricts[0].id).toBe('farming_district');
    expect(r.canPlaceBuildingAt(t.id, t.placedDistricts[0].cell)).toBe(false); // the zone now occupies its hex
    expect(faction.treasury).toBe(before - priv(r).districtCost(districtById('farming_district')));
  });

  it('does NOT zone without a cluster (a lone same-sector building is not enough)', () => {
    const { r, t } = townWithRing(7);
    const cells = r.buildablePlacementCells(t.id);
    t.placedBuildings.push({ id: 'grain_exchange', cell: cells[0] }); // only 1 agri
    t.buildings.push('grain_exchange');
    const faction: Faction = { treasury: 100_000, settlementIds: [t.id] };
    expect(priv(r).tryZoneRivalDistrict(faction, t, 0)).toBe(false);
    expect(t.placedDistricts.length).toBe(0);
  });

  it('does NOT zone an era-locked district even with its cluster (research_campus needs computing, 1965)', () => {
    const { r, t } = townWithRing(7);
    expect(r.year).toBeLessThan(1965);
    const cells = r.buildablePlacementCells(t.id);
    // an information cluster — the only matching district is research_campus, era-locked
    t.placedBuildings.push({ id: 'university', cell: cells[0] });
    t.buildings.push('university');
    t.placedBuildings.push({ id: 'university', cell: cells[1] });
    t.buildings.push('university');
    const faction: Faction = { treasury: 100_000, settlementIds: [t.id] };
    expect(priv(r).tryZoneRivalDistrict(faction, t, 0)).toBe(false);
    expect(t.placedDistricts.length).toBe(0);
  });
});

// ---- 6. End-to-end: rivals actually build over a real run, deterministically ----

function placementTotals(r: RegionSim): { buildings: number; districts: number; rivalBuildings: number } {
  let buildings = 0, districts = 0, rivalBuildings = 0;
  for (const t of r.settlements) {
    buildings += t.placedBuildings?.length ?? 0;
    districts += t.placedDistricts?.length ?? 0;
    if (t.factionId !== r.playerFactionId) rivalBuildings += t.buildings.length;
  }
  return { buildings, districts, rivalBuildings };
}

describe('rival development — integration', () => {
  it('rivals raise placed buildings (and zone districts) over a century of autoplay', () => {
    const r = colony(1000);
    runDays(r, 60 * 120); // ~120 compressed game-years
    const tot = placementTotals(r);
    expect(tot.rivalBuildings, 'rivals should have raised real buildings').toBeGreaterThan(5);
    expect(tot.buildings, 'those buildings should be spatially placed').toBeGreaterThan(5);
    expect(tot.districts, 'an established cluster should eventually be zoned').toBeGreaterThan(0);
  });

  it('is deterministic — two same-seed runs reach identical placement counts and player markers', () => {
    const a = colony(1007); runDays(a, 60 * 80);
    const b = colony(1007); runDays(b, 60 * 80);
    expect(placementTotals(a)).toEqual(placementTotals(b));
    expect(a.treasury).toBe(b.treasury);
    expect(a.playerPop()).toBe(b.playerPop());
  });
});

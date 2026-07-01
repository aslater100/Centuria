import { describe, it, expect } from 'vitest';
import { RegionSim, REGION_BUILDINGS, REGION_MINUTES_PER_TICK, TECH_TREE } from '../src/sim/region';
import { updateConstruction } from '../src/sim/systems/construction';
import { RegionMap } from '../src/sim/worldgen';
import { Weather } from '../src/sim/weather';
import { Rng } from '../src/sim/rng';
import { MINUTES_PER_DAY, DAYS_PER_YEAR, START_YEAR } from '../src/sim/defs';

/**
 * Spatial-4X Phase D — space Wonders. A short tech ladder (rocketry 1955 →
 * satellites 1965) opens three late-century Wonders: the Space Program, the
 * Satellite Network, and the Orbital Station (capping the existing
 * orbital_industry node, 2090). Pure data: the defs ride the established
 * unique/empireBonus/empireSector/prestige seam and the rival Wonder race picks
 * them up era-gated through the prereq tech's `era` year — so every new Wonder's
 * prereq MUST resolve to a real TECH_TREE id (a missing id silently falls back
 * to START_YEAR and rivals would race for orbit in 1919).
 */

const SPACE_WONDERS = ['space_program', 'satellite_network', 'orbital_station'] as const;

const ticksPerDay = MINUTES_PER_DAY / REGION_MINUTES_PER_TICK;
function runDays(r: RegionSim, days: number): void {
  for (let i = 0; i < days * ticksPerDay; i++) r.tick();
}

type Priv = {
  maybeBuildRivalWonder: (f: unknown, knobs: unknown) => void;
  rivalWonderHost: (f: unknown) => { construction: { id: string; doneDay: number } | null } | null;
  wonderEraYear: (def: unknown) => number;
  wonderBonus: (t: { factionId: number }, sector: string) => number;
};
const priv = (r: RegionSim) => r as unknown as Priv;

function colony(seed: number): RegionSim {
  const r = RegionSim.foundColony(new Rng(seed), new RegionMap(seed), new Weather(seed), {});
  r.treasury = 1_000_000;
  return r;
}

const byId = (id: string) => REGION_BUILDINGS.find((b) => b.id === id)!;
const nodeById = (id: string) => TECH_TREE.find((n) => n.id === id)!;

/** Wipe any Wonder progress/ownership so a controlled white-box drive starts
 *  from a clean slate (mirrors wonder-race.test.ts). */
function clearWonders(r: RegionSim) {
  for (const k of Object.keys(r.wonderOwner)) delete r.wonderOwner[k];
  for (const s of r.settlements) {
    if (s.construction && REGION_BUILDINGS.find((b) => b.id === s.construction!.id)?.unique) {
      s.construction = null;
    }
  }
}

/** A settled rival funded for the space race, with the clock jumped PAST the
 *  rocketry era. Bootstrap 3 game-years so a rival holds a settlement, jump the
 *  minute-clock to `year`, flush every stale construction (their doneDays are all
 *  in the past after the jump), then wipe the warmup's Wonder progress. */
function spaceRaceRival(r: RegionSim, gold: number, year: number) {
  runDays(r, 60 * 3);
  const f = r.regionalFactions.find((x) => x.id !== r.playerFactionId && x.settlementIds.length > 0);
  expect(f, 'a rival should hold a settlement after warmup').toBeTruthy();
  r.minute = (year - START_YEAR) * DAYS_PER_YEAR * MINUTES_PER_DAY;
  expect(r.year).toBe(year);
  updateConstruction(r); // resolve everything the jump left overdue
  clearWonders(r);
  f!.treasury = gold;
  return f!;
}

// ---- 1. Catalog discipline: the three defs exist and hold every Wonder invariant ----

describe('Space wonders — catalog discipline', () => {
  it('all three space Wonders exist and pass the unique-Wonder invariants', () => {
    for (const id of SPACE_WONDERS) {
      const w = REGION_BUILDINGS.find((b) => b.id === id);
      expect(w, `${id} should be defined`).toBeTruthy();
      expect(w!.unique, `${id} unique`).toBe(true);
      expect(w!.max, `${id} max`).toBe(1);
      expect(w!.bonus, `${id} local bonus must be 0 (effect rides empireBonus)`).toBe(0);
      expect(typeof w!.empireBonus, `${id} empireBonus`).toBe('number');
      expect(w!.empireBonus!, `${id} empireBonus bounded`).toBeLessThanOrEqual(0.3);
      expect(w!.empireSector, `${id} empireSector`).toBeDefined();
      expect(w!.prestige, `${id} prestige`).toBeGreaterThan(0);
      expect(w!.prereq, `${id} must be tech-gated (era gate for the rival race)`).toBeTruthy();
    }
  });

  it('the three carry distinct empire effects and escalating prestige', () => {
    const program = byId('space_program');
    const network = byId('satellite_network');
    const station = byId('orbital_station');
    expect(program.empireSector).toBe('information');
    expect(network.empireSector).toBe('all');
    expect(station.empireSector).toBe('industry');
    expect(program.prestige!).toBeLessThan(network.prestige!);
    expect(network.prestige!).toBeLessThan(station.prestige!);
    // Premium prizes: never cheaper than the earliest classic Wonder.
    const granary = byId('great_granary');
    for (const id of SPACE_WONDERS) expect(byId(id).cost).toBeGreaterThanOrEqual(granary.cost);
  });
});

// ---- 2. The tech ladder: rocketry → satellites, chained into the existing tree ----

describe('Space wonders — the rocketry ladder', () => {
  it('rocketry and satellites exist with the right eras and tree', () => {
    const rocketry = nodeById('rocketry');
    const satellites = nodeById('satellites');
    expect(rocketry).toBeTruthy();
    expect(rocketry.tree).toBe('tech');
    expect(rocketry.era).toBe(1955);
    expect(satellites).toBeTruthy();
    expect(satellites.tree).toBe('tech');
    expect(satellites.era).toBe(1965);
    expect(satellites.prereqs).toEqual(['rocketry']);
  });

  it('the whole prereq chain resolves back to a zero-cost start node', () => {
    const ids = new Set(TECH_TREE.map((n) => n.id));
    const seen = new Set<string>();
    const stack = ['satellites'];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      expect(ids.has(id), `prereq "${id}" must exist in TECH_TREE`).toBe(true);
      stack.push(...nodeById(id).prereqs);
    }
    expect(seen.has('rocketry')).toBe(true);
    expect([...seen].some((id) => nodeById(id).cost === 0 && nodeById(id).prereqs.length === 0)).toBe(true);
  });
});

// ---- 3. The era gate: each Wonder's era-year IS its prereq tech's era ----
// Guards the fallback trap: a misspelled/missing prereq id silently maps to
// START_YEAR and rivals would break ground on a space Wonder in 1919.

describe('Space wonders — era gate wired to the prereq tech', () => {
  it('wonderEraYear equals the prereq node era for every space Wonder (never the START_YEAR fallback)', () => {
    const r = colony(1);
    for (const id of SPACE_WONDERS) {
      const def = byId(id);
      const node = TECH_TREE.find((n) => n.id === def.prereq);
      expect(node, `${id} prereq "${def.prereq}" must be a real tech node`).toBeTruthy();
      expect(priv(r).wonderEraYear(def), `${id} era-year`).toBe(node!.era);
      expect(priv(r).wonderEraYear(def), `${id} must not fall back to START_YEAR`).not.toBe(START_YEAR);
    }
    expect(priv(r).wonderEraYear(byId('space_program'))).toBe(1955);
    expect(priv(r).wonderEraYear(byId('satellite_network'))).toBe(1965);
    expect(priv(r).wonderEraYear(byId('orbital_station'))).toBe(2090);
  });
});

// ---- 4. The race is live: a funded rival past the era claims a space Wonder ----

describe('Space wonders — a rival can claim one', () => {
  it('a funded rival in 1960 breaks ground on the Space Program, pays raw cost, and claims it', () => {
    const r = colony(11);
    // Gold 440: the prestige-25 classics (280–320) and the Space Program (420)
    // are affordable; the Monument (500) and Satellite Network (450) are not —
    // so the highest-prestige pick is deterministically space_program.
    const rival = spaceRaceRival(r, 440, 1960);
    const before = rival.treasury;
    for (let i = 0; i < 500 && !priv(r).rivalWonderHost(rival)?.construction; i++) {
      priv(r).maybeBuildRivalWonder(rival, r.aiKnobs());
    }
    const project = priv(r).rivalWonderHost(rival)!.construction!;
    expect(project, 'the rival should have broken ground').toBeTruthy();
    expect(project.id).toBe('space_program');
    expect(rival.treasury).toBe(before - byId('space_program').cost); // raw cost, paid up front

    // Fast-forward to completion: the empire claim + the realm-wide bonus land.
    priv(r).rivalWonderHost(rival)!.construction!.doneDay = 0;
    updateConstruction(r);
    expect(r.wonderOwner['space_program']).toBe(rival.id);
    expect(priv(r).wonderBonus({ factionId: rival.id }, 'information'))
      .toBeCloseTo(byId('space_program').empireBonus!, 12);
    // The player gains nothing from a rival's launch complex.
    expect(priv(r).wonderBonus({ factionId: r.playerFactionId }, 'information')).toBe(0);
  });

  it('the same rival in 1950 — before the rocketry era — never picks a space Wonder', () => {
    const r = colony(11);
    const rival = spaceRaceRival(r, 440, 1950);
    for (let i = 0; i < 500 && !priv(r).rivalWonderHost(rival)?.construction; i++) {
      priv(r).maybeBuildRivalWonder(rival, r.aiKnobs());
    }
    const project = priv(r).rivalWonderHost(rival)!.construction;
    expect(project, 'a rich rival still races the classic Wonders').toBeTruthy();
    expect(SPACE_WONDERS as readonly string[]).not.toContain(project!.id);
  });
});

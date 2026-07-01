/**
 * The Wartime Materiel Draw — the military-industrial loop closes (GDD §7.3)
 *
 * Economy-realism arc, increment 3 (session 15). Session 14 priced the war
 * effort in MONEY (the armaments strain premium); this increment adds the
 * PHYSICAL half: a fielded army draws real steel and chemicals units from town
 * `goodStocks` each month via `drawGood`, in proportion to the unit power
 * fielded — so a war drains the arsenals the economy filled, and a shortfall
 * saps morale (floored at 30, the same floor as the supply crisis). Gated on
 * `playerWar`, which no autoplay sweep ever holds — byte-identical everywhere.
 */

import { describe, it, expect } from 'vitest';
import {
  RegionSim,
  UNIT_TYPES,
  WAR_MATERIEL_GOODS,
  WAR_MATERIEL_PER_POWER,
  WAR_MATERIEL_MORALE_DRAG,
} from '../src/sim/region';
import { consumeWarMateriel } from '../src/sim/systems/military';

// ---- helpers (mirroring tests/armaments-chain.test.ts conventions) ----

function makeRegion(seed = 42): RegionSim {
  return RegionSim.create(seed);
}

function injectRival(r: RegionSim, id = 9001): number {
  const sim = r as unknown as {
    rivals: Array<Record<string, unknown>>;
    nationProclaimed: boolean;
    stateProclaimed: boolean;
  };
  sim.rivals.push({
    id, name: 'Testania', leader: 'Commander Test', archetype: 'hegemon',
    weights: { expansion: 7, commerce: 3, honor: 5, risk: 6, grudge: 3 },
    regime: 'junta', agenda: 'dominate', compass: 'east',
    pop: 80, relations: -70, treaties: [],
    borderSettled: false, emergedYear: 1920, history: [],
    lastEnvoyDay: -999, lastGiftDay: -999,
  });
  sim.nationProclaimed = true;
  sim.stateProclaimed = true;
  return id;
}

/** Force a player war with a fielded army of `count` militia at `morale`. */
function forceWar(r: RegionSim, rivalId: number, count: number, morale = 100): void {
  (r as unknown as { playerWar: Record<string, unknown> | null }).playerWar = {
    rivalId, cb: 'border_dispute', defensive: false, startedDay: -1,
    support: 60, score: 30, mobilization: 'peacetime', casualties: 0,
    blockade: false, allies: [], enemyAllies: [], occupied: 0,
    resistance: 0, occupationPolicy: 'conciliatory', brutality: false,
    units: count > 0 ? [{ type: 'militia', count, morale, suppliedDays: 90 }] : [],
    supplyReserve: 3,
  };
  (r as unknown as { warSupport: number }).warSupport = 60;
}

/** Stock the capital's arsenal ledger with `units` of each materiel good. */
function stockArsenal(r: RegionSim, units: number): void {
  const capital = r.settlements[0];
  capital.goodStocks = capital.goodStocks ?? {};
  for (const good of WAR_MATERIEL_GOODS) capital.goodStocks[good] = units;
}

function unitMorale(r: RegionSim): number {
  return (r as unknown as { playerWar: { units: Array<{ morale: number }> } }).playerWar.units[0].morale;
}

// The monthly draw an army of N militia places on EACH materiel good.
const needFor = (count: number) => count * UNIT_TYPES.militia.powerPerUnit * WAR_MATERIEL_PER_POWER;

describe('consumeWarMateriel — the physical draw', () => {
  it('a fielded army draws exactly power × WAR_MATERIEL_PER_POWER of each good from stocks', () => {
    const r = makeRegion();
    forceWar(r, injectRival(r), 1000);
    stockArsenal(r, 500);
    consumeWarMateriel(r);
    for (const good of WAR_MATERIEL_GOODS) {
      expect(r.goodStock(good)).toBeCloseTo(500 - needFor(1000), 10);
    }
  });

  it('an amply-stocked arsenal leaves morale untouched', () => {
    const r = makeRegion();
    forceWar(r, injectRival(r), 1000);
    stockArsenal(r, 500);
    consumeWarMateriel(r);
    expect(unitMorale(r)).toBe(100);
  });

  it('a shortfall drains the stocks to zero and saps morale by the unmet fraction', () => {
    const r = makeRegion();
    forceWar(r, injectRival(r), 1000);
    stockArsenal(r, needFor(1000) / 2); // half the monthly draw on hand
    consumeWarMateriel(r);
    for (const good of WAR_MATERIEL_GOODS) expect(r.goodStock(good)).toBe(0);
    expect(unitMorale(r)).toBe(100 - Math.round(WAR_MATERIEL_MORALE_DRAG * 0.5));
  });

  it('a total shortfall costs the full WAR_MATERIEL_MORALE_DRAG, floored at 30', () => {
    const r = makeRegion();
    forceWar(r, injectRival(r), 1000, 34); // 34 − 8 would breach the floor
    stockArsenal(r, 0); // tracked, but empty — the arsenal ledger exists and is bare
    consumeWarMateriel(r);
    expect(unitMorale(r)).toBe(30);
  });

  it('an untracked ledger (pre-industrial war) is skipped — no draw, no morale drag', () => {
    const r = makeRegion();
    forceWar(r, injectRival(r), 1000, 50);
    // fresh sim: no town tracks steel/chemicals yet
    for (const good of WAR_MATERIEL_GOODS) expect(r.hasGoodStock(good)).toBe(false);
    consumeWarMateriel(r);
    expect(unitMorale(r)).toBe(50);
  });

  it('no war, or a war with no units fielded → stocks untouched', () => {
    const r = makeRegion();
    stockArsenal(r, 500);
    consumeWarMateriel(r); // no war at all
    for (const good of WAR_MATERIEL_GOODS) expect(r.goodStock(good)).toBe(500);
    forceWar(r, injectRival(r), 0); // war, empty muster
    consumeWarMateriel(r);
    for (const good of WAR_MATERIEL_GOODS) expect(r.goodStock(good)).toBe(500);
  });

  it('the draw lands greedily across towns, aggregate floored at zero (drawGood contract)', () => {
    const r = makeRegion();
    forceWar(r, injectRival(r), 2000);
    stockArsenal(r, needFor(2000) * 0.75); // capital holds 3/4 of the monthly need
    consumeWarMateriel(r);
    for (const good of WAR_MATERIEL_GOODS) expect(r.goodStock(good)).toBe(0);
    expect(unitMorale(r)).toBe(100 - Math.round(WAR_MATERIEL_MORALE_DRAG * 0.25));
  });
});

/**
 * Trigger DSL (Centuria 2.0 §D). A small JSON predicate language over sim
 * state and the deed ledger, used by decision-event definitions:
 *
 *   { "all": [...] } · { "any": [...] } · { "not": {...} }
 *   { "stat": "avgSatisfaction", "lt": 40 }          (see STATS)
 *   { "flag": "stateProclaimed" }                    (see FLAGS)
 *   { "year": { "gte": 1929, "lt": 1940 } }
 *   { "deed": "crackdown", "withinDays": 720, "min": 1 }
 *   { "rep": "humane", "lt": -2 }
 *   { "fired": "strike_wave", "withinDays": 360 }
 *   { "eventFlag": "sided_with_workers" }            (set by event options)
 */
import type { RegionSim } from '../region';
import { reputation, type DeedTag, type Reputation } from '../memory';

export interface Cmp { lt?: number; lte?: number; gt?: number; gte?: number; eq?: number }

export type Trigger =
  | { all: Trigger[] }
  | { any: Trigger[] }
  | { not: Trigger }
  | ({ stat: StatName } & Cmp)
  | { flag: FlagName }
  | { year: Cmp }
  | { deed: DeedTag; withinDays?: number; min?: number }
  | ({ rep: keyof Reputation } & Cmp)
  | { fired: string; withinDays?: number }
  | { eventFlag: string };

export const STATS = {
  avgSatisfaction: (r: RegionSim) => r.avgSatisfaction(),
  treasury: (r: RegionSim) => r.treasury,
  gdp: (r: RegionSim) => r.gdpLastMonth,
  treasuryMonths: (r: RegionSim) => (r.gdpLastMonth > 0 ? r.treasury / (r.gdpLastMonth / 12) : 0),
  inflation: (r: RegionSim) => r.inflationRate,
  warming: (r: RegionSim) => r.warmingC,
  population: (r: RegionSim) => r.totalPop(),
  towns: (r: RegionSim) => r.settlements.filter((s) => s.factionId === r.playerFactionId).length,
  maxGrievance: (r: RegionSim) => r.maxGrievance,
  legitimacy: (r: RegionSim) => r.legitimacy,
  politicalCapital: (r: RegionSim) => r.politicalCapital,
  confidence: (r: RegionSim) => r.confidence,
  debt: (r: RegionSim) => r.nationalDebt,
  taxRate: (r: RegionSim) => r.taxRate,
  territory: (r: RegionSim) => r.playerTerritoryControl(),
  warSupport: (r: RegionSim) => r.warSupport,
  warScore: (r: RegionSim) => r.playerWar?.score ?? 0,
  rivals: (r: RegionSim) => r.rivals.length,
  worstRelations: (r: RegionSim) => Math.min(100, ...r.rivals.map((rv) => rv.relations)),
  bestRelations: (r: RegionSim) => Math.max(-100, ...r.rivals.map((rv) => rv.relations)),
} as const satisfies Record<string, (r: RegionSim) => number>;

export type StatName = keyof typeof STATS;

export const FLAGS = {
  stateProclaimed: (r: RegionSim) => r.stateProclaimed,
  nationProclaimed: (r: RegionSim) => r.nationProclaimed,
  atWar: (r: RegionSim) => r.playerWar !== null,
  hasCentralBank: (r: RegionSim) => r.hasCentralBank(),
  printing: (r: RegionSim) => r.monetaryRegime === 'print',
  coalition: (r: RegionSim) => r.coalition !== null,
} as const satisfies Record<string, (r: RegionSim) => boolean>;

export type FlagName = keyof typeof FLAGS;

export function compare(v: number, c: Cmp): boolean {
  if (c.lt !== undefined && !(v < c.lt)) return false;
  if (c.lte !== undefined && !(v <= c.lte)) return false;
  if (c.gt !== undefined && !(v > c.gt)) return false;
  if (c.gte !== undefined && !(v >= c.gte)) return false;
  if (c.eq !== undefined && v !== c.eq) return false;
  return true;
}

export function evalTrigger(r: RegionSim, t: Trigger): boolean {
  if ('all' in t) return t.all.every((x) => evalTrigger(r, x));
  if ('any' in t) return t.any.some((x) => evalTrigger(r, x));
  if ('not' in t) return !evalTrigger(r, t.not);
  if ('stat' in t) {
    const f = STATS[t.stat];
    return f ? compare(f(r), t) : false;
  }
  if ('flag' in t) return FLAGS[t.flag]?.(r) ?? false;
  if ('year' in t) return compare(r.year, t.year);
  if ('deed' in t) {
    const since = r.day - (t.withinDays ?? Infinity);
    return r.deeds.filter((d) => d.tag === t.deed && d.day >= since).length >= (t.min ?? 1);
  }
  if ('rep' in t) return compare(reputation(r)[t.rep], t);
  if ('fired' in t) {
    const day = r.eventsFired[t.fired];
    return day !== undefined && r.day - day <= (t.withinDays ?? Infinity);
  }
  if ('eventFlag' in t) return r.eventFlags.includes(t.eventFlag);
  return false;
}

/** Load-time check: every stat/flag named by a trigger exists. */
export function validateTrigger(t: Trigger, where: string): string[] {
  const errs: string[] = [];
  const walk = (x: Trigger): void => {
    if ('all' in x) x.all.forEach(walk);
    else if ('any' in x) x.any.forEach(walk);
    else if ('not' in x) walk(x.not);
    else if ('stat' in x && !(x.stat in STATS)) errs.push(`${where}: unknown stat "${x.stat}"`);
    else if ('flag' in x && !(x.flag in FLAGS)) errs.push(`${where}: unknown flag "${x.flag}"`);
  };
  walk(t);
  return errs;
}

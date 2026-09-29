/**
 * Memory & reputation (Centuria 2.0 §B). The world keeps a ledger of what the
 * player has done. Deeds come from the command tape (every `issue()` call) and
 * from sim events (frontier shifts, war outcomes). They fade with time, feed
 * the reaction engine, and let every power explain why it feels as it does.
 */
import type { RegionSim } from './region';
import { onCommand, type Command } from './commands';

export type DeedTag =
  | 'aggression' | 'assault' | 'broke_treaty' | 'crackdown' | 'concession'
  | 'censorship' | 'press_freedom' | 'relief' | 'gift' | 'sanction' | 'lifted_sanction'
  | 'printed_money' | 'reform' | 'land_grab' | 'purchase' | 'brutal_occupation'
  | 'peacemaker' | 'proclaimed' | 'yielded' | 'capitulated' | 'vassalized'
  | 'took_land' | 'lost_land' | 'espionage' | 'treaty_signed' | 'war_won' | 'war_lost';

export type ActorKind = 'rival' | 'faction';

export interface Deed {
  id: number;
  day: number;
  tag: DeedTag;
  /** Who the deed was done to, if anyone. */
  targetKind?: ActorKind;
  targetId?: number;
  /** Initial salience; fades with DEED_HALF_LIFE_DAYS. */
  weight: number;
  detail?: string;
}

/** One remembered reason a power's opinion of the player moved. */
export interface OpinionEntry {
  day: number;
  tag: DeedTag;
  delta: number;
  text: string;
}

export const DEED_HALF_LIFE_DAYS = 360 * 8;
export const DEED_FORGET_BELOW = 0.05;
export const MAX_DEEDS = 400;
export const MAX_OPINION_ENTRIES = 12;

export interface Reputation {
  aggressive: number;
  trustworthy: number;
  humane: number;
  reformist: number;
}

export function deedSalience(d: Deed, day: number): number {
  return d.weight * Math.pow(0.5, (day - d.day) / DEED_HALF_LIFE_DAYS);
}

export function recordDeed(r: RegionSim, deed: Omit<Deed, 'id' | 'day'>): Deed {
  const d: Deed = { id: r.nextDeedId++, day: r.day, ...deed };
  r.deeds.push(d);
  if (r.deeds.length > MAX_DEEDS) r.deeds.splice(0, r.deeds.length - MAX_DEEDS);
  r.scheduleReactions(d);
  return d;
}

/** Monthly: forget what no one remembers any more. */
export function fadeDeeds(r: RegionSim): void {
  r.deeds = r.deeds.filter((d) => deedSalience(d, r.day) >= DEED_FORGET_BELOW);
}

const REPUTATION_AXES: Record<DeedTag, Partial<Reputation>> = {
  aggression: { aggressive: 1 },
  assault: { aggressive: 0.6 },
  broke_treaty: { trustworthy: -1.2 },
  crackdown: { humane: -1, reformist: -0.3 },
  concession: { humane: 0.5, reformist: 0.3 },
  censorship: { reformist: -0.8, humane: -0.3 },
  press_freedom: { reformist: 0.8 },
  relief: { humane: 0.6 },
  gift: { trustworthy: 0.3 },
  sanction: { aggressive: 0.3 },
  lifted_sanction: { trustworthy: 0.2 },
  printed_money: { trustworthy: -0.4 },
  reform: { reformist: 0.6 },
  land_grab: { aggressive: 0.25 },
  purchase: { trustworthy: 0.1 },
  brutal_occupation: { humane: -1.2, aggressive: 0.5 },
  peacemaker: { aggressive: -0.8, trustworthy: 0.5 },
  proclaimed: {},
  yielded: { aggressive: -0.5 },
  capitulated: {},
  vassalized: { aggressive: 0.4 },
  took_land: { aggressive: 0.3 },
  lost_land: {},
  espionage: { trustworthy: -0.6 },
  treaty_signed: { trustworthy: 0.5 },
  war_won: { aggressive: 0.2 },
  war_lost: {},
};

/** How the world sees the player: each axis roughly −10..+10. */
export function reputation(r: RegionSim): Reputation {
  const rep: Reputation = { aggressive: 0, trustworthy: 0, humane: 0, reformist: 0 };
  for (const d of r.deeds) {
    const s = deedSalience(d, r.day);
    const axes = REPUTATION_AXES[d.tag];
    for (const k of Object.keys(axes) as (keyof Reputation)[]) rep[k] += (axes[k] ?? 0) * s;
  }
  for (const k of Object.keys(rep) as (keyof Reputation)[]) rep[k] = Math.max(-10, Math.min(10, rep[k]));
  return rep;
}

export function noteOpinion(log: OpinionEntry[], e: OpinionEntry): void {
  log.unshift(e);
  if (log.length > MAX_OPINION_ENTRIES) log.length = MAX_OPINION_ENTRIES;
}

// ---- command tape → deeds ----

type Outcome = { tag: DeedTag; weight: number; targetKind?: ActorKind; targetId?: number; detail?: string };

function succeeded(result: unknown): boolean {
  if (result === false || result === null) return false;
  if (typeof result === 'object' && result !== null && 'ok' in result) return (result as { ok: boolean }).ok;
  if (result === 'refused' || result === 'invalid') return false;
  return true;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

export function deedForCommand(cmd: Command): Outcome | null {
  const a = cmd.args;
  switch (cmd.name) {
    case 'declareWar': return { tag: 'aggression', weight: 3, targetKind: 'rival', targetId: num(a[0]), detail: String(a[1] ?? '') };
    case 'declareWarOnFaction': return { tag: 'aggression', weight: 2.5, targetKind: 'faction', targetId: num(a[0]) };
    case 'assaultSettlement': return { tag: 'assault', weight: 1.5, detail: String(a[0]) };
    case 'breakTreaty': return { tag: 'broke_treaty', weight: 3, targetKind: 'rival', targetId: num(a[0]), detail: String(a[1] ?? '') };
    case 'crackdownProtests': return { tag: 'crackdown', weight: 2 };
    case 'concedeToProtesters': return { tag: 'concession', weight: 1 };
    case 'censorMedia': return { tag: 'censorship', weight: 1.5 };
    case 'grantPressLicense': return { tag: 'press_freedom', weight: 1 };
    case 'sendFoodAid': return { tag: 'relief', weight: 0.8 };
    case 'sendGift': return { tag: 'gift', weight: 1, targetKind: 'rival', targetId: num(a[0]) };
    case 'imposeSanction': return { tag: 'sanction', weight: 2, targetKind: 'rival', targetId: num(a[0]) };
    case 'liftSanction': return { tag: 'lifted_sanction', weight: 1, targetKind: 'rival', targetId: num(a[0]) };
    case 'setMonetaryRegime': return a[0] === 'print' ? { tag: 'printed_money', weight: 2 } : null;
    case 'enactLaw': return { tag: 'reform', weight: 1, detail: String(a[0] ?? '') };
    case 'claimCell': return { tag: 'land_grab', weight: 0.4 };
    case 'buyLand': return { tag: 'purchase', weight: 1, targetKind: 'faction', targetId: num(a[0]) };
    case 'setOccupationPolicy': return a[0] === 'brutal' ? { tag: 'brutal_occupation', weight: 2.5 } : null;
    case 'makeRegionalPeace': return { tag: 'peacemaker', weight: 1.5, targetKind: 'faction', targetId: num(a[0]) };
    case 'brokerForeignPeace': return { tag: 'peacemaker', weight: 2, targetKind: 'rival', targetId: num(a[0]) };
    case 'proclaimNation': return { tag: 'proclaimed', weight: 2 };
    case 'yieldToCoalition': return { tag: 'yielded', weight: 2 };
    case 'capitulate': return { tag: 'capitulated', weight: 2 };
    case 'offerVassalage': return { tag: 'vassalized', weight: 2, targetKind: 'faction', targetId: num(a[0]) };
    case 'proposeTreaty': return { tag: 'treaty_signed', weight: 1.5, targetKind: 'rival', targetId: num(a[0]), detail: String(a[1] ?? '') };
    case 'acceptOffer': return { tag: 'treaty_signed', weight: 1.5, targetKind: 'rival', targetId: num(a[0]) };
    default: return null;
  }
}

function espionageExposed(result: unknown): boolean {
  return typeof result === 'object' && result !== null && 'exposed' in result && (result as { exposed: boolean }).exposed;
}

onCommand((r, cmd, result) => {
  if (cmd.name === 'runEspionage') {
    if (espionageExposed(result)) recordDeed(r, { tag: 'espionage', weight: 2, targetKind: 'rival', targetId: num(cmd.args[0]) });
    return;
  }
  if (!succeeded(result)) return;
  const o = deedForCommand(cmd);
  if (o) recordDeed(r, o);
});

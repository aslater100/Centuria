/**
 * Reaction engine (Centuria 2.0 §C). Data-driven rules (src/data/reactions.json)
 * turn the player's deeds into responses from named powers: each candidate
 * actor rolls against a chance shaped by its personality, quirks and regime
 * bloc, and a hit is scheduled days or weeks out so the world answers in its
 * own time. Deterministic: all rolls draw from `auxRng`.
 */
import type { RegionSim, RivalNation, RegionalFaction, TreatyKind, LogEntry } from './region';
import { noteOpinion, type Deed, type DeedTag, type ActorKind, type OpinionEntry } from './memory';
import rulesJson from '../data/reactions.json';
import { voiceLead } from './narrative/press';

export interface ReactionEffects {
  relations?: number;
  grudge?: number;
  aggressiveness?: number;
  sanction?: boolean;
  cancelTreaty?: boolean | TreatyKind;
}

export interface ReactionRule {
  id: string;
  on: DeedTag;
  who: 'target' | 'others' | 'rivals' | 'factions';
  chance: number;
  traits?: Partial<Record<'expansion' | 'commerce' | 'ideology' | 'risk' | 'honor' | 'grudge', number>>;
  quirks?: Record<string, number>;
  blocs?: string[];
  blocBonus?: number;
  requireRelToTarget?: { lt?: number; gt?: number };
  requireTreaty?: boolean | TreatyKind;
  delay: [number, number];
  effects: ReactionEffects;
  text: string;
  kind: LogEntry['kind'];
}

export const REACTION_RULES: readonly ReactionRule[] = rulesJson as ReactionRule[];

export interface PendingReaction {
  due: number;
  ruleId: string;
  actorKind: ActorKind;
  actorId: number;
  deedId: number;
  tag: DeedTag;
  targetName: string;
}

export type Actor =
  | { kind: 'rival'; id: number; rv: RivalNation }
  | { kind: 'faction'; id: number; f: RegionalFaction };

export function actorName(a: Actor): string {
  return a.kind === 'rival' ? a.rv.name : a.f.name;
}

function actorLeader(a: Actor): string {
  if (a.kind === 'rival') return a.rv.leader;
  const id = a.f.identity;
  return id?.leaderName ? `${id.leaderTitle} ${id.leaderName}` : `the ${id?.adjective ?? a.f.name} government`;
}

function actorQuirks(a: Actor): string[] {
  return (a.kind === 'rival' ? a.rv.identity?.quirks : a.f.identity?.quirks) ?? [];
}

function actorTrait(a: Actor, k: keyof NonNullable<ReactionRule['traits']>): number {
  if (a.kind === 'rival') return a.rv.weights[k];
  if (k === 'expansion' || k === 'risk') return a.f.aggressiveness / 10;
  return 5;
}

function actorBloc(r: RegionSim, a: Actor): string {
  if (a.kind === 'rival') return r.regimeOf(a.rv).bloc;
  return r.regimeBlocOf(a.f.regime);
}

export function listActors(r: RegionSim): Actor[] {
  const out: Actor[] = r.rivals.map((rv) => ({ kind: 'rival' as const, id: rv.id, rv }));
  for (const f of r.regionalFactions) {
    if (f.id === r.playerFactionId) continue;
    if (f.settlementIds.length === 0) continue;
    out.push({ kind: 'faction', id: f.id, f });
  }
  return out;
}

export function findActor(r: RegionSim, kind: ActorKind, id: number): Actor | null {
  if (kind === 'rival') {
    const rv = r.rival(id);
    return rv ? { kind, id, rv } : null;
  }
  const f = r.faction(id);
  return f && f.id !== r.playerFactionId ? { kind, id, f } : null;
}

function isTarget(a: Actor, d: Deed): boolean {
  return d.targetKind === a.kind && d.targetId === a.id;
}

function eligible(rule: ReactionRule, a: Actor, d: Deed): boolean {
  switch (rule.who) {
    case 'target': return isTarget(a, d);
    case 'others': return !isTarget(a, d);
    case 'rivals': return a.kind === 'rival' && !isTarget(a, d);
    case 'factions': return a.kind === 'faction' && !isTarget(a, d);
  }
}

function hasTreaty(a: Actor, need: boolean | TreatyKind): boolean {
  if (a.kind !== 'rival') return false;
  return need === true ? a.rv.treaties.length > 0 : a.rv.treaties.includes(need as TreatyKind);
}

/** Probability this actor answers this deed under this rule. */
export function reactionChance(r: RegionSim, rule: ReactionRule, a: Actor, d: Deed): number {
  if (!eligible(rule, a, d)) return 0;
  if (rule.requireTreaty && !hasTreaty(a, rule.requireTreaty)) return 0;
  if (rule.requireRelToTarget) {
    if (a.kind !== 'rival' || d.targetKind !== 'rival' || d.targetId === undefined) return 0;
    const rel = r.pairRelations(a.id, d.targetId);
    if (rule.requireRelToTarget.lt !== undefined && !(rel < rule.requireRelToTarget.lt)) return 0;
    if (rule.requireRelToTarget.gt !== undefined && !(rel > rule.requireRelToTarget.gt)) return 0;
  }
  let p = rule.chance;
  if (rule.traits) for (const [k, w] of Object.entries(rule.traits)) {
    p += (w ?? 0) * actorTrait(a, k as keyof NonNullable<ReactionRule['traits']>);
  }
  if (rule.quirks) for (const q of actorQuirks(a)) p += rule.quirks[q] ?? 0;
  if (rule.blocs?.includes(actorBloc(r, a))) p += rule.blocBonus ?? 0;
  const salience = Math.min(1.5, 0.5 + d.weight / 4);
  return Math.max(0, Math.min(1, p * salience));
}

function targetName(r: RegionSim, d: Deed): string {
  if (d.targetKind === undefined || d.targetId === undefined) return 'our neighbours';
  const a = findActor(r, d.targetKind, d.targetId);
  return a ? actorName(a) : 'our neighbours';
}

export function scheduleReactions(r: RegionSim, d: Deed): void {
  const actors = listActors(r);
  for (const rule of REACTION_RULES) {
    if (rule.on !== d.tag) continue;
    for (const a of actors) {
      const p = reactionChance(r, rule, a, d);
      if (p <= 0) continue;
      if (r.auxRng.next() >= p) continue;
      const [lo, hi] = rule.delay;
      r.pendingReactions.push({
        due: d.day + lo + r.auxRng.int(Math.max(1, hi - lo + 1)),
        ruleId: rule.id,
        actorKind: a.kind,
        actorId: a.id,
        deedId: d.id,
        tag: d.tag,
        targetName: targetName(r, d),
      });
    }
  }
}

function fill(text: string, a: Actor, target: string): string {
  const adjective = (a.kind === 'rival' ? a.rv.identity?.adjective : a.f.identity?.adjective) ?? actorName(a);
  return text
    .replace(/\{actor\}/g, actorName(a))
    .replace(/\{leader\}/g, actorLeader(a))
    .replace(/\{adj\}/g, adjective)
    .replace(/\{target\}/g, target);
}

function opinionLog(a: Actor): OpinionEntry[] {
  if (a.kind === 'rival') return (a.rv.opinion ??= []);
  return (a.f.opinion ??= []);
}

function applyEffects(r: RegionSim, a: Actor, e: ReactionEffects): number {
  let delta = 0;
  if (a.kind === 'rival') {
    const rv = a.rv;
    if (e.relations) {
      const before = rv.relations;
      rv.relations = r.clampRel(rv.relations + e.relations);
      delta = rv.relations - before;
    }
    if (e.grudge) rv.weights.grudge = Math.max(0, Math.min(10, rv.weights.grudge + e.grudge));
    if (e.sanction) r.rivalImposeSanction(rv);
    if (e.cancelTreaty) {
      const kind = e.cancelTreaty === true ? rv.treaties[0] : e.cancelTreaty;
      if (kind && rv.treaties.includes(kind)) rv.treaties = rv.treaties.filter((t) => t !== kind);
    }
  } else {
    const f = a.f;
    const agg = (e.aggressiveness ?? 0) - (e.relations ?? 0) / 2;
    if (agg) f.aggressiveness = Math.max(0, Math.min(100, f.aggressiveness + agg));
    delta = -agg;
  }
  return Math.round(delta);
}

/** Daily: fire every reaction that has come due. */
export function tickReactions(r: RegionSim): void {
  if (!r.pendingReactions.length) return;
  const due = r.pendingReactions.filter((p) => p.due <= r.day);
  if (!due.length) return;
  r.pendingReactions = r.pendingReactions.filter((p) => p.due > r.day);
  for (const p of due) {
    const rule = REACTION_RULES.find((x) => x.id === p.ruleId);
    const a = findActor(r, p.actorKind, p.actorId);
    if (!rule || !a) continue;
    const text = fill(rule.text, a, p.targetName);
    const delta = applyEffects(r, a, rule.effects);
    noteOpinion(opinionLog(a), { day: r.day, tag: p.tag, delta, text });
    const voice = a.kind === 'rival' ? a.rv.identity?.voice : a.f.identity?.voice;
    const lead = voiceLead(voice, `${r.day}|${p.ruleId}|${a.id}`);
    r.addLog(lead + text, rule.kind, { actor: { kind: a.kind, id: a.id }, cat: 'reaction' });
  }
}

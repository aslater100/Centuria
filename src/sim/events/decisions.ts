/**
 * Decision events (Centuria 2.0 §D). JSON-defined situations that trigger on
 * sim state and the deed ledger, are voiced by a named minister, foreign
 * leader or the street, and offer 2–4 choices. Choices apply effects, may set
 * story flags, and can schedule follow-up events — so chains unfold over
 * years. A choice's `deed` enters the ledger, so the world reacts to it.
 */
import type { RegionSim, MinisterRoleId, LogEntry } from '../region';
import { recordDeed, type DeedTag } from '../memory';
import { evalTrigger, validateTrigger, type Trigger } from './trigger';
import coreEvents from '../../data/events/core.json';
import eraEvents from '../../data/events/eras.json';

export interface EventEffects {
  treasury?: number;
  /** Treasury change in months of GDP (e.g. −0.5). */
  treasuryGdp?: number;
  satisfaction?: number;
  grievance?: number;
  legitimacy?: number;
  politicalCapital?: number;
  warSupport?: number;
  confidence?: number;
  relationsAll?: number;
  relationsWorst?: number;
  relationsBest?: number;
  deed?: DeedTag;
  deedWeight?: number;
  setFlag?: string;
  clearFlag?: string;
  log?: string;
  logKind?: LogEntry['kind'];
}

export interface EventOption {
  label: string;
  tooltip?: string;
  requires?: Trigger;
  effects: EventEffects;
  followUp?: { id: string; delay: [number, number] };
}

export type Speaker = MinisterRoleId | 'rival' | 'people';

export interface DecisionEventDef {
  id: string;
  title: string;
  era?: [number, number];
  trigger: Trigger;
  weight?: number;
  cooldownDays?: number;
  once?: boolean;
  /** Only reachable as a follow-up. */
  chainOnly?: boolean;
  speaker: Speaker;
  body: string;
  options: EventOption[];
  defaultOption?: number;
  expireDays?: number;
}

export interface ActiveDecision {
  eventId: string;
  day: number;
  expires: number;
  speakerName: string;
  rivalId?: number;
  body: string;
}

export interface ScheduledEvent {
  eventId: string;
  due: number;
}

export const DECISION_EVENTS: readonly DecisionEventDef[] = [
  ...(coreEvents as DecisionEventDef[]),
  ...(eraEvents as DecisionEventDef[]),
];

export const EVENT_MONTHLY_CHANCE = 0.3;
export const DEFAULT_EXPIRE_DAYS = 60;
export const MAX_OPEN_DECISIONS = 2;

export function eventDef(id: string): DecisionEventDef | undefined {
  return DECISION_EVENTS.find((e) => e.id === id);
}

export function validateEvents(defs: readonly DecisionEventDef[] = DECISION_EVENTS): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  for (const e of defs) {
    if (ids.has(e.id)) errs.push(`duplicate event id ${e.id}`);
    ids.add(e.id);
    errs.push(...validateTrigger(e.trigger, e.id));
    if (e.options.length < 1) errs.push(`${e.id}: no options`);
    e.options.forEach((o, i) => {
      if (o.requires) errs.push(...validateTrigger(o.requires, `${e.id}#${i}`));
      if (o.followUp && !defs.some((d) => d.id === o.followUp!.id)) errs.push(`${e.id}#${i}: unknown follow-up ${o.followUp.id}`);
    });
  }
  return errs;
}

/** `gdpLastMonth` is carried at an annualised scale; one month is a twelfth of it. */
export function monthlyGdp(r: RegionSim): number {
  return Math.max(0, r.gdpLastMonth) / 12;
}

function worstRival(r: RegionSim) {
  return r.rivals.length ? r.rivals.reduce((a, b) => (b.relations < a.relations ? b : a)) : null;
}

function bestRival(r: RegionSim) {
  return r.rivals.length ? r.rivals.reduce((a, b) => (b.relations > a.relations ? b : a)) : null;
}

function speakerFor(r: RegionSim, def: DecisionEventDef): { name: string; rivalId?: number } {
  if (def.speaker === 'rival') {
    const rv = worstRival(r);
    return rv ? { name: `${rv.leader} of ${rv.name}`, rivalId: rv.id } : { name: 'a foreign envoy' };
  }
  if (def.speaker === 'people') return { name: 'a delegation of citizens' };
  const n = r.ministerFor(def.speaker);
  return { name: n ? `${n.name}, your ${def.speaker} minister` : `the ${def.speaker} office` };
}

function restlessTown(r: RegionSim): string {
  const own = r.settlements.filter((s) => s.factionId === r.playerFactionId);
  if (!own.length) return 'the capital';
  return own.reduce((a, b) => (b.grievance > a.grievance ? b : a)).name;
}

export function fillText(r: RegionSim, text: string, speaker: string, rivalId?: number): string {
  const rv = rivalId !== undefined ? r.rival(rivalId) : worstRival(r);
  const friend = bestRival(r);
  return text
    .replace(/\{speaker\}/g, speaker)
    .replace(/\{rival\}/g, rv?.name ?? 'a foreign power')
    .replace(/\{rivalLeader\}/g, rv?.leader ?? 'their leader')
    .replace(/\{friend\}/g, friend?.name ?? 'a friendly power')
    .replace(/\{state\}/g, r.stateName || 'the colony')
    .replace(/\{town\}/g, restlessTown(r))
    .replace(/\{year\}/g, String(r.year));
}

function eligible(r: RegionSim, e: DecisionEventDef): boolean {
  if (e.chainOnly) return false;
  if (e.era && (r.year < e.era[0] || r.year > e.era[1])) return false;
  const last = r.eventsFired[e.id];
  if (last !== undefined) {
    if (e.once) return false;
    if (r.day - last < (e.cooldownDays ?? 720)) return false;
  }
  if (r.activeDecisions.some((a) => a.eventId === e.id)) return false;
  return evalTrigger(r, e.trigger);
}

export function activateEvent(r: RegionSim, e: DecisionEventDef): ActiveDecision {
  const sp = speakerFor(r, e);
  const a: ActiveDecision = {
    eventId: e.id,
    day: r.day,
    expires: r.day + (e.expireDays ?? DEFAULT_EXPIRE_DAYS),
    speakerName: sp.name,
    rivalId: sp.rivalId,
    body: fillText(r, e.body, sp.name, sp.rivalId),
  };
  r.activeDecisions.push(a);
  r.eventsFired[e.id] = r.day;
  r.addLog(`${e.title.toUpperCase()}: ${a.body}`, 'info', { cat: 'domestic' });
  return a;
}

export function optionAvailable(r: RegionSim, o: EventOption): boolean {
  return !o.requires || evalTrigger(r, o.requires);
}

function applyEffects(r: RegionSim, fx: EventEffects, a: ActiveDecision): void {
  if (fx.treasury) r.treasury += fx.treasury;
  if (fx.treasuryGdp) r.treasury += fx.treasuryGdp * monthlyGdp(r);
  if (fx.satisfaction || fx.grievance) {
    for (const s of r.settlements) {
      if (s.factionId !== r.playerFactionId) continue;
      if (fx.satisfaction) s.satisfaction = Math.max(0, Math.min(100, s.satisfaction + fx.satisfaction));
      if (fx.grievance) s.grievance = Math.max(0, Math.min(100, s.grievance + fx.grievance));
    }
  }
  if (fx.legitimacy) r.legitimacy = Math.max(0, Math.min(100, r.legitimacy + fx.legitimacy));
  if (fx.politicalCapital) r.politicalCapital = Math.max(0, r.politicalCapital + fx.politicalCapital);
  if (fx.warSupport) r.warSupport = Math.max(0, Math.min(100, r.warSupport + fx.warSupport));
  if (fx.confidence) r.confidence = Math.max(0, Math.min(100, r.confidence + fx.confidence));
  if (fx.relationsAll) for (const rv of r.rivals) rv.relations = r.clampRel(rv.relations + fx.relationsAll);
  if (fx.relationsWorst) {
    const rv = a.rivalId !== undefined ? r.rival(a.rivalId) : worstRival(r);
    if (rv) rv.relations = r.clampRel(rv.relations + fx.relationsWorst);
  }
  if (fx.relationsBest) {
    const rv = bestRival(r);
    if (rv) rv.relations = r.clampRel(rv.relations + fx.relationsBest);
  }
  if (fx.setFlag && !r.eventFlags.includes(fx.setFlag)) r.eventFlags.push(fx.setFlag);
  if (fx.clearFlag) r.eventFlags = r.eventFlags.filter((f) => f !== fx.clearFlag);
  if (fx.log) r.addLog(fillText(r, fx.log, a.speakerName, a.rivalId), fx.logKind ?? 'info');
  if (fx.deed) {
    recordDeed(r, {
      tag: fx.deed,
      weight: fx.deedWeight ?? 1.5,
      ...(a.rivalId !== undefined && fx.relationsWorst ? { targetKind: 'rival' as const, targetId: a.rivalId } : {}),
    });
  }
}

/** Resolve an open decision. Returns false if it isn't open or the option is barred. */
export function chooseOption(r: RegionSim, eventId: string, index: number): boolean {
  const a = r.activeDecisions.find((x) => x.eventId === eventId);
  const def = eventDef(eventId);
  if (!a || !def) return false;
  const opt = def.options[index];
  if (!opt || !optionAvailable(r, opt)) return false;
  r.activeDecisions = r.activeDecisions.filter((x) => x !== a);
  applyEffects(r, opt.effects, a);
  if (opt.followUp) {
    const [lo, hi] = opt.followUp.delay;
    r.scheduledEvents.push({ eventId: opt.followUp.id, due: r.day + lo + r.auxRng.int(Math.max(1, hi - lo + 1)) });
  }
  return true;
}

/** Monthly: lapse ignored decisions, deliver follow-ups, maybe raise a new matter. */
export function tickDecisionEvents(r: RegionSim): void {
  for (const a of [...r.activeDecisions]) {
    if (a.expires > r.day) continue;
    const def = eventDef(a.eventId);
    const fallback = def?.defaultOption ?? (def ? def.options.length - 1 : 0);
    if (!def || !chooseOption(r, a.eventId, fallback)) r.activeDecisions = r.activeDecisions.filter((x) => x !== a);
    else r.addLog(`Left unanswered, "${def.title}" resolved itself: ${def.options[fallback].label}.`, 'info');
  }
  const due = r.scheduledEvents.filter((s) => s.due <= r.day);
  r.scheduledEvents = r.scheduledEvents.filter((s) => s.due > r.day);
  for (const s of due) {
    const def = eventDef(s.eventId);
    if (def && evalTrigger(r, def.trigger)) activateEvent(r, def);
  }
  if (r.activeDecisions.length >= MAX_OPEN_DECISIONS) return;
  if (r.auxRng.next() >= EVENT_MONTHLY_CHANCE * r.difficultySettings.crisisFrequency) return;
  const pool = DECISION_EVENTS.filter((e) => eligible(r, e));
  if (!pool.length) return;
  const total = pool.reduce((s, e) => s + (e.weight ?? 1), 0);
  let roll = r.auxRng.next() * total;
  for (const e of pool) {
    roll -= e.weight ?? 1;
    if (roll <= 0) { activateEvent(r, e); return; }
  }
}

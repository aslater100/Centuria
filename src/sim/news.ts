/**
 * News feed (Centuria 2.0 §E). A derived view over the event log: every entry
 * becomes a dated newspaper item with an era-styled headline, a subject and —
 * when a foreign power is speaking — its flag. Nothing here is serialized; the
 * log (with its optional actor tags) is the durable record.
 */
import type { RegionSim, LogEntry } from './region';
import type { FlagSpec } from './procgen/nation';
import type { ActorKind } from './memory';
import { classify, headline, registerFor, type NewsCategory } from './narrative/press';
import { DAYS_PER_YEAR, START_YEAR } from './defs';

export interface NewsItem {
  day: number;
  year: number;
  cat: NewsCategory;
  kind: LogEntry['kind'];
  severity: 1 | 2 | 3;
  headline: string;
  body: string;
  subject: string;
  actor?: { kind: ActorKind; id: number };
  flag?: FlagSpec;
}

export function yearOfDay(day: number): number {
  return START_YEAR + Math.floor(day / DAYS_PER_YEAR);
}

interface Named { name: string; kind: ActorKind; id: number; flag?: FlagSpec }

function knownPowers(r: RegionSim): Named[] {
  const out: Named[] = r.rivals.map((rv) => ({ name: rv.name, kind: 'rival' as const, id: rv.id, flag: rv.identity?.flag }));
  for (const f of r.regionalFactions) {
    if (f.id === r.playerFactionId) continue;
    out.push({ name: f.name, kind: 'faction', id: f.id, flag: f.identity?.flag });
  }
  return out.sort((a, b) => b.name.length - a.name.length);
}

function severityOf(cat: NewsCategory, kind: LogEntry['kind']): 1 | 2 | 3 {
  if (cat === 'war' || cat === 'peace') return 3;
  if (cat === 'frontier' || cat === 'unrest' || (cat === 'world' && kind !== 'info')) return 2;
  if (cat === 'reaction' || cat === 'diplomacy') return kind === 'info' ? 1 : 2;
  return 1;
}

export function newsItemFor(r: RegionSim, e: LogEntry, powers: Named[] = knownPowers(r)): NewsItem {
  const { cat: parsed, body } = classify(e.text);
  const byActor = e.actor ? powers.find((p) => p.kind === e.actor!.kind && p.id === e.actor!.id) : undefined;
  const found = byActor ?? powers.find((p) => e.text.includes(p.name));
  const cat: NewsCategory = e.cat ?? (parsed === 'domestic' && found ? 'world' : parsed);
  const subject = found?.name ?? (r.stateName || 'the colony');
  const year = yearOfDay(e.day);
  const severity = severityOf(cat, e.kind);
  return {
    day: e.day,
    year,
    cat,
    kind: e.kind,
    severity,
    headline: severity >= 2
      ? headline(cat, subject, year, `${e.day}|${e.text.length}|${e.text.slice(0, 24)}`)
      : briefHeadline(body, year),
    body,
    subject,
    actor: found ? { kind: found.kind, id: found.id } : undefined,
    flag: found?.flag,
  };
}

const BRIEF_MAX = 64;

/** Minor items headline themselves from their own first clause. */
export function briefHeadline(body: string, year: number): string {
  let h = body.split(/ — |: |\. /)[0].replace(/[.!]+$/, '');
  if (h.length > BRIEF_MAX) h = h.slice(0, BRIEF_MAX).replace(/\s+\S*$/, '') + '…';
  return registerFor(year) === 'broadsheet' ? h.toUpperCase() : h;
}

/** Newest-first feed of the most recent `limit` log entries. */
export function newsFeed(r: RegionSim, limit = 40): NewsItem[] {
  const powers = knownPowers(r);
  return r.log.slice(-limit).reverse().map((e) => newsItemFor(r, e, powers));
}

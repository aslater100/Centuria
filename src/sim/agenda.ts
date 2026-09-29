/**
 * Turn agenda (Centuria 2.0 pillar 3). Gathers what genuinely needs the
 * player's attention this month — offers on the table, ultimatums, wars,
 * unrest, and the foreign reactions to what we did — so the UI can pause
 * on a short list of heavy decisions instead of a wall of panels.
 */
import type { RegionSim } from './region';
import { eventDef } from './events/decisions';

export type AgendaKind = 'decision' | 'offer' | 'negotiation' | 'ultimatum' | 'war' | 'unrest' | 'reaction' | 'advisor' | 'milestone';

export interface AgendaItem {
  id: string;
  kind: AgendaKind;
  urgency: 1 | 2 | 3;
  title: string;
  detail: string;
  /** Rival or settlement the item concerns, for the UI to focus. */
  rivalId?: number;
  settlementId?: number;
  eventId?: string;
}

const REACTION_WINDOW_DAYS = 30;

export function agenda(r: RegionSim): AgendaItem[] {
  const items: AgendaItem[] = [];
  for (const a of r.activeDecisions) {
    const def = eventDef(a.eventId);
    if (!def) continue;
    items.push({
      id: `decision:${a.eventId}`, kind: 'decision', urgency: 3, eventId: a.eventId,
      title: def.title,
      detail: `${a.speakerName} awaits your answer (${Math.max(0, a.expires - r.day)} days).`,
    });
  }
  const c = r.coalition;
  if (c?.demand && c.ultimatumDay !== null && !c.warDeclared) {
    items.push({
      id: 'ultimatum', kind: 'ultimatum', urgency: 3,
      title: 'Coalition ultimatum',
      detail: `${c.memberIds.length} powers demand ${c.demand}. Yield, split them, or prepare for war.`,
    });
  }
  if (r.playerWar) {
    const rv = r.rival(r.playerWar.rivalId);
    items.push({
      id: 'war', kind: 'war', urgency: 3, rivalId: r.playerWar.rivalId,
      title: `War with ${rv?.name ?? 'the enemy'}`,
      detail: `War score ${Math.round(r.playerWar.score)} · support ${Math.round(r.playerWar.support)}.`,
    });
  }
  for (const o of r.offers) {
    if (o.expiresDay < r.day) continue;
    const rv = r.rival(o.rivalId);
    if (!rv) continue;
    items.push({
      id: `offer:${o.rivalId}:${o.kind}`, kind: 'offer', urgency: 2, rivalId: rv.id,
      title: `${rv.name} offers a ${o.kind.replace(/_/g, ' ')}`,
      detail: `Expires in ${o.expiresDay - r.day} days.`,
    });
  }
  for (const n of r.negotiations) {
    const rv = r.rival(n.rivalId);
    if (!rv) continue;
    items.push({
      id: `neg:${n.rivalId}`, kind: 'negotiation', urgency: 2, rivalId: rv.id,
      title: `Negotiating with ${rv.name}`,
      detail: 'Their reply is due with the month.',
    });
  }
  const restless = r.settlements
    .filter((s) => s.factionId === r.playerFactionId && s.grievance >= 60)
    .sort((a, b) => b.grievance - a.grievance)
    .slice(0, 2);
  for (const s of restless) {
    items.push({
      id: `unrest:${s.id}`, kind: 'unrest', urgency: s.grievance >= 80 ? 3 : 2, settlementId: s.id,
      title: `Unrest in ${s.name}`,
      detail: `Grievance ${Math.round(s.grievance)} — concede, crack down, or fix the cause.`,
    });
  }
  const recent = r.log.filter((e) => e.cat === 'reaction' && r.day - e.day <= REACTION_WINDOW_DAYS);
  for (const e of recent.slice(-3).reverse()) {
    items.push({
      id: `react:${e.day}:${e.actor?.id ?? 0}:${e.text.length}`, kind: 'reaction', urgency: e.kind === 'bad' ? 2 : 1,
      rivalId: e.actor?.kind === 'rival' ? e.actor.id : undefined,
      title: 'The world answers',
      detail: e.text,
    });
  }
  for (const b of r.advisorBriefs.slice(-2)) {
    items.push({ id: `brief:${b.day}:${b.portfolio}`, kind: 'advisor', urgency: 1, title: `${b.portfolio} minister`, detail: b.message });
  }
  const goal = objective(r);
  return [...(goal ? [goal] : []), ...items.sort((a, b) => b.urgency - a.urgency)];
}

/** Items that justify stopping the clock at the turn of the month. */
export function agendaDemandsPause(items: readonly AgendaItem[]): boolean {
  return items.some((i) => i.urgency >= 2);
}

/** The standing objective (replaces the old canvas statehood banner): the next
 *  constitutional step and what still blocks it. */
export function objective(r: RegionSim): AgendaItem | null {
  if (!r.stateProclaimed) {
    if (r.ceremonyPending || r.charterEligible()) {
      return { id: 'goal:state', kind: 'milestone', urgency: 2, title: 'Charter ready',
        detail: 'Every requirement is met — proclaim the State.' };
    }
    const gates = r.charterGates();
    const done = gates.filter((g) => g.met).length;
    return { id: `goal:state:${done}`, kind: 'milestone', urgency: 1, title: `Toward Statehood ${done}/${gates.length}`,
      detail: gates.map((g) => `${g.met ? '✓' : '✗'} ${g.label} ${g.detail}`).join(' · ') };
  }
  if (!r.nationProclaimed) {
    const gates = r.canCallConventionGates();
    const done = gates.filter((g) => g.met).length;
    if (done === gates.length) {
      return { id: 'goal:nation', kind: 'milestone', urgency: 2, title: 'Convention ready',
        detail: 'Call the constitutional convention from the Nation screen (G).' };
    }
    return { id: `goal:nation:${done}`, kind: 'milestone', urgency: 1, title: `Toward Nationhood ${done}/${gates.length}`,
      detail: gates.map((g) => `${g.met ? '✓' : '✗'} ${g.label}${g.detail ? ' ' + g.detail : ''}`).join(' · ') };
  }
  return null;
}

/**
 * The Dispatch (Centuria 2.0 UI): a docked newspaper column that replaces the
 * old log banner, plus the monthly agenda strip. Both are plain DOM, rebuilt
 * only when the log or the agenda actually changes.
 */
import type { RegionSim } from '../sim/region';
import { newsFeed, type NewsItem } from '../sim/news';
import { masthead, registerFor, type NewsCategory } from '../sim/narrative/press';
import { agenda, type AgendaItem } from '../sim/agenda';
import { eventDef, optionAvailable } from '../sim/events/decisions';
import { flagDataUrl } from './flag';
import { MONTHS, DAYS_PER_MONTH, DAYS_PER_YEAR } from '../sim/defs';

type Filter = 'all' | 'world' | 'war' | 'home';

const FILTER_CATS: Record<Filter, readonly NewsCategory[] | null> = {
  all: null,
  world: ['world', 'diplomacy', 'reaction'],
  war: ['war', 'peace', 'frontier'],
  home: ['domestic', 'economy', 'unrest'],
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function dateline(day: number): string {
  const m = Math.floor((day % DAYS_PER_YEAR) / DAYS_PER_MONTH);
  return `${MONTHS[m] ?? ''}`;
}

export class Dispatch {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private head: HTMLElement;
  private filter: Filter = 'all';
  private lastKey = '';
  collapsed = false;
  onFocusRival: ((rivalId: number) => void) | null = null;

  constructor(root: HTMLElement) {
    this.el = document.createElement('aside');
    this.el.className = 'dispatch';
    this.el.innerHTML =
      `<header class="dispatch-head"></header>` +
      `<nav class="dispatch-tabs">` +
      (['all', 'world', 'war', 'home'] as Filter[]).map((f) =>
        `<button class="dispatch-tab${f === 'all' ? ' active' : ''}" data-f="${f}">${f === 'all' ? 'All' : f === 'world' ? 'World' : f === 'war' ? 'War & Borders' : 'Home'}</button>`).join('') +
      `<button class="dispatch-collapse" title="Fold the paper (N)">▾</button>` +
      `</nav><div class="dispatch-body"></div>`;
    root.appendChild(this.el);
    this.head = this.el.querySelector('.dispatch-head')!;
    this.body = this.el.querySelector('.dispatch-body')!;
    this.el.querySelectorAll<HTMLButtonElement>('.dispatch-tab').forEach((b) => {
      b.onclick = () => {
        this.filter = b.dataset.f as Filter;
        this.el.querySelectorAll('.dispatch-tab').forEach((x) => x.classList.toggle('active', x === b));
        this.lastKey = '';
      };
    });
    this.el.querySelector<HTMLButtonElement>('.dispatch-collapse')!.onclick = () => this.toggle();
    this.body.addEventListener('click', (ev) => {
      const item = (ev.target as HTMLElement).closest<HTMLElement>('[data-rival]');
      if (item && this.onFocusRival) this.onFocusRival(Number(item.dataset.rival));
    });
  }

  toggle(): void {
    this.collapsed = !this.collapsed;
    this.el.classList.toggle('collapsed', this.collapsed);
  }

  update(r: RegionSim): void {
    const key = `${r.log.length}|${r.log[r.log.length - 1]?.day ?? 0}|${this.filter}|${r.year}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const place = r.stateName || r.settlements.find((s) => s.factionId === r.playerFactionId)?.name || 'Colony';
    const reg = registerFor(r.year);
    this.el.dataset.register = reg;
    this.head.innerHTML =
      `<div class="dispatch-masthead">${esc(masthead(r.year, place, r.map.seed))}</div>` +
      `<div class="dispatch-dateline">${dateline(r.day)} ${r.year}</div>`;
    const cats = FILTER_CATS[this.filter];
    const items = newsFeed(r, 80).filter((n) => !cats || cats.includes(n.cat));
    const lead = items.filter((n) => n.severity >= 2 && r.day - n.day <= 60).slice(0, 2);
    const rest = items.filter((n) => !lead.includes(n)).slice(0, 30);
    this.body.innerHTML = items.length
      ? lead.map((n) => this.itemHtml(n, true)).join('') + rest.map((n) => this.itemHtml(n, false)).join('')
      : `<p class="dispatch-empty">No news is good news.</p>`;
  }

  private itemHtml(n: NewsItem, lead: boolean): string {
    const flag = n.flag ? `<img class="dispatch-flag" src="${flagDataUrl(n.flag, 30, 20)}" alt="">` : '';
    const rival = n.actor?.kind === 'rival' ? ` data-rival="${n.actor.id}"` : '';
    const rest = n.severity < 2 && n.body.toUpperCase().startsWith(n.headline.replace(/…$/, '').toUpperCase())
      ? n.body.slice(n.headline.replace(/…$/, '').length).replace(/^[\s—:.]+/, '')
      : n.body;
    const body = lead || n.severity >= 2 ? `<p class="dispatch-text">${esc(n.body)}</p>` : '';
    return `<article class="dispatch-item sev-${n.severity} kind-${n.kind}${lead ? ' lead' : ''}"${rival}>` +
      `<div class="dispatch-meta">${flag}<span class="dispatch-cat">${n.cat}</span><span class="dispatch-when">${dateline(n.day)} ${n.year}</span></div>` +
      `<h4 class="dispatch-headline">${esc(n.headline)}</h4>` +
      (body || (rest ? `<p class="dispatch-text brief">${esc(rest)}</p>` : '')) +
      `</article>`;
  }
}

export class AgendaBar {
  readonly el: HTMLElement;
  private lastKey = '';
  onAdvanceMonth: (() => void) | null = null;
  onFocusRival: ((rivalId: number) => void) | null = null;
  onFocusSettlement: ((settlementId: number) => void) | null = null;
  onOpenDecision: ((eventId: string) => void) | null = null;
  private items: AgendaItem[] = [];

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'agenda-bar';
    root.appendChild(this.el);
    this.el.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      if (t.closest('.agenda-advance')) { this.onAdvanceMonth?.(); return; }
      const chip = t.closest<HTMLElement>('.agenda-item');
      if (!chip) return;
      const it = this.items.find((x) => x.id === chip.dataset.id);
      if (it?.eventId !== undefined) this.onOpenDecision?.(it.eventId);
      else if (it?.rivalId !== undefined) this.onFocusRival?.(it.rivalId);
      else if (it?.settlementId !== undefined) this.onFocusSettlement?.(it.settlementId);
    });
  }

  current(): readonly AgendaItem[] {
    return this.items;
  }

  update(r: RegionSim, awaitingTurn: boolean): void {
    this.items = agenda(r);
    const key = this.items.map((i) => i.id).join(',') + `|${awaitingTurn}|${r.month}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const chips = this.items.slice(0, 5).map((i) =>
      `<button class="agenda-item urg-${i.urgency} k-${i.kind}" data-id="${esc(i.id)}" title="${esc(i.detail)}">` +
      `<span class="agenda-title">${esc(i.title)}</span><span class="agenda-detail">${esc(i.detail)}</span></button>`).join('');
    this.el.classList.toggle('awaiting', awaitingTurn);
    this.el.innerHTML =
      `<div class="agenda-label">${MONTHS[r.month] ?? ''} ${r.year}<small>${this.items.length ? `${this.items.length} matter${this.items.length > 1 ? 's' : ''} before you` : 'A quiet month'}</small></div>` +
      `<div class="agenda-items">${chips}</div>` +
      `<button class="agenda-advance" title="Run to the start of next month, then pause (Enter)">End month ▶</button>`;
  }
}

/** Modal card for an open decision event: who speaks, what happened, the choices. */
export class DecisionCard {
  readonly el: HTMLElement;
  private openId: string | null = null;
  onChoose: ((eventId: string, index: number) => void) | null = null;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'decision-card hidden';
    root.appendChild(this.el);
    this.el.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      if (t.closest('.decision-close')) { this.close(); return; }
      const b = t.closest<HTMLButtonElement>('.decision-opt');
      if (b && !b.disabled && this.openId) {
        this.onChoose?.(this.openId, Number(b.dataset.i));
        this.close();
      }
    });
  }

  get isOpen(): boolean {
    return this.openId !== null;
  }

  open(r: RegionSim, eventId: string): void {
    const a = r.activeDecisions.find((x) => x.eventId === eventId);
    const def = eventDef(eventId);
    if (!a || !def) return;
    this.openId = eventId;
    const rv = a.rivalId !== undefined ? r.rival(a.rivalId) : null;
    const flag = rv?.identity ? `<img class="decision-flag" src="${flagDataUrl(rv.identity.flag, 48, 32)}" alt="">` : '';
    this.el.innerHTML =
      `<div class="decision-inner">` +
      `<button class="decision-close" title="Decide later">×</button>` +
      `<div class="decision-speaker">${flag}<span>${esc(a.speakerName)}</span></div>` +
      `<h2 class="decision-title">${esc(def.title)}</h2>` +
      `<p class="decision-body">${esc(a.body)}</p>` +
      `<div class="decision-opts">` +
      def.options.map((o, i) => {
        const ok = optionAvailable(r, o);
        return `<button class="decision-opt" data-i="${i}" ${ok ? '' : 'disabled'}>` +
          `<b>${esc(o.label)}</b>${o.tooltip ? `<small>${esc(o.tooltip)}</small>` : ''}</button>`;
      }).join('') +
      `</div><p class="decision-foot">Unanswered in ${Math.max(0, a.expires - r.day)} days, events will decide for you.</p></div>`;
    this.el.classList.remove('hidden');
  }

  close(): void {
    this.openId = null;
    this.el.classList.add('hidden');
  }
}

import { RIVAL_REGIMES, TREATY_DEFS, type RegionSim, type RivalNation, type RegionalFaction, type TreatyKind } from '../sim/region';
import { QUIRKS } from '../sim/procgen/nation';
import { reputation, type OpinionEntry, type Reputation } from '../sim/memory';
import { issue } from '../sim/commands';
import { flagDataUrl } from './flag';

type Tab = 'all' | 'rivals' | 'factions';

interface Card {
  kind: 'rival' | 'faction';
  id: number;
  name: string;
  leader: string;
  regime: string;
  relations: number;
  treaties: TreatyKind[];
  quirks: string[];
  opinion: OpinionEntry[];
  flag: string;
}

const TREATY_KINDS = Object.keys(TREATY_DEFS) as TreatyKind[];
const REP_AXES: { key: keyof Reputation; label: string }[] = [
  { key: 'aggressive', label: 'Aggressive' },
  { key: 'trustworthy', label: 'Trustworthy' },
  { key: 'humane', label: 'Humane' },
  { key: 'reformist', label: 'Reformist' },
];

function esc(s: string | number): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function signed(n: number): string {
  const v = Math.round(n * 10) / 10;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}`;
}

export function stanceWord(rel: number): string {
  if (rel < -50) return 'Hostile';
  if (rel < -15) return 'Cold';
  if (rel < 15) return 'Wary';
  if (rel < 50) return 'Cordial';
  return 'Friendly';
}

function regimeName(id: string): string {
  return RIVAL_REGIMES.find((g) => g.id === id)?.name ?? id;
}

function quirkChips(ids: string[]): string {
  return ids.map((id) => {
    const q = QUIRKS.find((x) => x.id === id);
    return `<span class="dip-quirk" title="${esc(q?.desc ?? '')}">${esc(q?.label ?? id)}</span>`;
  }).join('');
}

function factionCard(f: RegionalFaction): Card {
  const id = f.identity;
  const leader = id ? `${id.leaderTitle}${id.leaderName ? ' ' + id.leaderName : ''}` : 'Unknown';
  return {
    kind: 'faction', id: f.id, name: f.name, leader, regime: regimeName(f.regime),
    relations: 0, treaties: [], quirks: id?.quirks ?? [], opinion: f.opinion ?? [],
    flag: id ? `<img class="dip-flag" src="${flagDataUrl(id.flag, 56, 38)}" alt="">` : `<span class="dip-swatch" style="background:${esc(f.color)}"></span>`,
  };
}

function rivalCard(rv: RivalNation): Card {
  const fd = rv.flagData;
  const flag = rv.identity
    ? `<img class="dip-flag" src="${flagDataUrl(rv.identity.flag, 56, 38)}" alt="">`
    : `<span class="dip-swatch" style="background:linear-gradient(135deg,${esc(fd?.primary ?? '#667')} 50%,${esc(fd?.secondary ?? '#889')} 50%)"></span>`;
  return {
    kind: 'rival', id: rv.id, name: rv.name, leader: rv.leader, regime: regimeName(rv.regime),
    relations: rv.relations, treaties: rv.treaties, quirks: rv.identity?.quirks ?? [], opinion: rv.opinion ?? [], flag,
  };
}

function whyLine(op: OpinionEntry[]): string {
  const sums = new Map<string, number>();
  for (const e of op) sums.set(e.tag, (sums.get(e.tag) ?? 0) + e.delta);
  return [...sums.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([tag, d]) => `<span class="${d < 0 ? 'neg' : 'pos'}">${esc(tag)} ${signed(d)}</span>`).join(' · ');
}

export class DiplomacyScreen {
  readonly el: HTMLElement;
  private opened = false;
  private tab: Tab = 'all';
  private last: RegionSim | null = null;
  private notes = new Map<string, { text: string; ok: boolean; at: number }>();
  private readonly onKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') { ev.stopPropagation(); this.close(); }
  };

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'diplo-screen hidden';
    root.appendChild(this.el);
    this.el.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      if (t === this.el || t.closest('.diplo-close')) { this.close(); return; }
      const tabBtn = t.closest<HTMLElement>('[data-tab]');
      if (tabBtn) { this.tab = tabBtn.dataset.tab as Tab; if (this.last) this.refresh(this.last); return; }
      const b = t.closest<HTMLButtonElement>('button[data-act]');
      if (b && !b.disabled && this.last) this.act(this.last, b);
    });
  }

  get isOpen(): boolean {
    return this.opened;
  }

  open(r: RegionSim): void {
    this.last = r;
    if (!this.opened) document.addEventListener('keydown', this.onKey, true);
    this.opened = true;
    this.el.classList.remove('hidden');
    this.render(r);
  }

  close(): void {
    if (this.opened) document.removeEventListener('keydown', this.onKey, true);
    this.opened = false;
    this.el.classList.add('hidden');
  }

  refresh(r: RegionSim): void {
    this.last = r;
    if (this.opened) this.render(r);
  }

  private act(r: RegionSim, b: HTMLButtonElement): void {
    const id = Number(b.dataset.id);
    const act = b.dataset.act;
    let res: boolean | { ok: boolean; reason: string };
    if (act === 'envoy') res = issue(r, 'sendEnvoy', id);
    else if (act === 'gift') res = issue(r, 'sendGift', id);
    else if (act === 'treaty') res = issue(r, 'proposeTreaty', id, b.dataset.kind as TreatyKind);
    else if (act === 'sanction') res = issue(r, 'imposeSanction', id);
    else if (act === 'lift') res = issue(r, 'liftSanction', id);
    else return;
    const ok = typeof res === 'boolean' ? res : res.ok;
    const text = typeof res === 'object' && res.reason ? res.reason : ok ? 'Done.' : 'Refused.';
    this.notes.set(`rival:${id}`, { text, ok, at: Date.now() });
    this.render(r);
  }

  private render(r: RegionSim): void {
    const cards: Card[] = [];
    if (this.tab !== 'factions') for (const rv of r.rivals) cards.push(rivalCard(rv));
    if (this.tab !== 'rivals') {
      for (const f of r.regionalFactions) {
        if (f.id !== r.playerFactionId && f.settlementIds.length > 0) cards.push(factionCard(f));
      }
    }
    cards.sort((a, b) => a.relations - b.relations);
    const prevScroll = this.el.querySelector('.diplo-body')?.scrollTop ?? 0;
    const rep = reputation(r);
    const tabs: [Tab, string][] = [['all', 'All'], ['rivals', 'Great Powers'], ['factions', 'Neighbours']];
    this.el.innerHTML =
      `<div class="diplo-inner">` +
      `<button class="diplo-close" title="Close (Esc)">×</button>` +
      `<header class="diplo-head"><h2>Foreign Affairs</h2>` +
      `<div class="diplo-rep"><span class="diplo-rep-title">Our reputation</span>` +
      REP_AXES.map((a) => this.meter(a.label, rep[a.key])).join('') + `</div></header>` +
      `<nav class="diplo-tabs">` +
      tabs.map(([k, l]) => `<button data-tab="${k}" class="${this.tab === k ? 'on' : ''}">${l}</button>`).join('') +
      `</nav>` +
      `<div class="diplo-body">` +
      (cards.length ? `<div class="diplo-grid">${cards.map((c) => this.card(r, c)).join('')}</div>` : `<p class="diplo-empty">No powers to show.</p>`) +
      `</div>` +
      (r.stateProclaimed ? '' : `<p class="diplo-foot">Proclaim a State to open formal diplomacy.</p>`) +
      `</div>`;
    const body = this.el.querySelector('.diplo-body');
    if (body) body.scrollTop = prevScroll;
  }

  private meter(label: string, v: number): string {
    const pct = Math.min(50, Math.abs(v) * 5);
    const fill = v >= 0 ? `left:50%;width:${pct}%` : `left:${50 - pct}%;width:${pct}%`;
    return `<span class="diplo-meter" title="${esc(label)} ${signed(v)}"><em>${esc(label)}</em>` +
      `<span class="diplo-mbar"><i class="${v >= 0 ? 'pos' : 'neg'}" style="${fill}"></i></span><b>${signed(v)}</b></span>`;
  }

  private card(r: RegionSim, c: Card): string {
    const isRival = c.kind === 'rival';
    const pct = Math.min(50, Math.abs(c.relations) / 2);
    const fill = c.relations >= 0 ? `left:50%;width:${pct}%` : `left:${50 - pct}%;width:${pct}%`;
    const stance = stanceWord(c.relations);
    const cls = c.relations < -15 ? 'neg' : c.relations >= 15 ? 'pos' : 'mid';
    const treaties = c.treaties.length
      ? c.treaties.map((k) => `<span class="dip-treaty" title="${esc(TREATY_DEFS[k].desc)}">${esc(TREATY_DEFS[k].name)}</span>`).join('')
      : `<span class="dip-none">None</span>`;
    const op = c.opinion.slice(0, 6);
    const memory = op.length
      ? `<ul class="dip-mem">${op.map((e) => `<li class="${e.delta < 0 ? 'neg' : 'pos'}"><b>${signed(e.delta)}</b> ${esc(e.text)}</li>`).join('')}</ul>`
      : `<p class="dip-none">Nothing of note.</p>`;
    const why = c.opinion.length ? `<p class="dip-why"><span class="dip-why-h">Why relations are what they are</span>${whyLine(c.opinion)}</p>` : '';
    return `<article class="dip-card ${c.kind}">` +
      `<div class="dip-top">${c.flag}<div><h3>${esc(c.name)}</h3>` +
      `<div class="dip-sub">${esc(c.leader)} · ${esc(c.regime)}</div></div></div>` +
      (isRival
        ? `<div class="dip-rel"><span class="dip-bar"><i class="${cls}" style="${fill}"></i></span>` +
          `<b class="${cls}">${stance} ${signed(c.relations)}</b></div>`
        : `<div class="dip-rel"><span class="dip-none">Neighbouring realm — no formal relations ledger</span></div>`) +
      (c.quirks.length ? `<div class="dip-row">${quirkChips(c.quirks)}</div>` : '') +
      (isRival ? `<div class="dip-label">Treaties</div><div class="dip-row">${treaties}</div>` : '') +
      `<div class="dip-label">They remember</div>${memory}${why}` +
      (isRival ? this.actions(r, c) : '') + `</article>`;
  }

  private actions(r: RegionSim, c: Card): string {
    const off = r.stateProclaimed ? '' : 'disabled';
    const sanctioned = r.activeSanctions().some((s) => s.imposerId === 0 && s.targetId === c.id);
    const btn = (act: string, label: string, kind = ''): string =>
      `<button class="dip-btn" data-act="${act}" data-id="${c.id}" ${kind ? `data-kind="${kind}"` : ''} ${off}>${esc(label)}</button>`;
    const note = this.notes.get(`rival:${c.id}`);
    const fresh = note && Date.now() - note.at < 6000;
    return `<div class="dip-actions">` + btn('envoy', 'Send Envoy') + btn('gift', 'Send Gift') +
      TREATY_KINDS.filter((k) => !c.treaties.includes(k)).map((k) => btn('treaty', `Propose ${TREATY_DEFS[k].name}`, k)).join('') +
      (sanctioned ? btn('lift', 'Lift Sanction') : btn('sanction', 'Impose Sanction')) + `</div>` +
      (fresh ? `<p class="dip-note ${note.ok ? 'pos' : 'neg'}">${esc(note.text)}</p>` : '');
  }
}

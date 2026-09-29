import {
  RIVAL_REGIMES, TREATY_DEFS, RIVAL_ARCHETYPES, CASUS_BELLI_DEFS, ESPIONAGE_OPS, COMPASS_FLAVOR, AGENDA_TABLE_COST,
  ENVOY_COST, GIFT_COST, ENVOY_COOLDOWN_DAYS, GIFT_COOLDOWN_DAYS, ACCORD_DEFECT_THRESHOLD, BLOC_RELATIONS_FLOOR, MAX_ENTENTES,
  rivalAgendaKind, rivalArmsCapacity, sameContinent, rivalContinent,
  type RegionSim, type RivalNation, type RegionalFaction, type TreatyKind, type CasusBelli, type EspionageOp, type DealBasket,
} from '../sim/region';
import { formatCurrency, MONTHS, DAYS_PER_MONTH, DAYS_PER_YEAR, START_YEAR } from '../sim/defs';
import { DealModal } from './screens/dealModal';
import { QUIRKS } from '../sim/procgen/nation';
import { reputation, type OpinionEntry, type Reputation } from '../sim/memory';
import { issue } from '../sim/commands';
import { flagDataUrl } from './flag';

type Tab = 'all' | 'rivals' | 'factions' | 'world';
type DetailTab = 'relations' | 'deals' | 'intel' | 'war';

interface Selection {
  kind: 'rival' | 'faction';
  id: number;
}

interface Note {
  text: string;
  ok: boolean;
  at: number;
}

const DETAIL_TABS: [DetailTab, string][] = [
  ['relations', 'Relations'], ['deals', 'Treaties & Deals'], ['intel', 'Intelligence'], ['war', 'War'],
];
const QUICK_DEALS: { label: string; kind: TreatyKind }[] = [
  { label: 'Non-aggression', kind: 'non_aggression' },
  { label: 'Trade', kind: 'trade_agreement' },
  { label: 'Defensive pact', kind: 'defensive_pact' },
];

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

function dateOfDay(day: number): string {
  const month = MONTHS[Math.floor((day % DAYS_PER_YEAR) / DAYS_PER_MONTH)];
  return `${month} ${(day % DAYS_PER_MONTH) + 1}, ${START_YEAR + Math.floor(day / DAYS_PER_YEAR)}`;
}

function relBar(rel: number): string {
  const pct = Math.min(50, Math.abs(rel) / 2);
  const fill = rel >= 0 ? `left:50%;width:${pct}%` : `left:${50 - pct}%;width:${pct}%`;
  const cls = rel < -15 ? 'neg' : rel >= 15 ? 'pos' : 'mid';
  return `<span class="dip-bar"><i class="${cls}" style="${fill}"></i></span>`;
}

function relClass(rel: number): string {
  return rel < -15 ? 'neg' : rel >= 15 ? 'pos' : 'mid';
}

function meter(label: string, v: number): string {
  const pct = Math.min(50, Math.abs(v) * 5);
  const fill = v >= 0 ? `left:50%;width:${pct}%` : `left:${50 - pct}%;width:${pct}%`;
  return `<span class="diplo-meter" title="${esc(label)} ${signed(v)}"><em>${esc(label)}</em>` +
    `<span class="diplo-mbar"><i class="${v >= 0 ? 'pos' : 'neg'}" style="${fill}"></i></span><b>${signed(v)}</b></span>`;
}

interface BtnOpts {
  id?: number;
  kind?: string;
  cb?: string;
  op?: string;
  neg?: number;
  off?: string | null;
  title?: string;
  cls?: string;
}

function btn(act: string, label: string, o: BtnOpts = {}): string {
  const data = (o.id !== undefined ? ` data-id="${o.id}"` : '') + (o.kind ? ` data-kind="${esc(o.kind)}"` : '') +
    (o.cb ? ` data-cb="${esc(o.cb)}"` : '') + (o.op ? ` data-op="${esc(o.op)}"` : '') + (o.neg !== undefined ? ` data-neg="${o.neg}"` : '');
  const title = o.off ? o.off : o.title ?? '';
  return `<button class="dip-btn${o.cls ? ' ' + o.cls : ''}" data-act="${act}"${data} ${o.off ? 'disabled' : ''}${title ? ` title="${esc(title)}"` : ''}>${esc(label)}</button>`;
}

export class DiplomacyScreen {
  readonly el: HTMLElement;
  onLocate: ((rivalId: number) => void) | null = null;
  private opened = false;
  private tab: Tab = 'all';
  private sel: Selection | null = null;
  private dtab: DetailTab = 'relations';
  private last: RegionSim | null = null;
  private notes = new Map<string, Note>();
  private armed: string | null = null;
  private negOpenFor: number | null = null;
  private negGift: number | null = null;
  private negSweeten = false;
  private regift = new Map<string, number>();
  private cb: CasusBelli | null = null;
  private readonly deal: DealModal;
  private readonly onKey = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Escape') return;
    ev.stopPropagation();
    if (this.deal.isOpen) this.deal.close();
    else this.close();
  };

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'diplo-screen hidden';
    root.appendChild(this.el);
    this.deal = new DealModal(this.el);
    this.deal.onClose = () => { if (this.last && this.opened) this.render(this.last); };
    this.el.addEventListener('click', (ev) => this.onClick(ev));
    this.el.addEventListener('input', (ev) => this.onInput(ev));
    this.el.addEventListener('change', (ev) => this.onChange(ev));
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
    this.deal.close();
    this.armed = null;
    this.el.classList.add('hidden');
  }

  refresh(r: RegionSim): void {
    this.last = r;
    if (!this.opened || this.deal.isOpen) return;
    const a = document.activeElement;
    if (a && this.el.contains(a) && a.matches('input[type=number], input[type=range], select')) return;
    this.render(r);
  }

  private onClick(ev: MouseEvent): void {
    const t = ev.target as HTMLElement;
    const r = this.last;
    if (t === this.el || t.closest('.diplo-close')) { this.close(); return; }
    if (!r || t.closest('.dip-deal')) return;
    const tabBtn = t.closest<HTMLElement>('[data-tab]');
    if (tabBtn) { this.tab = tabBtn.dataset.tab as Tab; this.armed = null; this.render(r); return; }
    const dBtn = t.closest<HTMLElement>('[data-dtab]');
    if (dBtn) { this.dtab = dBtn.dataset.dtab as DetailTab; this.armed = null; this.render(r); return; }
    const b = t.closest<HTMLButtonElement>('button[data-act]');
    if (b) { if (!b.disabled) this.act(r, b); return; }
    const card = t.closest<HTMLElement>('.dip-card[data-kind]');
    if (card) {
      const kind = card.dataset.kind === 'faction' ? 'faction' : 'rival';
      const id = Number(card.dataset.id);
      const same = this.sel?.kind === kind && this.sel.id === id;
      this.sel = same ? null : { kind, id };
      this.armed = null;
      this.cb = null;
      this.negOpenFor = null;
      this.render(r);
    }
  }

  private onInput(ev: Event): void {
    const t = ev.target as HTMLInputElement;
    if (t.id === 'neg-gift') this.negGift = Number(t.value);
    else if (t.classList.contains('neg-regift')) this.regift.set(`${t.dataset.neg}:${t.dataset.round}`, Number(t.value));
    else if (t.id === 'bloc-tariff') {
      const lab = this.el.querySelector('#bloc-tariff-val');
      if (lab) lab.textContent = `${t.value}%`;
    }
  }

  private onChange(ev: Event): void {
    const t = ev.target as HTMLInputElement;
    const r = this.last;
    if (t.id === 'neg-sweet') this.negSweeten = t.checked;
    else if (t.name === 'cb') { this.cb = t.value as CasusBelli; this.armed = null; if (r) this.render(r); }
    else if (t.id === 'bloc-tariff' && r) { issue(r, 'setBlocTariff', Number(t.value) / 100); this.render(r); }
  }

  private setNote(key: string, ok: boolean, text: string): void {
    this.notes.set(key, { text, ok, at: Date.now() });
  }

  private act(r: RegionSim, b: HTMLButtonElement): void {
    const id = Number(b.dataset.id);
    const kind = b.dataset.kind;
    const key = `rival:${id}`;
    const act = b.dataset.act ?? '';
    const flag = (ok: boolean, yes: string, no: string, k = key): void => this.setNote(k, ok, ok ? yes : no);
    const confirm = (token: string): boolean => {
      if (this.armed === token) { this.armed = null; return true; }
      this.armed = token;
      this.render(r);
      return false;
    };
    switch (act) {
      case 'locate': this.onLocate?.(id); return;
      case 'envoy': flag(issue(r, 'sendEnvoy', id), 'Envoy dispatched — relations warm.', 'The envoy was not sent.'); break;
      case 'gift': flag(issue(r, 'sendGift', id), 'Gift delivered — relations warm.', 'The gift was not sent.'); break;
      case 'treaty':
        flag(issue(r, 'proposeTreaty', id, kind as TreatyKind), 'Treaty signed.', 'They declined — see the log for their reason.');
        break;
      case 'quickdeal': {
        const basket: DealBasket = { treaties: [kind as TreatyKind], goldToThem: 0, goldToYou: 0, borderSettlement: false };
        flag(issue(r, 'proposeDeal', id, basket), 'They agreed and signed.', 'No agreement — see the log for their answer.');
        break;
      }
      case 'table': this.deal.open(r, id); return;
      case 'sanction': {
        const res = issue(r, 'imposeSanction', id);
        this.setNote(key, res.ok, res.reason);
        break;
      }
      case 'lift': flag(issue(r, 'liftSanction', id), 'Sanction lifted.', 'No sanction to lift.'); break;
      case 'break':
        if (!confirm(`break:${id}:${kind}`)) return;
        flag(issue(r, 'breakTreaty', id, kind as TreatyKind), 'Treaty torn up.', 'Could not break that treaty.');
        break;
      case 'defector': flag(issue(r, 'sanctionAccordDefector', id), 'Defector sanctioned; accord suspended.', 'They are not defecting.'); break;
      case 'offer-sign': flag(issue(r, 'acceptOffer', id), 'Offer signed.', 'That offer is gone.'); break;
      case 'offer-decline': flag(issue(r, 'declineOffer', id), 'Offer declined.', 'That offer is gone.'); break;
      case 'offer-counter': {
        const res = issue(r, 'counterOffer', id);
        this.setNote(key, res.accepted, res.accepted ? `They agreed and paid ${formatCurrency(res.gift)}.` : 'They took offence and withdrew.');
        break;
      }
      case 'neg-terms':
        this.negOpenFor = this.negOpenFor === id ? null : id;
        this.negGift = null;
        this.negSweeten = false;
        break;
      case 'neg-open': {
        const rv = r.rival(id);
        if (!rv) return;
        const gift = this.negGift !== null && Number.isFinite(this.negGift) ? this.negGift : r.negotiationBaseGift(rv);
        const res = issue(r, 'openNegotiation', id, gift, this.negSweeten ? 'goodwill' : 'none');
        flag(res !== null, 'Talks opened — they reply on their monthly diplomacy tick.', 'Could not open talks (two negotiations may already be open).');
        this.negOpenFor = null;
        this.negGift = null;
        this.negSweeten = false;
        break;
      }
      case 'neg-accept': flag(issue(r, 'acceptNegotiation', Number(b.dataset.neg)), 'Signed on the negotiated terms.', 'Nothing to accept yet.'); this.regift.clear(); break;
      case 'neg-recounter': {
        const negId = Number(b.dataset.neg);
        const neg = r.negotiations.find((n) => n.id === negId);
        if (!neg) return;
        const input = this.el.querySelector<HTMLInputElement>(`.neg-regift[data-neg="${negId}"]`);
        const typed = input ? Number(input.value) : NaN;
        const gift = Number.isFinite(typed) ? typed : this.regift.get(`${negId}:${neg.round}`) ?? neg.gift;
        flag(issue(r, 'recounterNegotiation', negId, gift), 'Counter sent.', 'It is not your move.');
        this.regift.clear();
        break;
      }
      case 'neg-walk': issue(r, 'abandonNegotiation', Number(b.dataset.neg)); this.setNote(key, true, 'You walked away from the table.'); this.regift.clear(); break;
      case 'counter-sign': flag(issue(r, 'acceptCounter', id), 'Counter-offer signed.', 'Could not sign (treasury short or counter expired).'); break;
      case 'counter-decline': flag(issue(r, 'declineCounter', id), 'Counter-offer declined.', 'That counter is gone.'); break;
      case 'spy': {
        const res = issue(r, 'runEspionage', id, b.dataset.op as EspionageOp);
        this.setNote(key, res.ok && res.success && !res.exposed, res.reason);
        break;
      }
      case 'war': {
        if (!this.cb) return;
        if (!confirm(`war:${id}:${this.cb}`)) return;
        flag(issue(r, 'declareWar', id, this.cb), 'War declared.', 'War could not be declared.');
        this.cb = null;
        break;
      }
      case 'broker': flag(issue(r, 'brokerForeignPeace', id), 'Peace brokered.', 'They rebuffed the mediation.', 'world'); break;
      case 'yield': flag(issue(r, 'yieldToCoalition'), 'You yielded to the ultimatum.', 'Nothing to yield to.', 'world'); break;
      case 'bloc-form': flag(issue(r, 'formTradeBloc'), 'Trade bloc founded.', 'Could not found a bloc.', 'world'); break;
      case 'bloc-leave':
        if (!confirm('bloc-leave')) return;
        flag(issue(r, 'leaveTradeBloc'), 'Bloc dissolved.', 'No bloc to dissolve.', 'world');
        break;
      case 'bloc-invite': flag(issue(r, 'inviteToBloc', id), 'Invitation accepted.', 'They cannot join.', 'world'); break;
      default: return;
    }
    this.armed = null;
    this.render(r);
  }

  private noteHtml(key: string): string {
    const n = this.notes.get(key);
    return n && Date.now() - n.at < 8000 ? `<p class="dip-note ${n.ok ? 'pos' : 'neg'}">${esc(n.text)}</p>` : '';
  }

  private armLabel(token: string, label: string): string {
    return this.armed === token ? `Confirm: ${label}` : label;
  }

  private render(r: RegionSim): void {
    const cards: Card[] = [];
    if (this.tab !== 'factions' && this.tab !== 'world') for (const rv of r.rivals) cards.push(rivalCard(rv));
    if (this.tab !== 'rivals' && this.tab !== 'world') {
      for (const f of r.regionalFactions) {
        if (f.id !== r.playerFactionId && f.settlementIds.length > 0) cards.push(factionCard(f));
      }
    }
    cards.sort((a, b) => (a.kind === b.kind ? a.relations - b.relations : a.kind === 'rival' ? -1 : 1));
    const prevScroll = this.el.querySelector('.diplo-body')?.scrollTop ?? 0;
    const prevPane = this.el.querySelector('.dip-pane-body')?.scrollTop ?? 0;
    const rep = reputation(r);
    const tabs: [Tab, string][] = [['all', 'All'], ['rivals', 'Great Powers'], ['factions', 'Neighbours'], ['world', 'World']];
    let body: string;
    if (this.tab === 'world') {
      body = `<div class="dip-world">${this.worldHtml(r)}</div>`;
    } else if (!cards.length) {
      body = `<p class="diplo-empty">No powers to show.</p>`;
    } else {
      const detail = this.sel ? this.detailHtml(r) : '';
      body = detail
        ? `<div class="diplo-split"><div class="diplo-grid narrow">${cards.map((c) => this.card(r, c)).join('')}</div>${detail}</div>`
        : `<div class="diplo-grid">${cards.map((c) => this.card(r, c)).join('')}</div>`;
    }
    this.el.querySelector('.diplo-inner')?.remove();
    const inner = document.createElement('div');
    inner.className = 'diplo-inner';
    inner.innerHTML =
      `<button class="diplo-close" title="Close (Esc)">×</button>` +
      `<header class="diplo-head"><h2>Foreign Affairs</h2>` +
      `<div class="diplo-rep"><span class="diplo-rep-title">Our reputation</span>` +
      REP_AXES.map((a) => meter(a.label, rep[a.key])).join('') + `</div></header>` +
      `<nav class="diplo-tabs">` +
      tabs.map(([k, l]) => `<button data-tab="${k}" class="${this.tab === k ? 'on' : ''}">${l}</button>`).join('') +
      `</nav>` +
      `<div class="diplo-body">${body}</div>` +
      (r.stateProclaimed ? '' : `<p class="diplo-foot">Proclaim a State to open formal diplomacy.</p>`);
    this.el.insertBefore(inner, this.el.firstChild);
    const bodyEl = this.el.querySelector('.diplo-body');
    if (bodyEl) bodyEl.scrollTop = prevScroll;
    const paneEl = this.el.querySelector('.dip-pane-body');
    if (paneEl) paneEl.scrollTop = prevPane;
  }

  private card(r: RegionSim, c: Card): string {
    const isRival = c.kind === 'rival';
    const stance = stanceWord(c.relations);
    const cls = relClass(c.relations);
    const rv = isRival ? r.rival(c.id) : undefined;
    const selected = this.sel?.kind === c.kind && this.sel.id === c.id;
    const treaties = c.treaties.length
      ? c.treaties.map((k) => `<span class="dip-treaty" title="${esc(TREATY_DEFS[k].desc)}">${esc(TREATY_DEFS[k].name)}</span>`).join('')
      : `<span class="dip-none">No treaties</span>`;
    const badges: string[] = [];
    if (isRival) {
      if (r.playerWar?.rivalId === c.id) badges.push(`<span class="dip-badge bad">At war</span>`);
      if (r.offerFor(c.id)) badges.push(`<span class="dip-badge">Offer pending</span>`);
      if (r.counterFor(c.id)) badges.push(`<span class="dip-badge">Counter pending</span>`);
      if (r.negotiations.some((n) => n.rivalId === c.id)) badges.push(`<span class="dip-badge">Talks open</span>`);
      if (r.coalition?.memberIds.includes(c.id)) badges.push(`<span class="dip-badge bad">Coalition</span>`);
      if (r.foreignWars.some((w) => w.a === c.id || w.b === c.id)) badges.push(`<span class="dip-badge">War abroad</span>`);
    }
    const locate = isRival
      ? `<div class="dip-actions">${btn('locate', 'Locate on map', { id: c.id, off: rv?.factionId === undefined ? 'This power has no known position on the map' : null, title: 'Pan the map to this power' })}` +
        `<span class="dip-more">${selected ? 'Close dossier' : 'Open dossier'} ›</span></div>`
      : `<div class="dip-actions"><span class="dip-more">${selected ? 'Close' : 'Open'} ›</span></div>`;
    return `<article class="dip-card ${c.kind}${selected ? ' selected' : ''}" data-kind="${c.kind}" data-id="${c.id}">` +
      `<div class="dip-top">${c.flag}<div><h3>${esc(c.name)}</h3>` +
      `<div class="dip-sub">${esc(c.leader)} · ${esc(c.regime)}</div></div></div>` +
      (isRival
        ? `<div class="dip-rel">${relBar(c.relations)}<b class="${cls}">${stance} ${signed(c.relations)}</b></div>`
        : `<div class="dip-rel"><span class="dip-none">Neighbouring realm — no formal relations ledger</span></div>`) +
      (badges.length ? `<div class="dip-row">${badges.join('')}</div>` : '') +
      (c.quirks.length ? `<div class="dip-row">${quirkChips(c.quirks)}</div>` : '') +
      (isRival ? `<div class="dip-row">${treaties}</div>` : '') +
      locate + `</article>`;
  }

  private detailHtml(r: RegionSim): string {
    const s = this.sel;
    if (!s) return '';
    if (s.kind === 'faction') {
      const f = r.faction(s.id);
      if (!f) return '';
      const c = factionCard(f);
      const mem = c.opinion.length
        ? `<ul class="dip-mem">${c.opinion.slice(0, 12).map((e) => `<li class="${e.delta < 0 ? 'neg' : 'pos'}"><b>${signed(e.delta)}</b> ${esc(e.text)}</li>`).join('')}</ul>`
        : `<p class="dip-none">Nothing of note.</p>`;
      return `<section class="dip-pane"><div class="dip-pane-head">${c.flag}<div><h3>${esc(c.name)}</h3>` +
        `<div class="dip-sub">${esc(c.leader)} · ${esc(c.regime)}</div></div></div>` +
        `<div class="dip-pane-body"><div class="dip-label">They remember</div>${mem}` +
        (c.opinion.length ? `<p class="dip-why"><span class="dip-why-h">Why relations are what they are</span>${whyLine(c.opinion)}</p>` : '') +
        `<p class="dip-none">Neighbouring realms have no treaty or espionage channel.</p></div></section>`;
    }
    const rv = r.rival(s.id);
    if (!rv) return '';
    const c = rivalCard(rv);
    const tabs = DETAIL_TABS.map(([k, l]) => `<button data-dtab="${k}" class="${this.dtab === k ? 'on' : ''}">${l}</button>`).join('');
    let content: string;
    if (this.dtab === 'relations') content = this.relationsTab(r, rv, c);
    else if (this.dtab === 'deals') content = this.dealsTab(r, rv);
    else if (this.dtab === 'intel') content = this.intelTab(r, rv);
    else content = this.warTab(r, rv);
    return `<section class="dip-pane"><div class="dip-pane-head">${c.flag}<div class="dip-pane-title"><h3>${esc(rv.name)}</h3>` +
      `<div class="dip-sub">${esc(rv.leader)} · ${esc(c.regime)} · <b class="${relClass(rv.relations)}">${stanceWord(rv.relations)} ${signed(rv.relations)}</b></div></div>` +
      btn('locate', 'Locate on map', { id: rv.id, off: rv.factionId === undefined ? 'This power has no known position on the map' : null }) + `</div>` +
      `<nav class="dip-dtabs">${tabs}</nav>` +
      `<div class="dip-pane-body">${this.noteHtml(`rival:${rv.id}`)}${content}</div></section>`;
  }

  private gate(r: RegionSim, rv: RivalNation, cost: number, last: number, cooldown: number): string | null {
    if (!r.stateProclaimed) return 'Proclaim a State first';
    if (r.playerWar?.rivalId === rv.id) return 'No letters cross the front';
    if (r.treasury < cost) return `Need ${formatCurrency(cost)}`;
    const left = cooldown - (r.day - last);
    if (left > 0) return `Ready in ${left} days`;
    return null;
  }

  private relationsTab(r: RegionSim, rv: RivalNation, c: Card): string {
    const profile = r.rivalProfile(rv.id);
    const arch = RIVAL_ARCHETYPES[rv.archetype];
    const known = r.intelOf(rv.id) >= 0.5;
    const table = AGENDA_TABLE_COST[rivalAgendaKind(rv)] ?? 0;
    const tableNote = table > 0 ? ' Difficult to approach — harder to open any deal.' : table < 0 ? ' Eager dealmakers — easy to open any deal.' : '';
    const agenda = known ? `${esc(rv.agenda)}${tableNote}` : `<i>Unknown — gather intelligence to read it.</i>`;
    const envoyOff = this.gate(r, rv, ENVOY_COST, rv.lastEnvoyDay, ENVOY_COOLDOWN_DAYS);
    const giftOff = this.gate(r, rv, GIFT_COST, rv.lastGiftDay, GIFT_COOLDOWN_DAYS);
    const mem = c.opinion.length
      ? `<ul class="dip-mem">${c.opinion.slice(0, 12).map((e) => `<li class="${e.delta < 0 ? 'neg' : 'pos'}"><b>${signed(e.delta)}</b> ${esc(e.text)}</li>`).join('')}</ul>`
      : `<p class="dip-none">Nothing of note.</p>`;
    const why = c.opinion.length ? `<p class="dip-why"><span class="dip-why-h">Why relations are what they are</span>${whyLine(c.opinion)}</p>` : '';
    const others = r.rivals.filter((x) => x.id !== rv.id).map((x) => {
      const pr = r.pairRelations(rv.id, x.id);
      const allied = r.alliances.includes(`${rv.id}:${x.id}`) || r.alliances.includes(`${x.id}:${rv.id}`);
      const war = r.warBetween(rv.id, x.id);
      const tags = (allied ? `<span class="dip-badge">Allied</span>` : '') + (war ? `<span class="dip-badge bad">At war</span>` : '') +
        `<span class="dip-badge soft">${sameContinent(rv, x) ? 'Neighbours' : 'Across the oceans'}</span>`;
      return `<div class="dip-pair"><span class="dip-pair-name">${esc(x.name)}</span>${relBar(pr)}<b class="${relClass(pr)}">${signed(pr)}</b>${tags}</div>`;
    }).join('');
    return `<div class="dip-label">Character</div>` +
      `<p class="dip-prose"><b>${esc(arch.name)}</b> — ${esc(arch.desc)}</p>` +
      (profile ? `<p class="dip-prose dip-dim">${esc(profile.traits.join(', ') || 'no dominant traits')} · ${esc(profile.approximateStrength)} (${esc(profile.comparison)})</p>` : '') +
      `<p class="dip-prose dip-dim">${esc(COMPASS_FLAVOR[rv.compass])}${rv.borderSettled ? ' · border settled' : ''}</p>` +
      (c.quirks.length ? `<div class="dip-row">${quirkChips(c.quirks)}</div>` : '') +
      `<p class="dip-prose"><span class="dip-key">Agenda</span> ${agenda}</p>` +
      `<div class="dip-label">Gestures</div><div class="dip-actions flat">` +
      btn('envoy', `Send Envoy ${formatCurrency(ENVOY_COST)}`, { id: rv.id, off: envoyOff, title: `A paid mission to warm relations (${ENVOY_COOLDOWN_DAYS}-day turnaround)` }) +
      btn('gift', `Send Gift ${formatCurrency(GIFT_COST)}`, { id: rv.id, off: giftOff, title: `A state gift — dearer, faster (${GIFT_COOLDOWN_DAYS}-day turnaround)` }) +
      `</div>${envoyOff || giftOff ? `<p class="dip-off">${esc([envoyOff && `Envoy: ${envoyOff}`, giftOff && `Gift: ${giftOff}`].filter(Boolean).join(' · '))}</p>` : ''}` +
      `<div class="dip-label">They remember</div>${mem}${why}` +
      (rv.history.length ? `<div class="dip-label">Recent history</div><ul class="dip-mem dim">${rv.history.slice(-5).reverse().map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : '') +
      `<div class="dip-label">Relations with other powers</div>` +
      (others || `<p class="dip-none">No other great powers yet.</p>`);
  }

  private dealsTab(r: RegionSim, rv: RivalNation): string {
    const atWar = r.playerWar?.rivalId === rv.id;
    const noState = !r.stateProclaimed;
    const lock = noState ? 'Proclaim a State first' : atWar ? 'Peace is made at the peace table, not here' : null;
    const parts: string[] = [];

    const offer = r.offerFor(rv.id);
    const counter = r.counterFor(rv.id);
    const negs = r.negotiations.filter((n) => n.rivalId === rv.id);
    const capped = r.negotiations.length >= 2;
    const inbox: string[] = [];
    if (offer) {
      const capTitle = capped ? 'Two negotiations are already open — settle or walk away from one first' : 'Haggle terms: name your signing gift; they answer on their monthly diplomacy tick';
      inbox.push(`<div class="dip-inbox"><p>They offer <b>${esc(TREATY_DEFS[offer.kind].name)}</b> <span class="dip-dim">(expires ${dateOfDay(offer.expiresDay)})</span></p>` +
        `<div class="dip-actions flat">` + btn('offer-sign', 'Sign', { id: rv.id, cls: 'primary' }) +
        btn('offer-counter', 'Counter for a gift', { id: rv.id, title: 'Haggle before signing: ask for a signing gift. They may agree and pay, or take insult and withdraw.' }) +
        btn('neg-terms', 'Negotiate', { id: rv.id, off: capped ? capTitle : null, title: capTitle }) +
        btn('offer-decline', 'Decline', { id: rv.id, title: 'A small, remembered slight' }) + `</div>` +
        (this.negOpenFor === rv.id && !capped
          ? `<div class="dip-terms"><label>Signing gift <input type="number" id="neg-gift" min="0" step="5" value="${this.negGift ?? r.negotiationBaseGift(rv)}"></label>` +
            `<label title="Trade part of the gift for +4 relations on signing"><input type="checkbox" id="neg-sweet" ${this.negSweeten ? 'checked' : ''}> goodwill</label>` +
            btn('neg-open', 'Open talks', { id: rv.id, cls: 'primary', title: 'Put these terms on the table — they reply on their monthly diplomacy tick' }) + `</div>`
          : '') + `</div>`);
    }
    if (counter) {
      const short = r.treasury < counter.basket.goldToThem;
      inbox.push(`<div class="dip-inbox"><p>They counter: <b>${esc(r.basketLabel(counter.basket))}</b> <span class="dip-dim">(stands until ${dateOfDay(counter.expiresDay)})</span></p>` +
        `<div class="dip-actions flat">` + btn('counter-sign', 'Sign counter', { id: rv.id, cls: 'primary', off: short ? `Need ${formatCurrency(counter.basket.goldToThem)}` : null }) +
        btn('counter-decline', 'Decline', { id: rv.id }) + `</div></div>`);
    }
    for (const neg of negs) {
      const sweet = neg.sweetener === 'goodwill' ? ' + goodwill' : '';
      const head = `<p><b>${esc(TREATY_DEFS[neg.kind].name)}</b> · round ${neg.round}/4 · on the table ${formatCurrency(neg.gift)}${sweet}</p>`;
      if (neg.lastMoveBy === 'rival') {
        const draft = this.regift.get(`${neg.id}:${neg.round}`) ?? neg.gift;
        inbox.push(`<div class="dip-inbox">${head}<div class="dip-actions flat">` +
          btn('neg-accept', 'Accept their terms', { neg: neg.id, id: rv.id, cls: 'primary' }) +
          `<input type="number" class="neg-regift" data-neg="${neg.id}" data-round="${neg.round}" min="0" step="5" value="${draft}">` +
          btn('neg-recounter', 'Re-counter', { neg: neg.id, id: rv.id, title: 'Send back your own figure — they answer on their monthly tick' }) +
          btn('neg-walk', 'Walk away', { neg: neg.id, id: rv.id, title: 'A failed haggle is not a betrayal — a mild relations dip, nothing remembered' }) + `</div></div>`);
      } else {
        inbox.push(`<div class="dip-inbox">${head}<p class="dip-dim">Your terms are sent — awaiting their reply (they withdraw ${dateOfDay(neg.expiresDay)}).</p></div>`);
      }
    }
    parts.push(`<div class="dip-label">Inbox</div>` + (inbox.join('') || `<p class="dip-none">No offers, counters or open talks with ${esc(rv.name)}.</p>`));

    const kinds = Object.keys(TREATY_DEFS) as TreatyKind[];
    const inForce = rv.treaties.length
      ? rv.treaties.map((k) => {
          let extra = '';
          if (k === 'climate_accord') {
            const comp = r.accordCompliance[rv.id] ?? 1;
            const defecting = comp < ACCORD_DEFECT_THRESHOLD;
            extra = `<span class="dip-badge ${defecting ? 'bad' : ''}">${Math.round(comp * 100)}% compliant${defecting ? ' — defecting' : ''}</span>` +
              (defecting ? btn('defector', 'Sanction defector', { id: rv.id, title: 'Accord torn, −20 relations' }) : '');
          }
          const token = `break:${rv.id}:${k}`;
          return `<div class="dip-treaty-row"><span class="dip-treaty" title="${esc(TREATY_DEFS[k].desc)}">${esc(TREATY_DEFS[k].name)}</span>${extra}` +
            btn('break', this.armLabel(token, 'Break'), { id: rv.id, kind: k, cls: this.armed === token ? 'danger' : '', title: 'Tearing up a treaty is remembered by every chancery: relations −25 or worse, reputation stained' }) + `</div>`;
        }).join('')
      : `<p class="dip-none">No treaties in force.</p>`;
    parts.push(`<div class="dip-label">Treaties in force</div>${inForce}`);

    const proposable = kinds.filter((k) => !rv.treaties.includes(k) && (k !== 'climate_accord' || r.accordUnlocked()));
    parts.push(`<div class="dip-label">Propose a treaty</div><div class="dip-actions flat">` +
      (proposable.map((k) => {
        const ask = r.treatyAsk(rv, k);
        return btn('treaty', `${TREATY_DEFS[k].name} (≥ ${ask})`, { id: rv.id, kind: k, off: lock, title: `${TREATY_DEFS[k].desc} Their ask: relations ≥ ${ask} (now ${Math.round(rv.relations)}).` });
      }).join('') || `<span class="dip-none">Every treaty is already in force.</span>`) + `</div>` +
      (lock ? `<p class="dip-off">${esc(lock)}</p>` : ''));

    const quick = QUICK_DEALS.filter((q) => !rv.treaties.includes(q.kind));
    parts.push(`<div class="dip-label">Bargaining table</div><div class="dip-actions flat">` +
      btn('table', 'Open bargaining table', { id: rv.id, cls: 'primary', off: lock, title: 'Compose a multi-item basket: treaties, border settlement, entente, gold both ways' }) +
      quick.map((q) => btn('quickdeal', `Quick: ${q.label}`, { id: rv.id, kind: q.kind, off: lock, title: `Propose ${TREATY_DEFS[q.kind].name} as a priced deal — their table may accept, counter or walk` })).join('') + `</div>`);

    const ententes = r.ententes.filter((e) => e.withRivalId === rv.id || e.targetRivalId === rv.id);
    if (ententes.length) {
      parts.push(`<div class="dip-label">Ententes</div>` + ententes.map((e) =>
        `<p class="dip-prose">${esc(r.rival(e.withRivalId)?.name ?? '?')} ⚔ ${esc(r.rival(e.targetRivalId)?.name ?? '?')} <span class="dip-dim">signed ${dateOfDay(e.signedDay)}</span></p>`).join(''));
    }

    const byUs = r.activeSanctions().find((sn) => sn.imposerId === 0 && sn.targetId === rv.id);
    const onUs = r.activeSanctions().find((sn) => sn.imposerId === rv.id && sn.targetId === 0);
    parts.push(`<div class="dip-label">Economic sanctions</div>` +
      (onUs ? `<p class="dip-prose neg">${esc(rv.name)} sanctions us: −${Math.round(onUs.tradeReduction * 100)}% trade.</p>` : '') +
      (byUs
        ? `<p class="dip-prose">We sanction them: −${Math.round(byUs.tradeReduction * 100)}% trade${byUs.untilDay > 0 ? `, until ${dateOfDay(byUs.untilDay)}` : ''}. ` + btn('lift', 'Lift sanction', { id: rv.id }) + `</p>`
        : `<div class="dip-actions flat">` + btn('sanction', 'Impose sanction', { id: rv.id, off: noState ? 'Proclaim a State first' : null, title: 'Bar their exports: −40% bilateral trade, −10 relations, for one year' }) + `</div>`));
    return parts.join('');
  }

  private intelTab(r: RegionSim, rv: RivalNation): string {
    const intel = r.intelOf(rv.id);
    const pct = Math.round(intel * 100);
    const ops = (Object.keys(ESPIONAGE_OPS) as EspionageOp[]).map((op) => {
      const def = ESPIONAGE_OPS[op];
      const can = r.canRunEspionage(rv.id, op);
      return `<div class="dip-op"><div><b>${esc(def.name)}</b><div class="dip-dim">${esc(def.desc)}</div>` +
        `<div class="dip-dim">${formatCurrency(def.cost)} · needs intel ≥ ${Math.round(def.intelRequired * 100)}% · exposure risk ${Math.round(def.exposureRisk * 100)}%</div>` +
        `<div class="${can.ok ? 'dip-dim' : 'dip-off'}">${esc(can.reason)}</div></div>` +
        btn('spy', 'Run', { id: rv.id, op, off: can.ok ? null : can.reason }) + `</div>`;
    }).join('');
    const minister = r.ministerFor('defence');
    const est = Math.round(r.advisorForecast('War', rv.pop));
    const power = r.playerWar?.rivalId === rv.id ? ` · combat power ${Math.round(r.warPower())} vs ${Math.round(r.rivalWarPower(rv))}` : '';
    const strength = r.nationProclaimed
      ? `<p class="dip-prose">${esc(minister ? minister.name : 'Defence HQ')} estimates ${esc(rv.name)}'s strength at <b>${est}</b>${power}. <span class="dip-dim">Accuracy depends on your war minister's skill.</span></p>`
      : `<p class="dip-none">Proclaim a Nation to receive military estimates.</p>`;
    const arms = r.rivalClimateResponse && intel >= 0.5
      ? `<p class="dip-prose"><span class="dip-key">Arms base</span> <b>${Math.round(rivalArmsCapacity(r, rv) * 100)}%</b> <span class="dip-dim">— how well they can equip and sustain a war effort.</span></p>` : '';
    const agenda = intel >= 0.5 ? esc(rv.agenda) : `<i>Unknown — needs intel ≥ 50%.</i>`;
    return `<div class="dip-label">Intelligence penetration</div>` +
      `<div class="dip-meter-row"><span class="dip-bar intel"><i class="mid" style="left:0;width:${pct}%"></i></span><b>${pct}%</b></div>` +
      `<p class="dip-dim">Higher intel raises success and lowers exposure. ${r.stateProclaimed ? '' : 'Proclaim a State to run operations.'}</p>` +
      `<p class="dip-prose"><span class="dip-key">Agenda</span> ${agenda}</p>` + arms +
      `<div class="dip-label">Military estimate</div>${strength}` +
      `<div class="dip-label">Covert operations</div>${ops}`;
  }

  private warTab(r: RegionSim, rv: RivalNation): string {
    const w = r.playerWar;
    const parts: string[] = [];
    if (w?.rivalId === rv.id) {
      parts.push(`<div class="dip-banner bad"><b>At war with ${esc(rv.name)}</b> — ${esc(CASUS_BELLI_DEFS[w.cb].name)}${w.defensive ? ', defensive' : ''}.` +
        `<div>War score ${Math.round(w.score)} · home-front support ${Math.round(w.support)}% · started ${dateOfDay(w.startedDay)}</div>` +
        `<div class="dip-dim">Mobilization, blockade, occupation and the peace table are run from the war room.</div></div>`);
    }
    const scars = r.warScars.filter((sc) => sc.rivalId === rv.id);
    if (scars.length) {
      const wins = scars.filter((sc) => sc.outcome === 'victory').length;
      const losses = scars.filter((sc) => sc.outcome === 'defeat').length;
      const draws = scars.length - wins - losses;
      const tally = [wins && `${wins}W`, losses && `${losses}L`, draws && `${draws}D`].filter(Boolean).join(' ');
      const peak = scars[scars.length - 1].frontPeak;
      parts.push(`<div class="dip-label">War record</div><p class="dip-prose">${tally}${peak != null ? ` · deepest advance last war ${peak}` : ''}${losses > 0 && w?.rivalId !== rv.id ? ' · <b>revanchism available</b>' : ''}</p>`);
    }
    const off = !r.nationProclaimed ? 'Proclaim a Nation to wage war' : w ? 'You are already at war' : null;
    const cbs = off ? [] : r.availableCasusBelli(rv);
    if (this.cb && !cbs.includes(this.cb)) this.cb = null;
    const chosen = this.cb ?? cbs[0] ?? null;
    if (!this.cb && chosen) this.cb = chosen;
    const rows = cbs.map((cb) => {
      const d = CASUS_BELLI_DEFS[cb];
      const geo = cb === 'border_dispute' ? ` — ${COMPASS_FLAVOR[rv.compass]}` : '';
      return `<label class="dip-cb ${this.cb === cb ? 'on' : ''}"><input type="radio" name="cb" value="${cb}" ${this.cb === cb ? 'checked' : ''}> ` +
        `<span><b>${esc(d.name)}</b> <span class="dip-badge soft">support ${d.support}%</span><span class="dip-dim">${esc(d.desc)}${esc(geo)}</span></span></label>`;
    }).join('');
    const torn = rv.treaties.length;
    const effects: string[] = [];
    if (torn) effects.push(`tears up ${torn} treat${torn > 1 ? 'ies' : 'y'} (counted as broken)`);
    if (this.cb === 'fabricated') effects.push('legitimacy −10, priced like a broken seal');
    const allies = r.alliances.map((k) => k.split(':').map(Number)).filter(([a, b]) => a === rv.id || b === rv.id)
      .map(([a, b]) => r.rival(a === rv.id ? b : a)?.name).filter((n): n is string => !!n);
    if (allies.length) effects.push(`allies of ${rv.name} turn cold: ${allies.join(', ')}`);
    const token = this.cb ? `war:${rv.id}:${this.cb}` : '';
    parts.push(`<div class="dip-label">Declare war</div>` +
      (off ? `<p class="dip-off">${esc(off)}</p>` : `<div class="dip-cbs">${rows}</div>` +
        (this.cb ? `<p class="dip-prose">Home-front support would start at <b>${CASUS_BELLI_DEFS[this.cb].support}%</b>.${effects.length ? ` Declaring ${esc(effects.join('; '))}.` : ''}</p>` : '')) +
      `<div class="dip-actions flat">${btn('war', this.armed === token && token ? `Confirm: declare war on ${rv.name}` : `Declare war on ${rv.name}`, { id: rv.id, off: off ?? (this.cb ? null : 'Choose a casus belli'), cls: this.armed === token && token ? 'danger' : 'warn' })}</div>`);
    return parts.join('');
  }

  private worldHtml(r: RegionSim): string {
    const name = (id: number): string => esc(r.rival(id)?.name ?? '?');
    const parts: string[] = [this.noteHtml('world')];

    const c = r.coalition;
    if (c) {
      const members = c.memberIds.map((id) => r.rival(id)?.name).filter((n): n is string => !!n).map(esc).join(', ') || '?';
      if (c.warDeclared) {
        parts.push(`<div class="dip-banner bad"><b>The coalition has marched</b> — ${members} declared war together; the encirclement war is now your active war.</div>`);
      } else {
        const coh = Math.round(c.cohesion);
        parts.push(`<div class="dip-banner bad"><b>Encirclement — a coalition forms against you</b><div>Members: ${members}</div>` +
          `<div class="dip-meter-row"><span class="dip-bar intel"><i class="neg" style="left:0;width:${coh}%"></i></span><b>${coh}</b></div>` +
          `<div class="dip-dim">Cohesion dissolves below ~25 and hardens into an ultimatum at 60+. Split a member with a deal, entente or gift, yield, or win the war.</div>` +
          (c.demand != null
            ? `<p>Ultimatum: <b>${c.demand === 'tribute' ? 'pay tribute' : 'disarm'}</b>, issued ${c.ultimatumDay != null ? dateOfDay(c.ultimatumDay) : '—'}. ` +
              btn('yield', 'Yield to ultimatum', { cls: 'danger', title: 'Submit to their terms: the bloc disperses at a cost to treasury and legitimacy' }) + `</p>`
            : '') + `</div>`);
      }
    } else {
      parts.push(`<div class="dip-label">Coalition</div><p class="dip-none">No coalition stands against you.</p>`);
    }

    parts.push(`<div class="dip-label">Foreign wars</div>`);
    if (r.foreignWars.length) {
      parts.push(r.foreignWars.map((fw) => {
        const a = r.rival(fw.a);
        const b = r.rival(fw.b);
        const cost = Math.round(40 + Math.min(a?.pop ?? 0, b?.pop ?? 0) * 0.008);
        const off = !r.stateProclaimed ? 'Proclaim a State first' : r.treasury < cost ? `Need ${formatCurrency(cost)}` : null;
        return `<div class="dip-pair wide"><span>⚔ <b>${name(fw.a)}</b> vs <b>${name(fw.b)}</b> <span class="dip-dim">until ~${dateOfDay(fw.endsDay)}</span></span>` +
          btn('broker', `Broker peace ${formatCurrency(cost)}`, { id: fw.a, off, title: `Fund a mediated peace: costs ${formatCurrency(cost)}, and may be refused` }) + `</div>`;
      }).join(''));
      if (r.day < r.warBoomUntil) parts.push(`<p class="dip-dim">War abroad — export prices booming.</p>`);
    } else parts.push(`<p class="dip-none">The great powers are at peace with one another.</p>`);

    if (r.alliances.length) {
      parts.push(`<div class="dip-label">Alliances</div>` + r.alliances.map((k) => {
        const [a, b] = k.split(':').map(Number);
        const ra = r.rival(a);
        const rb = r.rival(b);
        if (!ra || !rb) return '';
        return `<p class="dip-prose">🤝 ${name(a)} – ${name(b)} <span class="dip-dim">${sameContinent(ra, rb) ? 'neighbours' : 'across the oceans'}</span></p>`;
      }).join(''));
    }

    parts.push(`<div class="dip-label">Your ententes (${r.ententes.length}/${MAX_ENTENTES})</div>` +
      (r.ententes.length
        ? r.ententes.map((e) => `<p class="dip-prose">${name(e.withRivalId)} ⚔ vs ${name(e.targetRivalId)} <span class="dip-dim">signed ${dateOfDay(e.signedDay)}</span></p>`).join('')
        : `<p class="dip-none">None. Sign one at the bargaining table.</p>`));

    parts.push(this.blocHtml(r));

    const onUs = r.activeSanctions().filter((s) => s.targetId === 0);
    const byUs = r.activeSanctions().filter((s) => s.imposerId === 0);
    if (onUs.length || byUs.length) {
      parts.push(`<div class="dip-label">Sanctions</div>` +
        onUs.map((s) => `<p class="dip-prose neg">⚠ ${name(s.imposerId)} sanctions us: −${Math.round(s.tradeReduction * 100)}% trade</p>`).join('') +
        byUs.map((s) => `<p class="dip-prose">↯ ${name(s.targetId)} sanctioned by us (−${Math.round(s.tradeReduction * 100)}%) ` + btn('lift', 'Lift', { id: s.targetId }) + `</p>`).join(''));
    }
    return parts.join('');
  }

  private blocHtml(r: RegionSim): string {
    const out: string[] = [`<div class="dip-label">Your trade bloc</div>`];
    const bloc = r.playerTradeBloc();
    if (!r.stateProclaimed) out.push(`<p class="dip-off">Proclaim a State first</p>`);
    else if (!bloc) {
      const can = r.canFormTradeBloc();
      out.push(`<p class="dip-dim">A multi-member economic union. Members must hold a trade agreement and relations ≥ ${BLOC_RELATIONS_FLOOR}.</p>` +
        `<div class="dip-actions flat">${btn('bloc-form', 'Found trade bloc', { off: can.ok ? null : can.reason, title: can.reason })}</div>` +
        (can.ok ? `<p class="dip-dim">${esc(can.reason)}</p>` : `<p class="dip-off">${esc(can.reason)}</p>`));
    } else {
      const members = bloc.memberRivalIds.map((id) => r.rival(id)?.name).filter((n): n is string => !!n).map(esc).join(', ') || 'none';
      const invitees = r.blocEligibleRivals().filter((rv) => !bloc.memberRivalIds.includes(rv.id));
      const tariff = Math.round(bloc.sharedTariff * 100);
      out.push(`<p class="dip-prose"><b>${esc(bloc.name)}</b> · est. ${bloc.foundedYear}</p>` +
        `<p class="dip-prose">Members: ${members}</p>` +
        `<p class="dip-prose">Bloc trade bonus <b>${formatCurrency(Math.floor(r.blocTradeBonus()))}/mo</b></p>` +
        `<label class="dip-tariff">Shared tariff <input type="range" id="bloc-tariff" min="0" max="50" value="${tariff}"> <b id="bloc-tariff-val">${tariff}%</b></label>` +
        `<div class="dip-actions flat">${invitees.map((rv) => btn('bloc-invite', `+ ${rv.name}`, { id: rv.id, title: `Admit ${rv.name} to the bloc` })).join('')}` +
        btn('bloc-leave', this.armLabel('bloc-leave', 'Dissolve bloc'), { cls: this.armed === 'bloc-leave' ? 'danger' : '' }) + `</div>` +
        (invitees.length === 0 ? `<p class="dip-dim">No further rivals qualify (need a trade agreement and relations ≥ ${BLOC_RELATIONS_FLOOR}).</p>` : ''));
    }
    const rb = r.rivalTradeBlocs.filter((b) => b.memberRivalIds.filter((id) => r.rival(id)).length >= 2);
    if (rb.length) {
      const friction = r.rivalBlocTariffFriction();
      out.push(`<div class="dip-label">Rival trade blocs${friction > 0 ? ` — trade friction −${Math.round(friction * 100)}%` : ''}</div>` + rb.map((b) => {
        const living = b.memberRivalIds.map((id) => r.rival(id)).filter((x): x is RivalNation => x !== undefined);
        const span = new Set(living.map((x) => rivalContinent(x))).size > 1 ? 'intercontinental' : 'continental';
        return `<p class="dip-prose">${living.map((x) => esc(x.name)).join(' · ')} <span class="dip-dim">${span}, ${Math.round(b.tariff * 100)}% external tariff, est. ${b.foundedYear}</span></p>`;
      }).join(''));
    }
    return out.join('');
  }
}

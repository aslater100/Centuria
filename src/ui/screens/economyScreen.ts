import './economyScreen.css';
import {
  BASE_PRICE, INTERMEDIATE_GOODS, REGION_BUILDINGS, ROUTE_SPECS, SECTOR_IDS, SECTOR_NAMES, TAX_BAND_LABELS,
  TAX_BAND_RATES, TECH_TREE, TRADE_GOODS,
  type RegionalBuildingDef, type RegionSim, type Route, type SectorBonusBreakdown, type SectorId, type Settlement,
} from '../../sim/region';
import { formatCurrency } from '../../sim/defs';
import { issue } from '../../sim/commands';

type Tab = 'overview' | 'sectors' | 'trade' | 'towns' | 'wonders';
type SortKey = 'name' | 'pop' | 'sat' | 'output' | 'focus' | 'tax';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'sectors', label: 'Sectors & Goods' },
  { id: 'trade', label: 'Trade & Routes' },
  { id: 'towns', label: 'Towns' },
  { id: 'wonders', label: 'Wonders' },
];

const SECTOR_COLOR: Record<SectorId, string> = {
  agriculture: 'var(--ec-agri)', industry: 'var(--ec-ind)', services: 'var(--ec-svc)', information: 'var(--ec-info)',
};

const CRITICAL_GOODS = ['food', 'fuel', 'steel', 'components'];
const SPACE_WONDERS = ['space_program', 'satellite_network', 'orbital_station'];

function esc(s: string | number): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function money(n: number, dec = 0): string {
  return formatCurrency(n, dec);
}

function compact(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  const sym = formatCurrency(0).replace(/0+$/, '');
  if (a >= 1e9) return `${sign}${sym}${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${sign}${sym}${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${sign}${sym}${(a / 1e3).toFixed(1)}k`;
  return `${sign}${sym}${Math.round(a)}`;
}

function signedMoney(n: number): string {
  const v = Math.round(n);
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatCurrency(Math.abs(v))}`;
}

function signedPct(n: number, dec = 1): string {
  const v = Number(n.toFixed(dec));
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(dec)}%`;
}

function tone(n: number, invert = false): string {
  if (Math.abs(n) < 1e-9) return 'flat';
  return (n > 0) !== invert ? 'good' : 'bad';
}

function goodName(id: string): string {
  return INTERMEDIATE_GOODS.find((g) => g.id === id)?.name ?? id;
}

function playerTowns(r: RegionSim): Settlement[] {
  return r.settlements.filter((t) => t.factionId === r.playerFactionId);
}

function townOutput(t: Settlement): number {
  return SECTOR_IDS.reduce((s, id) => s + t.sectors[id].output, 0);
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

interface Kpi { label: string; value: string; sub: string; cls: string; hint: string }

function kpiHtml(k: Kpi): string {
  return `<div class="ec-kpi ${k.cls}" title="${esc(k.hint)}"><span class="ec-kpi-l">${esc(k.label)}</span>` +
    `<b class="ec-kpi-v">${esc(k.value)}</b><span class="ec-kpi-s">${esc(k.sub)}</span></div>`;
}

function lineChart(hist: RegionSim['monthlyHistory']): string {
  if (hist.length < 2) {
    return `<p class="ec-empty">The chart fills in once two months of history have been recorded.</p>`;
  }
  const W = 640, H = 250, L = 58, R = 62, T = 20, B = 40;
  const iw = W - L - R, ih = H - T - B;
  const gdp = hist.map((h) => h.gdp);
  const tr = hist.map((h) => h.treasury);
  const gMax = niceMax(Math.max(...gdp));
  const tMin = Math.min(0, ...tr);
  const tMax = niceMax(Math.max(...tr, 1));
  const x = (i: number): number => L + (iw * i) / (hist.length - 1);
  const yG = (v: number): number => T + ih - (ih * v) / gMax;
  const yT = (v: number): number => T + ih - (ih * (v - tMin)) / (tMax - tMin);
  const path = (vals: number[], y: (v: number) => number): string =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const gy = T + (ih * i) / 4;
    const gv = gMax * (1 - i / 4);
    const tv = tMin + (tMax - tMin) * (1 - i / 4);
    grid += `<line class="ec-grid" x1="${L}" x2="${W - R}" y1="${gy}" y2="${gy}"/>` +
      `<text class="ec-ax ec-ax-g" x="${L - 8}" y="${gy + 4}" text-anchor="end">${compact(gv)}</text>` +
      `<text class="ec-ax ec-ax-t" x="${W - R + 8}" y="${gy + 4}" text-anchor="start">${compact(tv)}</text>`;
  }
  let xl = '';
  const step = hist.length > 8 ? 2 : 1;
  for (let i = 0; i < hist.length; i += step) {
    const back = hist.length - 1 - i;
    xl += `<text class="ec-ax" x="${x(i)}" y="${H - B + 18}" text-anchor="middle">${back === 0 ? 'now' : `−${back}`}</text>`;
  }
  const last = hist.length - 1;
  const summary = `GDP per month went from ${money(gdp[0])} to ${money(gdp[last])} and treasury from ${money(tr[0])} to ${money(tr[last])} over the last ${hist.length} months.`;
  return `<svg class="ec-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(summary)}">` +
    `<title>${esc(summary)}</title>${grid}` +
    `<line class="ec-axis" x1="${L}" x2="${W - R}" y1="${T + ih}" y2="${T + ih}"/>${xl}` +
    `<text class="ec-axt ec-ax-g" x="${L - 46}" y="${T + ih / 2}" text-anchor="middle" transform="rotate(-90 ${L - 46} ${T + ih / 2})">GDP / month</text>` +
    `<text class="ec-axt ec-ax-t" x="${W - 10}" y="${T + ih / 2}" text-anchor="middle" transform="rotate(90 ${W - 10} ${T + ih / 2})">Treasury</text>` +
    `<text class="ec-axt" x="${L + iw / 2}" y="${H - 4}" text-anchor="middle">months ago</text>` +
    `<path class="ec-line ec-line-g" d="${path(gdp, yG)}"/><path class="ec-line ec-line-t" d="${path(tr, yT)}"/>` +
    hist.map((h, i) => `<circle class="ec-dot ec-dot-g" cx="${x(i)}" cy="${yG(h.gdp)}" r="3"><title>${-(last - i) || 0} mo: GDP ${money(h.gdp)}</title></circle>` +
      `<rect class="ec-dot ec-dot-t" x="${x(i) - 3}" y="${yT(h.treasury) - 3}" width="6" height="6"><title>${-(last - i) || 0} mo: treasury ${money(h.treasury)}</title></rect>`).join('') +
    `</svg>` +
    `<div class="ec-legend"><span><i class="ec-sw ec-sw-g"></i>GDP / month (left axis, solid)</span>` +
    `<span><i class="ec-sw ec-sw-t"></i>Treasury (right axis, dashed)</span></div>`;
}

function mixBar(towns: Settlement[]): string {
  const outs = SECTOR_IDS.map((id) => towns.reduce((s, t) => s + t.sectors[id].output, 0));
  const total = outs.reduce((a, b) => a + b, 0);
  if (total <= 0) return `<p class="ec-empty">No sector output yet.</p>`;
  const aria = SECTOR_IDS.map((id, i) => `${SECTOR_NAMES[id]} ${Math.round((outs[i] / total) * 100)}%`).join(', ');
  return `<div class="ec-mix" role="img" aria-label="Sector mix: ${esc(aria)}">` +
    SECTOR_IDS.map((id, i) => outs[i] > 0
      ? `<span style="flex:${outs[i]};background:${SECTOR_COLOR[id]}" title="${esc(SECTOR_NAMES[id])} ${money(outs[i])}/mo"><em>${outs[i] / total >= 0.08 ? Math.round((outs[i] / total) * 100) + '%' : ''}</em></span>`
      : '').join('') +
    `</div><ul class="ec-mixkey">` +
    SECTOR_IDS.map((id, i) => `<li><i style="background:${SECTOR_COLOR[id]}"></i>${SECTOR_NAMES[id]} <b>${Math.round((outs[i] / total) * 100)}%</b> <span>${money(outs[i])}/mo</span></li>`).join('') +
    `</ul>`;
}

function meter(pct: number, cls: string): string {
  const p = Math.max(0, Math.min(100, pct));
  return `<span class="ec-meter ${cls}"><i style="width:${p}%"></i></span>`;
}

export class EconomyScreen {
  readonly el: HTMLElement;
  onFocusTown: ((id: number) => void) | null = null;
  private opened = false;
  private tab: Tab = 'overview';
  private sortKey: SortKey = 'pop';
  private sortDir: 1 | -1 = -1;
  private last: RegionSim | null = null;
  private sig = '';
  private note: { text: string; ok: boolean } | null = null;
  private readonly onKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') { ev.stopPropagation(); this.close(); }
  };

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'econ-screen hidden';
    root.appendChild(this.el);
    this.el.addEventListener('click', (ev) => this.onClick(ev));
    this.el.addEventListener('input', (ev) => {
      const t = ev.target as HTMLInputElement;
      if (t.id === 'ec-budget') {
        const out = this.el.querySelector<HTMLElement>('#ec-budget-val');
        if (out) out.textContent = `${Math.round(Number(t.value) * 100)}%`;
      }
    });
    this.el.addEventListener('change', (ev) => {
      const t = ev.target as HTMLInputElement | HTMLSelectElement;
      const r = this.last;
      if (!r) return;
      if (t.id === 'ec-budget') {
        issue(r, 'setRouteBudget', Number(t.value));
        this.redraw(r);
      } else if (t.id === 'ec-auto') {
        issue(r, 'setAutoBuildRoutes', (t as HTMLInputElement).checked);
        this.redraw(r);
      } else if (t instanceof HTMLSelectElement && t.dataset.cargo) {
        const [a, b] = t.dataset.cargo.split(':').map(Number);
        const v = t.value === '' ? null : (t.value as SectorId);
        issue(r, 'setRouteCargoPriority', a, b, v);
        this.redraw(r);
      }
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
    this.sig = '';
    this.render(r);
    this.el.querySelector<HTMLElement>('.ec-tabs button.on')?.focus();
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    document.removeEventListener('keydown', this.onKey, true);
    this.el.classList.add('hidden');
  }

  refresh(r: RegionSim): void {
    this.last = r;
    if (this.opened) this.render(r);
  }

  private redraw(r: RegionSim): void {
    this.sig = '';
    this.render(r);
  }

  private onClick(ev: MouseEvent): void {
    const t = ev.target as HTMLElement;
    const r = this.last;
    if (t === this.el || t.closest('.ec-close')) { this.close(); return; }
    if (!r) return;
    const tabBtn = t.closest<HTMLElement>('[data-tab]');
    if (tabBtn) { this.tab = tabBtn.dataset.tab as Tab; this.note = null; this.redraw(r); return; }
    const sortBtn = t.closest<HTMLElement>('[data-sort]');
    if (sortBtn) {
      const k = sortBtn.dataset.sort as SortKey;
      if (this.sortKey === k) this.sortDir = this.sortDir === 1 ? -1 : 1;
      else { this.sortKey = k; this.sortDir = k === 'name' || k === 'focus' ? 1 : -1; }
      this.redraw(r);
      return;
    }
    const act = t.closest<HTMLButtonElement>('button[data-act]');
    if (act && !act.disabled) {
      const id = Number(act.dataset.id);
      const a = Number(act.dataset.a);
      const b = Number(act.dataset.b);
      if (act.dataset.act === 'repair') {
        const ok = issue(r, 'repairRoute', a, b);
        this.note = { text: ok ? 'Repair crews dispatched — route restored.' : 'Repair refused (treasury or route state).', ok };
      } else if (act.dataset.act === 'delete') {
        const ok = issue(r, 'deleteRoute', a, b);
        this.note = { text: ok ? 'Route torn up; a trail remains.' : 'That route cannot be removed.', ok };
      } else if (act.dataset.act === 'tax') {
        const town = r.settlement(id);
        if (town) {
          const ok = issue(r, 'setCityPolicy', id, 'taxBand', Math.max(0, Math.min(3, town.policies.taxBand + Number(act.dataset.d))));
          this.note = ok ? null : { text: `${town.name} cannot be directly managed yet.`, ok: false };
        }
      }
      this.redraw(r);
      return;
    }
    const row = t.closest<HTMLElement>('tr[data-town]');
    if (row && this.onFocusTown) this.onFocusTown(Number(row.dataset.town));
  }

  private render(r: RegionSim): void {
    const html = this.build(r);
    if (html === this.sig) return;
    this.sig = html;
    const body = this.el.querySelector<HTMLElement>('.ec-body');
    const scroll = body?.scrollTop ?? 0;
    const focusId = (document.activeElement as HTMLElement | null)?.id;
    this.el.innerHTML = html;
    const nb = this.el.querySelector<HTMLElement>('.ec-body');
    if (nb) nb.scrollTop = scroll;
    if (focusId) this.el.querySelector<HTMLElement>(`#${focusId}`)?.focus();
  }

  private build(r: RegionSim): string {
    const towns = playerTowns(r);
    let body: string;
    switch (this.tab) {
      case 'overview': body = this.overview(r, towns); break;
      case 'sectors': body = this.sectors(r, towns); break;
      case 'trade': body = this.trade(r); break;
      case 'towns': body = this.towns(r, towns); break;
      default: body = this.wonders(r);
    }
    const head =
      `<header class="ec-head"><div><h2>Economy</h2><p>${r.year} · treasury <b>${money(r.treasury)}</b> · tax ${Math.round(r.taxRate * 100)}%</p></div>` +
      `<button class="ec-close" aria-label="Close economy screen" title="Close (Esc)">×</button></header>` +
      `<nav class="ec-tabs" role="tablist">` +
      TABS.map((t) => `<button role="tab" aria-selected="${t.id === this.tab}" class="${t.id === this.tab ? 'on' : ''}" data-tab="${t.id}">${t.label}</button>`).join('') +
      `</nav>`;
    const note = this.note ? `<div class="ec-note ${this.note.ok ? 'ok' : 'err'}" role="status">${esc(this.note.text)}</div>` : '';
    return `<div class="ec-inner" role="dialog" aria-modal="true" aria-label="Economy">${head}${note}<div class="ec-body">${body}</div></div>`;
  }

  private overview(r: RegionSim, towns: Settlement[]): string {
    const hist = r.monthlyHistory;
    const gdpMo = r.gdpLastMonth / 12;
    const prev = hist.length >= 2 ? hist[hist.length - 2].gdp : 0;
    const cur = hist.length >= 1 ? hist[hist.length - 1].gdp : 0;
    const growth = prev > 0 ? ((cur - prev) / prev) * 100 : 0;
    const imports = r.totalPop() * 0.025;
    const balance = r.exportEarningsLastMonth - imports;
    const infl = r.inflationRate * 100;
    const kpis: Kpi[] = [
      { label: 'GDP / month', value: money(gdpMo), sub: `${money(r.gdpLastMonth)} annualised`, cls: 'flat', hint: 'Value of all output plus trade, per month' },
      { label: 'Growth', value: hist.length >= 2 ? signedPct(growth) : 'n/a', sub: 'vs previous month', cls: hist.length >= 2 ? tone(growth) : 'flat', hint: 'Month-on-month change in sector output' },
      { label: 'Treasury', value: money(r.treasury), sub: `${signedMoney(r.treasuryDeltaMonth)} / month`, cls: tone(r.treasuryDeltaMonth), hint: 'Reserves and last month\'s net change' },
      { label: 'Inflation', value: `${infl.toFixed(1)}%`, sub: r.hasCentralBank() ? `policy rate ${(r.policyRate * 100).toFixed(1)}%` : 'no central bank', cls: infl > 6 ? 'bad' : infl > 3.5 ? 'warn' : 'good', hint: 'Annual price growth' },
      { label: 'Trade balance', value: signedMoney(balance), sub: `exports ${money(r.exportEarningsLastMonth)} · turnover ${money(r.tradeValueLastMonth)}`, cls: tone(balance), hint: 'Export earnings minus estimated imports, per month' },
      { label: 'Exchange rate', value: r.exchangeRate.toFixed(2), sub: r.hasCentralBank() ? 'vs baseline 1.00' : 'floats freely', cls: 'flat', hint: 'Value of the national currency (1.00 = parity)' },
    ];
    const factions = r.factions.length === 0 ? '' :
      `<section class="ec-card"><h3>Faction mood</h3>` +
      r.factions.map((f) => {
        const c = f.support >= 60 ? 'good' : f.support >= 40 ? 'warn' : 'bad';
        return `<div class="ec-frow" title="${esc(f.demand)}"><span>${esc(f.name)}</span>${meter(f.support, c)}<b>${Math.round(f.support)}%</b>` +
          (f.support < 40 ? `<em>${esc(f.demand)}</em>` : '') + `</div>`;
      }).join('') + `</section>`;
    return `<div class="ec-kpis">${kpis.map(kpiHtml).join('')}</div>` +
      `<div class="ec-cols"><section class="ec-card ec-wide"><h3>GDP and treasury</h3>${lineChart(hist)}</section>` +
      `<div class="ec-stack"><section class="ec-card"><h3>Sector mix</h3>${mixBar(towns)}</section>${factions}</div></div>`;
  }

  private sectors(r: RegionSim, towns: Settlement[]): string {
    const totalPop = towns.reduce((s, t) => s + r.popOf(t), 0);
    const rows = SECTOR_IDS.map((id) => {
      const out = towns.reduce((s, t) => s + t.sectors[id].output, 0);
      const share = totalPop > 0 ? towns.reduce((s, t) => s + t.sectors[id].share * r.popOf(t), 0) / totalPop : 0;
      const wage = totalPop > 0 ? towns.reduce((s, t) => s + t.sectors[id].wage * r.popOf(t), 0) / totalPop : 0;
      const trend = towns.reduce((s, t) => s + t.sectors[id].growth, 0) / Math.max(1, towns.length);
      const parts = towns.map((t) => r.sectorBonusBreakdown(t.id, id)).filter((x): x is SectorBonusBreakdown => x !== null);
      const avg = (k: keyof Omit<SectorBonusBreakdown, 'sector'>): number =>
        parts.length ? parts.reduce((s, p) => s + p[k], 0) / parts.length : 0;
      return { id, out, share, wage, trend, avg };
    });
    const pct = (v: number): string => (Math.abs(v) < 0.0005 ? '<span class="ec-dim">—</span>' : signedPct(v * 100, 1));
    const sectorTable =
      `<table class="ec-table"><thead><tr><th>Sector</th><th class="n">Output / mo</th><th class="n">Workforce</th><th class="n">Wage</th><th class="n">Trend</th>` +
      `<th class="n" title="Civic and economic buildings">Buildings</th><th class="n" title="Worked-ring terrain yield">Terrain</th><th class="n" title="Placed buildings on suiting terrain">Siting</th>` +
      `<th class="n" title="Same-sector adjacency clustering">Adjacency</th><th class="n" title="District zones">Districts</th><th class="n" title="Empire-wide wonders">Wonders</th><th class="n">Bonus</th></tr></thead><tbody>` +
      rows.map((s) =>
        `<tr><td><i class="ec-sw-dot" style="background:${SECTOR_COLOR[s.id]}"></i>${SECTOR_NAMES[s.id]}</td><td class="n">${money(s.out)}</td>` +
        `<td class="n">${Math.round(s.share * 100)}%</td><td class="n">${money(s.wage, 1)}</td>` +
        `<td class="n ${tone(s.trend)}">${s.trend > 0.0005 ? '▲' : s.trend < -0.0005 ? '▼' : '■'}</td>` +
        `<td class="n">${pct(s.avg('buildings'))}</td><td class="n">${pct(s.avg('terrain'))}</td><td class="n">${pct(s.avg('terrainMatch'))}</td>` +
        `<td class="n">${pct(s.avg('districtAdjacency'))}</td><td class="n">${pct(s.avg('districtZone'))}</td><td class="n">${pct(s.avg('wonder'))}</td>` +
        `<td class="n"><b>${pct(s.avg('total'))}</b></td></tr>`).join('') +
      `</tbody></table><p class="ec-foot">Bonus columns are the average output bonus per town, decomposed by source. Wage is £ per worker per month.</p>`;
    return `<section class="ec-card"><h3>Sector output and bonuses</h3><div class="ec-scroll">${sectorTable}</div></section>` +
      this.goods(r, towns);
  }

  private goods(r: RegionSim, towns: Settlement[]): string {
    const snap = r.supplyChainSnapshot();
    const healthPct = Math.round(snap.health * 100);
    const hc = snap.severity === 0 ? 'good' : snap.severity < 0.3 ? 'warn' : 'bad';
    const drag = (1 - snap.outputMult) * 100;
    let head =
      `<div class="ec-health"><span>Supply chain</span>${meter(healthPct, hc)}<b>${healthPct}%</b>` +
      `<em>${snap.supplied.size}/${snap.active.length} goods flowing${drag > 0.05 ? ` · industry −${drag.toFixed(1)}%` : ' · no shock'}</em></div>`;
    for (const e of snap.embargoes) {
      head += `<p class="ec-alert">${esc(e.raw.toUpperCase())} embargo — ${e.cut >= 1 ? 'cut off' : `${Math.round(e.cut * 100)}% cut`}, about ${Math.max(1, Math.round(e.daysLeft / 30))} months left</p>`;
    }
    const priceRows = TRADE_GOODS.map((g) => {
      const avg = towns.length ? towns.reduce((s, t) => s + t.prices[g], 0) / towns.length : BASE_PRICE[g];
      const ratio = avg / BASE_PRICE[g];
      const c = ratio > 1.5 ? 'bad' : ratio > 1.15 ? 'warn' : ratio < 0.7 ? 'info' : 'good';
      const label = ratio > 1.5 ? 'scarce' : ratio > 1.15 ? 'tight' : ratio < 0.7 ? 'glut' : 'stable';
      return `<tr class="${ratio > 1.15 ? 'short' : ''}"><td>${esc(g[0].toUpperCase() + g.slice(1))}</td><td class="n">${money(avg, 3)}</td>` +
        `<td class="n">${Math.round(ratio * 100)}% of base</td><td><span class="ec-chip ${c}">${label}</span></td></tr>`;
    }).join('');
    const goodsRows = snap.active
      .map((id) => ({ id, ok: snap.supplied.has(id), lvl: snap.levels.get(id) ?? (snap.supplied.has(id) ? 1 : 0) }))
      .sort((a, b) => Number(a.ok) - Number(b.ok) || a.lvl - b.lvl)
      .map(({ id, ok, lvl }) => {
        const def = INTERMEDIATE_GOODS.find((g) => g.id === id);
        const partial = !ok && lvl > 0.001;
        const c = ok ? 'good' : partial ? 'warn' : 'bad';
        const txt = ok ? 'supplied' : partial ? `${Math.round(lvl * 100)}% running` : 'disrupted';
        const crit = CRITICAL_GOODS.includes(id);
        return `<tr class="${ok ? '' : 'short'}"><td>${esc(goodName(id))}${crit ? ' <span class="ec-chip info" title="Critical good">critical</span>' : ''}</td>` +
          `<td class="n">${Math.round(r.goodStock(id)).toLocaleString('en-US')}</td>` +
          `<td class="n">${def ? Math.round(def.baseOutput) : '—'}</td>` +
          `<td class="ec-dim">${esc(def ? def.inputs.map(goodName).join(', ') : '')}</td>` +
          `<td><span class="ec-chip ${c}">${txt}</span></td></tr>`;
      }).join('');
    const hungry = towns.filter((t) => t.food < r.popOf(t) * 5);
    return `<section class="ec-card"><h3>Goods and supply</h3>${head}` +
      (snap.active.length === 0
        ? `<p class="ec-empty">No manufacturing supply chain yet — it begins ${Math.min(...INTERMEDIATE_GOODS.map((g) => g.eraUnlock))}.</p>`
        : `<div class="ec-scroll"><table class="ec-table"><thead><tr><th>Good</th><th class="n">Stock</th><th class="n">Output / mo</th><th>Inputs</th><th>Status</th></tr></thead><tbody>${goodsRows}</tbody></table></div>`) +
      `<h4>Local markets (average across your towns)</h4>` +
      `<table class="ec-table ec-narrow"><thead><tr><th>Good</th><th class="n">Price</th><th class="n">Vs base</th><th>Status</th></tr></thead><tbody>${priceRows}</tbody></table>` +
      (hungry.length ? `<p class="ec-alert">Food shortage in ${hungry.map((t) => esc(t.name)).join(', ')}</p>` : '') +
      `</section>`;
  }

  private trade(r: RegionSim): string {
    const routes = [...r.routes]
      .filter((rt) => {
        const a = r.settlement(rt.a), b = r.settlement(rt.b);
        return (a && a.factionId === r.playerFactionId) || (b && b.factionId === r.playerFactionId);
      })
      .sort((x, y) => Number(x.kind === 'trail') - Number(y.kind === 'trail') || x.condition - y.condition);
    const upkeep = r.routeUpkeepProjected();
    const canAuto = r.has('road_building');
    const controls =
      `<section class="ec-card ec-ctrl"><div class="ec-slider"><label for="ec-budget">Maintenance budget</label>` +
      `<input id="ec-budget" type="range" min="0" max="1.5" step="0.1" value="${r.routeBudget}" aria-describedby="ec-budget-help">` +
      `<b id="ec-budget-val">${Math.round(r.routeBudget * 100)}%</b></div>` +
      `<p id="ec-budget-help" class="ec-foot">Projected upkeep <b>${money(upkeep, 1)}</b> / month. Underfunded routes decay; overfunding mends them faster.</p>` +
      `<label class="ec-check${canAuto ? '' : ' off'}"><input id="ec-auto" type="checkbox" ${r.autoBuildRoutes ? 'checked' : ''} ${canAuto ? '' : 'disabled'}> Auto-build roads` +
      `${canAuto ? '' : ` <span class="ec-dim">(needs ${esc(TECH_TREE.find((n) => n.id === 'road_building')?.name ?? 'Road Building')})</span>`}</label>` +
      `<div class="ec-tradestats"><span>Exports <b>${money(r.exportEarningsLastMonth)}</b>/mo</span><span>Trade turnover <b>${money(r.tradeValueLastMonth)}</b>/mo</span></div></section>`;
    const item = (rt: Route): string => {
      const a = r.settlement(rt.a)?.name ?? '?';
      const b = r.settlement(rt.b)?.name ?? '?';
      const cap = r.effectiveCapacity(rt);
      const max = rt.sea ? 130 : ROUTE_SPECS[rt.kind].capacity;
      const cc = rt.condition >= 70 ? 'good' : rt.condition >= 40 ? 'warn' : 'bad';
      const built = rt.kind !== 'trail';
      const cost = r.repairCost(rt);
      const canRepair = built && r.stateProclaimed && rt.condition < 99 && r.treasury >= cost;
      const cargo = rt.cargoPriority ?? '';
      const auto = rt.cargoType ? SECTOR_NAMES[rt.cargoType] : 'none';
      const repairWhy = !r.stateProclaimed ? 'Needs statehood' : !built ? 'Trails mend themselves' : rt.condition >= 99 ? 'In good order' : r.treasury < cost ? 'Treasury too low' : `Repair for ${money(cost)}`;
      return `<article class="ec-route"><header><b>${esc(a)} ↔ ${esc(b)}</b><span class="ec-chip ${built ? 'info' : 'flat'}">${rt.sea ? 'sea lane' : rt.kind}</span></header>` +
        `<div class="ec-rmeter"><span>Condition</span>${meter(rt.condition, cc)}<b>${Math.round(rt.condition)}%</b></div>` +
        `<div class="ec-rmeter"><span>Load</span>${meter(cap > 0 ? (rt.freight / cap) * 100 : 0, 'info')}<b>${Math.round(rt.freight)}/${Math.round(cap)}</b></div>` +
        `<p class="ec-foot">Capacity ${Math.round(max)} at full condition · upkeep ${money(r.maintBill(rt) * r.routeBudget, 1)}/mo · cargo: ${esc(auto)}</p>` +
        `<div class="ec-ractions"><label>Cargo priority <select data-cargo="${rt.a}:${rt.b}" aria-label="Cargo priority for ${esc(a)} to ${esc(b)}">` +
        `<option value=""${cargo === '' ? ' selected' : ''}>Automatic</option>` +
        SECTOR_IDS.map((s) => `<option value="${s}"${cargo === s ? ' selected' : ''}>${SECTOR_NAMES[s]}</option>`).join('') + `</select></label>` +
        `<button data-act="repair" data-a="${rt.a}" data-b="${rt.b}" ${canRepair ? '' : 'disabled'} title="${esc(repairWhy)}">Repair${canRepair ? ' · ' + money(cost) : ''}</button>` +
        `<button class="danger" data-act="delete" data-a="${rt.a}" data-b="${rt.b}" ${built && r.stateProclaimed ? '' : 'disabled'} title="${built ? 'Tear up the link; a trail remains' : 'Trails cannot be removed'}">Tear up</button></div></article>`;
    };
    return controls + `<section class="ec-card"><h3>Routes (${routes.length})</h3>` +
      (routes.length ? `<div class="ec-routes">${routes.map(item).join('')}</div>` : `<p class="ec-empty">No routes yet. Found more towns to link them.</p>`) + `</section>`;
  }

  private towns(r: RegionSim, towns: Settlement[]): string {
    const val = (t: Settlement): string | number => {
      switch (this.sortKey) {
        case 'name': return t.name;
        case 'pop': return r.popOf(t);
        case 'sat': return t.satisfaction;
        case 'output': return townOutput(t);
        case 'focus': return t.focus;
        default: return t.policies.taxBand;
      }
    };
    const sorted = [...towns].sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : Number(x) - Number(y);
      return c * this.sortDir || a.name.localeCompare(b.name);
    });
    const th = (k: SortKey, label: string, num = false): string => {
      const on = this.sortKey === k;
      return `<th class="${num ? 'n' : ''}" aria-sort="${on ? (this.sortDir === 1 ? 'ascending' : 'descending') : 'none'}">` +
        `<button data-sort="${k}" class="ec-sort${on ? ' on' : ''}">${label}<span aria-hidden="true">${on ? (this.sortDir === 1 ? ' ▲' : ' ▼') : ''}</span></button></th>`;
    };
    const rows = sorted.map((t) => {
      const out = townOutput(t);
      const band = Math.min(3, Math.max(0, t.policies.taxBand));
      const rev = out * TAX_BAND_RATES[band];
      const hungry = t.food < r.popOf(t) * 5;
      const sc = t.satisfaction >= 65 ? 'good' : t.satisfaction >= 40 ? 'warn' : 'bad';
      const focus = t.focus === 'balanced' ? 'Balanced' : SECTOR_NAMES[t.focus];
      return `<tr data-town="${t.id}" class="${this.onFocusTown ? 'click' : ''}"><td><b>${esc(t.name)}</b>${hungry ? ' <span class="ec-chip bad">hungry</span>' : ''}</td>` +
        `<td class="n">${Math.round(r.popOf(t)).toLocaleString('en-US')}</td>` +
        `<td class="n"><span class="ec-sat">${meter(t.satisfaction, sc)}<b>${Math.round(t.satisfaction)}</b></span></td>` +
        `<td class="n">${money(out)}<small> / mo</small></td><td>${esc(focus)}</td>` +
        `<td class="n"><span class="ec-step"><button data-act="tax" data-d="-1" data-id="${t.id}" ${band <= 0 ? 'disabled' : ''} aria-label="Lower tax band for ${esc(t.name)}">−</button>` +
        `<span title="${money(rev, 1)}/mo revenue">${esc(TAX_BAND_LABELS[band])}</span>` +
        `<button data-act="tax" data-d="1" data-id="${t.id}" ${band >= 3 ? 'disabled' : ''} aria-label="Raise tax band for ${esc(t.name)}">+</button></span></td></tr>`;
    }).join('');
    return `<section class="ec-card"><h3>Your settlements (${towns.length})</h3>` +
      (towns.length ? `<div class="ec-scroll"><table class="ec-table ec-towns"><thead><tr>${th('name', 'Town')}${th('pop', 'Population', true)}${th('sat', 'Satisfaction', true)}${th('output', 'Output', true)}${th('focus', 'Focus')}${th('tax', 'Tax band', true)}</tr></thead><tbody>${rows}</tbody></table></div>` +
        `<p class="ec-foot">${this.onFocusTown ? 'Select a row to focus that town on the map. ' : ''}Tax band changes apply to directly managed towns (capital or 100+ population once a state exists).</p>`
        : `<p class="ec-empty">No towns yet.</p>`) + `</section>`;
  }

  private wonders(r: RegionSim): string {
    const row = (def: RegionalBuildingDef): string => {
      const ownerId = r.wonderOwner[def.id];
      const builder = ownerId === undefined ? r.settlements.find((s) => s.construction?.id === def.id) : undefined;
      const era = def.prereq ? TECH_TREE.find((n) => n.id === def.prereq)?.era : undefined;
      let status: string;
      if (ownerId !== undefined) {
        status = ownerId === r.playerFactionId ? `<span class="ec-chip good">yours</span>` : `<span class="ec-chip bad">${esc(r.faction(ownerId)?.name ?? 'a rival')}</span>`;
      } else if (builder) {
        status = `<span class="ec-chip warn">rising at ${esc(builder.name)}</span>`;
      } else if (era !== undefined && era > r.year) {
        status = `<span class="ec-chip flat">unlocks ~${era}</span>`;
      } else {
        status = `<span class="ec-chip info">unclaimed</span>`;
      }
      return `<tr title="${esc(def.desc ?? def.name)}"><td>${esc(def.name)}</td><td class="n">★ ${def.prestige ?? 0}</td><td>${status}</td></tr>`;
    };
    const uniques = REGION_BUILDINGS.filter((b) => b.unique === true);
    const table = (list: RegionalBuildingDef[]): string =>
      `<table class="ec-table ec-narrow"><thead><tr><th>Wonder</th><th class="n">Prestige</th><th>Status</th></tr></thead><tbody>${list.map(row).join('')}</tbody></table>`;
    const space = uniques.filter((b) => SPACE_WONDERS.includes(b.id));
    const classic = uniques.filter((b) => !SPACE_WONDERS.includes(b.id));
    return `<section class="ec-card"><h3>Wonder race</h3><p class="ec-health"><span>Accrued prestige</span><b class="gold">★ ${Math.round(r.prestige)}</b></p>` +
      (space.length ? `<h4>The space race</h4>${table(space)}` : '') +
      (classic.length ? `<h4>Classic wonders</h4>${table(classic)}` : '') + `</section>`;
  }
}

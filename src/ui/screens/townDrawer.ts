import './townDrawer.css';
import type { Settlement, TownFocus, WagePolicy, ResourceStatus, SectorId, Notable } from '../../sim/region';
import {
  RegionSim, AGE_BANDS, ROLE_BONUS_DESC, REGION_BUILDINGS, DISTRICT_DEFS, SECTOR_IDS, SECTOR_NAMES,
  FOCUS_CHANGE_COST, TAX_BAND_LABELS, SEA_WALL_YEAR,
} from '../../sim/region';
import { formatCurrency, DAYS_PER_YEAR } from '../../sim/defs';
import { issue } from '../../sim/commands';
import { flagDataUrl } from '../flag';

type Tab = 'overview' | 'economy' | 'people' | 'defence';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'economy', label: 'Economy' },
  { id: 'people', label: 'People' },
  { id: 'defence', label: 'Defence' },
];

const SECTOR_VARS: Record<SectorId, string> = {
  agriculture: 'var(--warn)',
  industry: '#c08a5a',
  services: 'var(--info)',
  information: '#b18cf0',
};

const UNREST_LABELS = ['Calm', 'Petitions', 'Strikes', 'Protests', 'Riots', 'Revolution'];
const SERVICE_LABELS = ['minimal', 'standard', 'generous'];
const WAGE_POLICIES: WagePolicy[] = ['low', 'market', 'high'];

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function tierOf(pop: number): string {
  return pop < 30 ? 'Shack' : pop < 80 ? 'Cottage' : pop < 200 ? 'House' : pop < 500 ? 'Town' : pop < 1000 ? 'Manor' : 'Castle';
}

function meter(pct: number, tone: 'good' | 'warn' | 'bad' | 'info', fill?: string): string {
  const w = Math.max(0, Math.min(100, pct));
  return `<span class="td-meter"><span class="td-meter-fill td-${tone}" style="width:${w.toFixed(1)}%${fill ? `;background:${fill}` : ''}"></span></span>`;
}

function satTone(v: number): 'good' | 'warn' | 'bad' {
  return v >= 60 ? 'good' : v >= 35 ? 'warn' : 'bad';
}

function grievTone(v: number): 'good' | 'warn' | 'bad' {
  return v <= 30 ? 'good' : v <= 60 ? 'warn' : 'bad';
}

function statusChip(label: string, s: ResourceStatus): string {
  const glyph = s === 'surplus' ? '▲' : s === 'deficit' ? '▼' : '●';
  return `<span class="td-chip td-chip-${s}" title="${label}: ${s}"><b>${label}</b> ${glyph} ${s}</span>`;
}

export class TownDrawer {
  readonly el: HTMLElement;
  onStartBuild: ((townId: number, id: string) => void) | null = null;
  onStartDistrict: ((townId: number, id: string) => void) | null = null;
  onFound: ((townId: number) => void) | null = null;

  private opened = false;
  private id: number | null = null;
  private tab: Tab = 'overview';
  private last: RegionSim | null = null;
  private renaming = false;
  private lastHtml = '';

  private readonly onKey = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Escape' || this.renaming) return;
    ev.stopPropagation();
    this.close();
  };

  constructor(root: HTMLElement) {
    this.el = document.createElement('aside');
    this.el.className = 'town-drawer';
    this.el.setAttribute('aria-label', 'Town');
    root.appendChild(this.el);
    this.el.addEventListener('click', (ev) => this.onClick(ev));
  }

  get isOpen(): boolean {
    return this.opened;
  }

  get townId(): number | null {
    return this.opened ? this.id : null;
  }

  open(r: RegionSim, townId: number): void {
    if (this.id !== townId) { this.renaming = false; }
    this.id = townId;
    this.last = r;
    if (!this.opened) document.addEventListener('keydown', this.onKey, true);
    this.opened = true;
    this.lastHtml = '';
    this.el.classList.add('open');
    this.render(r);
  }

  close(): void {
    if (this.opened) document.removeEventListener('keydown', this.onKey, true);
    this.opened = false;
    this.renaming = false;
    this.el.classList.remove('open');
  }

  refresh(r: RegionSim): void {
    this.last = r;
    if (this.opened && !this.renaming) this.render(r);
  }

  private town(r: RegionSim): Settlement | undefined {
    return this.id === null ? undefined : r.settlements.find((s) => s.id === this.id);
  }

  private render(r: RegionSim): void {
    const t = this.town(r);
    if (!t) { this.close(); return; }
    const html = this.html(r, t);
    if (html === this.lastHtml) return;
    const body = this.el.querySelector<HTMLElement>('.td-body');
    const top = body ? body.scrollTop : 0;
    this.lastHtml = html;
    this.el.innerHTML = html;
    const nb = this.el.querySelector<HTMLElement>('.td-body');
    if (nb) nb.scrollTop = top;
  }

  private rerender(): void {
    this.lastHtml = '';
    if (this.last) this.render(this.last);
  }

  private onClick(ev: MouseEvent): void {
    const r = this.last;
    const t = r ? this.town(r) : undefined;
    if (!r || !t) return;
    const target = ev.target as HTMLElement;
    const tabBtn = target.closest<HTMLElement>('[data-tab]');
    if (tabBtn) { this.tab = tabBtn.dataset.tab as Tab; this.rerender(); return; }
    if (target.closest('.td-close')) { this.close(); return; }
    if (target.closest('.td-rename')) { this.startRename(t); return; }
    const b = target.closest<HTMLButtonElement>('button[data-act]');
    if (!b || b.disabled) return;
    this.act(r, t, b);
  }

  private startRename(t: Settlement): void {
    const title = this.el.querySelector<HTMLElement>('.td-title');
    if (!title) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 28;
    input.value = t.name;
    input.className = 'td-rename-input';
    input.setAttribute('aria-label', 'Town name');
    title.replaceWith(input);
    this.renaming = true;
    input.focus();
    input.select();
    let done = false;
    const commit = (save: boolean): void => {
      if (done) return;
      done = true;
      this.renaming = false;
      const v = input.value.trim();
      if (save && v) t.name = v;
      this.rerender();
    };
    input.onkeydown = (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); commit(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); commit(false); }
      ev.stopPropagation();
    };
    input.onblur = () => commit(true);
  }

  private act(r: RegionSim, t: Settlement, b: HTMLButtonElement): void {
    const d = b.dataset;
    switch (d.act) {
      case 'found': this.onFound?.(t.id); break;
      case 'build': this.onStartBuild?.(t.id, d.id ?? ''); break;
      case 'district': this.onStartDistrict?.(t.id, d.id ?? ''); break;
      case 'focus': issue(r, 'setTownFocus', t.id, d.v as TownFocus); break;
      case 'tax': issue(r, 'setCityPolicy', t.id, 'taxBand', Number(d.v)); break;
      case 'wage': issue(r, 'setCityPolicy', t.id, 'wagePolicy', d.v as WagePolicy); break;
      case 'svc': issue(r, 'setCityPolicy', t.id, 'serviceLevel', Number(d.v)); break;
      case 'seawall': issue(r, 'buildSeaWall', t.id); break;
      case 'floodproof': issue(r, 'buildFloodProof', t.id); break;
      case 'retreat': issue(r, 'doManagedRetreat', t.id); break;
      case 'militia': issue(r, 'recruitMilitia', t.id); break;
      case 'aid': issue(r, 'sendFoodAid', t.id); break;
    }
    this.rerender();
  }

  private html(r: RegionSim, t: Settlement): string {
    const own = t.factionId === r.playerFactionId;
    const pop = Math.round(r.popOf(t));
    const faction = r.faction(t.factionId);
    const ident = !own ? faction?.identity : undefined;
    const flag = ident
      ? `<img class="td-flag" src="${flagDataUrl(ident.flag, 36, 24)}" alt="">`
      : !own && faction ? `<span class="td-swatch" style="background:${esc(faction.color)}"></span>` : '';
    const onStrike = r.day < t.strikeUntil;

    const header =
      `<header class="td-head">` +
      `<div class="td-titlebar">${flag}<h2 class="td-title">${esc(t.name)}</h2>` +
      (own ? `<button class="td-icon td-rename" title="Rename this town" aria-label="Rename">✎</button>` : '') +
      `<button class="td-icon td-close" title="Close (Esc)" aria-label="Close">✕</button></div>` +
      `<div class="td-sub">${tierOf(pop)} · pop <b>${pop}</b> · ${Math.max(0, Math.floor((r.day - t.foundedDay) / DAYS_PER_YEAR))}y old` +
      (!own && faction ? ` · <span class="td-owner">${esc(faction.name)}</span>` : '') +
      (onStrike ? ` · <span class="td-bad">on strike</span>` : '') + `</div>` +
      `<div class="td-meters">` +
      `<div class="td-mrow"><span>Satisfaction</span>${meter(t.satisfaction, satTone(t.satisfaction))}<b>${Math.round(t.satisfaction)}</b></div>` +
      `<div class="td-mrow"><span>Grievance</span>${meter(t.grievance, grievTone(t.grievance))}<b>${Math.round(t.grievance)}</b></div>` +
      `</div></header>`;

    const tabs =
      `<nav class="td-tabs" role="tablist">` +
      TABS.map((x) => `<button role="tab" class="td-tab${this.tab === x.id ? ' active' : ''}" data-tab="${x.id}" aria-selected="${this.tab === x.id}">${x.label}</button>`).join('') +
      `</nav>`;

    let body: string;
    if (!own) body = this.foreignBody(r, t);
    else if (this.tab === 'overview') body = this.overviewBody(r, t);
    else if (this.tab === 'economy') body = this.economyBody(r, t);
    else if (this.tab === 'people') body = this.peopleBody(r, t);
    else body = this.defenceBody(r, t);

    return header + (own ? tabs : '') + `<div class="td-body">${body}</div>`;
  }

  private stat(label: string, value: string, title = ''): string {
    return `<div class="td-stat"${title ? ` title="${esc(title)}"` : ''}><span>${label}</span><b>${value}</b></div>`;
  }

  private terrainLine(t: Settlement): string {
    const bits = [
      t.site.river ? 'river' : '',
      t.site.coastal ? (t.seaWall ? 'coastal, sea wall' : 'coastal') : '',
      t.site.forest > 0.5 ? 'forested' : '',
      t.site.roughness > 0.5 ? 'rough country' : '',
      t.site.fertility > 1.05 ? 'rich soil' : t.site.fertility < 0.7 ? 'poor soil' : '',
    ].filter(Boolean);
    return bits.length ? bits.join(' · ') : 'open plains';
  }

  private foreignBody(r: RegionSim, t: Settlement): string {
    const pop = Math.round(r.popOf(t));
    const g = Math.round(t.garrisonStrength || 0);
    return (
      `<section class="td-sec"><h3>Summary</h3><div class="td-grid">` +
      this.stat('Population', String(pop)) +
      this.stat('Garrison', String(g)) +
      this.stat('Buildings', String(t.buildings.length)) +
      this.stat('Loyalty', `${Math.round(t.loyaltyToFaction)}`) +
      this.stat('Terrain', this.terrainLine(t)) +
      `</div><p class="td-note">A foreign town. Deal with it through diplomacy or force.</p></section>`
    );
  }

  private overviewBody(r: RegionSim, t: Settlement): string {
    const rs = r.getSettlementResourceStatus(t);
    const cons = t.construction ? REGION_BUILDINGS.find((b) => b.id === t.construction!.id) : undefined;
    let consHtml = '';
    if (cons && t.construction) {
      const c = t.construction;
      const left = Math.max(0, c.doneDay - r.day);
      const pct = cons.days > 0 ? 100 - (left / cons.days) * 100 : 100;
      consHtml =
        `<section class="td-sec"><h3>Construction</h3>` +
        `<div class="td-cons"><span>${esc(cons.name)}</span>${meter(pct, 'info')}<b>${left}d</b></div></section>`;
    }
    const events = t.recentEvents.length
      ? `<ul class="td-events">${t.recentEvents.slice(0, 8).map((ev) =>
        `<li class="td-ev-${ev.kind}"><span class="td-day">d${ev.day}</span>${esc(ev.text)}</li>`).join('')}</ul>`
      : `<p class="td-note">Nothing of note has happened yet.</p>`;
    const hungry = t.food < r.popOf(t) * 5;
    const aid = hungry && r.stateProclaimed
      ? `<button class="td-btn" data-act="aid" ${r.treasury >= 10 ? '' : 'disabled'} title="Send emergency grain (${formatCurrency(10)})">Send grain aid (${formatCurrency(10)})</button>`
      : '';
    return (
      `<section class="td-sec"><h3>Key stats</h3><div class="td-grid">` +
      this.stat('Housing', String(Math.floor(t.housing))) +
      this.stat('Land quality', t.landQuality.toFixed(2)) +
      this.stat('Food', String(Math.floor(t.food))) +
      this.stat('Wood', String(Math.floor(t.wood))) +
      this.stat('Grain price', formatCurrency(t.prices.food, 2), 'per unit') +
      this.stat('Timber price', formatCurrency(t.prices.wood, 2), 'per unit') +
      `</div><p class="td-note">${this.terrainLine(t)}</p></section>` +
      `<section class="td-sec"><h3>Resources</h3><div class="td-chips">` +
      statusChip('Food', rs.food) + statusChip('Wood', rs.wood) + statusChip('Goods', rs.goods) +
      `</div>${aid}</section>` +
      consHtml +
      `<section class="td-sec"><h3>Recent events</h3>${events}</section>`
    );
  }

  private pillGroup(act: string, current: string | number, opts: { v: string | number; label: string; title?: string }[]): string {
    return `<div class="td-pills">` + opts.map((o) =>
      `<button class="td-pill${String(o.v) === String(current) ? ' on' : ''}" data-act="${act}" data-v="${o.v}"` +
      `${String(o.v) === String(current) ? ' disabled' : ''}${o.title ? ` title="${esc(o.title)}"` : ''}>${o.label}</button>`).join('') + `</div>`;
  }

  private economyBody(r: RegionSim, t: Settlement): string {
    const total = SECTOR_IDS.reduce((s, id) => s + t.sectors[id].output, 0);
    const sectors = SECTOR_IDS.map((id) => {
      const s = t.sectors[id];
      const pct = Math.round(s.share * 100);
      const arrow = s.growth > 0.001 ? '▲' : s.growth < -0.001 ? '▼' : '–';
      const cls = s.growth > 0.001 ? 'td-good' : s.growth < -0.001 ? 'td-bad' : 'td-dim';
      const bd = r.sectorBonusBreakdown(t.id, id);
      const bonus = bd && bd.total > 0.0005 ? `<em class="td-bonus" title="Spatial output bonus">+${Math.round(bd.total * 100)}%</em>` : '<em class="td-bonus"></em>';
      return (
        `<div class="td-sector"><span class="td-sname" style="color:${SECTOR_VARS[id]}">${SECTOR_NAMES[id]}</span>` +
        meter(pct, 'info', SECTOR_VARS[id]) +
        `<b>${pct}%</b><i class="${cls}">${arrow}</i>` +
        `<span class="td-dim td-out">${s.output.toFixed(1)}/m</span>${bonus}</div>`
      );
    }).join('');

    const manage = r.stateProclaimed ? r.canManageCity(t) : { ok: true, reason: '' };
    const focusOpts = (['balanced', ...SECTOR_IDS] as TownFocus[]).map((f) => ({
      v: f,
      label: f === 'balanced' ? 'Balanced' : SECTOR_NAMES[f],
      title: `Shift labour toward ${f} (${formatCurrency(FOCUS_CHANGE_COST)})`,
    }));
    const focus = `<section class="td-sec"><h3>Focus</h3>${this.pillGroup('focus', t.focus, focusOpts)}</section>`;

    let works: string;
    if (!manage.ok) {
      works = `<section class="td-sec"><h3>City works</h3><p class="td-note">${esc(manage.reason)}</p></section>`;
    } else {
      const p = t.policies;
      const policies =
        `<section class="td-sec"><h3>Local policies</h3>` +
        `<div class="td-prow"><span>Tax</span>${this.pillGroup('tax', p.taxBand, TAX_BAND_LABELS.map((l, i) => ({ v: i, label: l })))}</div>` +
        `<div class="td-prow"><span>Wages</span>${this.pillGroup('wage', p.wagePolicy, WAGE_POLICIES.map((w) => ({ v: w, label: w })))}</div>` +
        `<div class="td-prow"><span>Services</span>${this.pillGroup('svc', p.serviceLevel, SERVICE_LABELS.map((l, i) => ({ v: i, label: l })))}</div>` +
        `</section>`;
      works = policies + this.buildingsHtml(r, t);
    }
    return (
      `<section class="td-sec"><h3>Sectors${total > 0 ? ` <small>${formatCurrency(total * 1.08, 1)}/month</small>` : ''}</h3>${sectors}</section>` +
      focus + works
    );
  }

  private buildingsHtml(r: RegionSim, t: Settlement): string {
    const counts = new Map<string, number>();
    for (const id of t.buildings) counts.set(id, (counts.get(id) ?? 0) + 1);
    const built = [...counts.entries()].map(([id, n]) => {
      const d = REGION_BUILDINGS.find((b) => b.id === id);
      return d ? `<span class="td-tag" title="${esc(d.desc)}">${esc(d.name)}${n > 1 ? ` ×${n}` : ''}</span>` : '';
    }).join('');
    const rows = REGION_BUILDINGS
      .filter((def) => (!def.prereq || r.has(def.prereq)) && r.buildingCount(t, def.id) < def.max)
      .map((def) => {
        const chk = r.cityBuildCheck(t, def);
        return (
          `<li class="td-build${chk.ok ? '' : ' blocked'}"><div><b>${esc(def.name)}</b><small>${esc(def.desc)}</small>` +
          (chk.ok ? '' : `<small class="td-why">${esc(chk.reason)}</small>`) + `</div>` +
          `<button class="td-btn" data-act="build" data-id="${def.id}" ${chk.ok ? '' : 'disabled'}>${formatCurrency(r.cityBuildCost(def))} · ${def.days}d</button></li>`
        );
      }).join('');
    const drows = DISTRICT_DEFS
      .filter((def) => !def.prereq || r.has(def.prereq))
      .map((def) => {
        const chk = r.districtBuildCheck(t, def);
        return (
          `<li class="td-build${chk.ok ? '' : ' blocked'}"><div><b>${esc(def.name)}</b><small>${esc(def.desc)}</small>` +
          (chk.ok ? '' : `<small class="td-why">${esc(chk.reason)}</small>`) + `</div>` +
          `<button class="td-btn" data-act="district" data-id="${def.id}" ${chk.ok ? '' : 'disabled'}>${formatCurrency(r.districtCost(def))}</button></li>`
        );
      }).join('');
    const cons = t.construction ? REGION_BUILDINGS.find((b) => b.id === t.construction!.id) : undefined;
    return (
      `<section class="td-sec"><h3>Buildings</h3>` +
      (built ? `<div class="td-tags">${built}</div>` : `<p class="td-note">No civic works raised yet.</p>`) +
      (cons && t.construction ? `<p class="td-note">Building ${esc(cons.name)}, ${Math.max(0, t.construction.doneDay - r.day)} days left.</p>` : '') +
      `</section>` +
      (rows ? `<section class="td-sec"><h3>Build</h3><ul class="td-list">${rows}</ul></section>` : '') +
      (drows ? `<section class="td-sec"><h3>Districts</h3><ul class="td-list">${drows}</ul></section>` : '')
    );
  }

  private pyramid(t: Settlement): string {
    const bands = t.cohorts.bands;
    const max = Math.max(1, ...bands);
    const rowH = 22;
    const W = 340;
    const mid = 48 + (W - 48 - 36) / 2;
    const half = (W - 48 - 36) / 2;
    const rows = bands.map((v, i) => {
      const y = (bands.length - 1 - i) * rowH;
      const w = (v / max) * half;
      return (
        `<rect x="${mid - w}" y="${y + 3}" width="${w}" height="${rowH - 6}" rx="2" class="td-py-l"/>` +
        `<rect x="${mid}" y="${y + 3}" width="${w}" height="${rowH - 6}" rx="2" class="td-py-r"/>` +
        `<text x="0" y="${y + rowH / 2 + 4}" class="td-py-lbl">${AGE_BANDS[i]}</text>` +
        `<text x="${W - 4}" y="${y + rowH / 2 + 4}" text-anchor="end" class="td-py-val">${Math.round(v)}</text>`
      );
    }).join('');
    return `<svg class="td-pyramid" viewBox="0 0 ${W} ${bands.length * rowH}" role="img" aria-label="Age pyramid">${rows}</svg>`;
  }

  private notableHtml(n: Notable): string {
    const arc = n.arc && !n.arc.resolved ? `<span class="td-arc">${n.arc.kind}</span>` : '';
    const last = n.bio.length ? `<small>${esc(n.bio[n.bio.length - 1])}</small>` : '';
    return (
      `<li class="td-notable"><div><b>${esc(n.name)}</b>, ${Math.floor(n.age)} ` +
      `<abbr class="td-role" title="${esc(ROLE_BONUS_DESC[n.role])}">${n.role}</abbr>${arc}</div>${last}</li>`
    );
  }

  private peopleBody(r: RegionSim, t: Settlement): string {
    const notables = r.notablesAt(t.id);
    const lvl = r.unrestLevel;
    const ladder = r.stateProclaimed
      ? `<section class="td-sec"><h3>Unrest ladder</h3>` +
        `<div class="td-ladder">${UNREST_LABELS.map((l, i) => `<span class="td-rung${i <= lvl ? ' on' : ''} td-r${i}" title="${l}"></span>`).join('')}</div>` +
        `<p class="td-note">Nation: <b>${UNREST_LABELS[lvl]}</b>. This town: grievance ${Math.round(t.grievance)}` +
        `${r.day < t.strikeUntil ? ', on strike' : t.grievance > 60 ? ', strikes likely' : ''}.</p></section>`
      : '';
    return (
      `<section class="td-sec"><h3>Age pyramid</h3>${this.pyramid(t)}</section>` +
      `<section class="td-sec"><h3>Notables</h3>` +
      (notables.length ? `<ul class="td-list">${notables.map((n) => this.notableHtml(n)).join('')}</ul>` : `<p class="td-note">No notable figures live here.</p>`) +
      `</section>` + ladder +
      this.foundHtml(r, t)
    );
  }

  private foundHtml(r: RegionSim, t: Settlement): string {
    const can = r.canFoundTown(t.id);
    return (
      `<section class="td-sec"><h3>Expansion</h3>` +
      `<button class="td-btn wide" data-act="found" ${can.ok ? '' : 'disabled'}>Found expedition (8 pop, 80 food, 80 wood)</button>` +
      (can.ok ? '' : `<p class="td-note td-why">${esc(can.reason)}</p>`) + `</section>`
    );
  }

  private defenceBody(r: RegionSim, t: Settlement): string {
    const g = Math.round(t.garrisonStrength || 0);
    const cap = r.garrisonCap(t);
    const can = r.canRecruitMilitia(t.id);
    const units = t.stationedUnits.length;
    const garrison =
      `<section class="td-sec"><h3>Garrison</h3>` +
      `<div class="td-cons"><span>Militia</span>${meter(cap > 0 ? (g / cap) * 100 : 0, 'info')}<b>${g}/${cap}</b></div>` +
      (units ? `<p class="td-note">${units} unit${units === 1 ? '' : 's'} stationed.</p>` : '') +
      `<button class="td-btn wide" data-act="militia" ${can.ok ? '' : 'disabled'}>Drill militia (+${RegionSim.MILITIA_ADD}, ${formatCurrency(r.militiaCost())})</button>` +
      (can.ok ? '' : `<p class="td-note td-why">${esc(can.reason)}</p>`) + `</section>`;

    let climate = '';
    const parts: string[] = [];
    if (t.site.coastal) {
      if (t.seaWall) parts.push(`<p class="td-note td-good">Sea wall raised. Tidal flooding cannot reach this town.</p>`);
      else if (r.stateProclaimed && r.year >= SEA_WALL_YEAR) {
        parts.push(
          `<button class="td-btn wide" data-act="seawall" ${r.treasury >= r.seaWallCost(t) ? '' : 'disabled'}>Sea wall ${formatCurrency(r.seaWallCost(t))}</button>` +
          `<p class="td-note">Granite and pumps against the rising sea.</p>`);
      }
    }
    if (r.canFloodProof(t.id)) {
      parts.push(
        `<button class="td-btn wide" data-act="floodproof" ${r.treasury >= r.floodProofCost(t) ? '' : 'disabled'}>Flood-proof ${formatCurrency(r.floodProofCost(t))}</button>` +
        `<p class="td-note">Halves tidal damage for less than a sea wall.</p>`);
    } else if (t.floodProofed && !t.seaWall) {
      parts.push(`<p class="td-note td-good">Flood-proofed: partial protection.</p>`);
    }
    if (r.canManagedRetreat(t.id)) {
      parts.push(
        `<button class="td-btn wide danger" data-act="retreat" ${r.treasury >= r.managedRetreatCost(t) ? '' : 'disabled'}>Managed retreat ${formatCurrency(r.managedRetreatCost(t))}</button>` +
        `<p class="td-note">Relocate inland permanently: brutal short-term, ends all flood risk.</p>`);
    }
    climate = parts.length
      ? `<section class="td-sec"><h3>Climate defences</h3>${parts.join('')}</section>`
      : `<section class="td-sec"><h3>Climate defences</h3><p class="td-note">${t.site.coastal || t.site.river ? 'No works available yet.' : 'Not exposed to tidal flooding.'}</p></section>`;
    return garrison + climate;
  }
}

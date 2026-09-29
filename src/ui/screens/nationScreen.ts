import './nationScreen.css';
import {
  AGENDA_PEACE_RESISTANCE, BLOCKADE_UPKEEP_PER_POP, CASUS_BELLI_DEFS, DEPRESSION_MEASURES, FRONT_OCCUPY_THRESHOLD,
  FRONT_PEAK_LEVERAGE_SCALE, FRONT_PHASE_LABEL, GEOENGINEER_COOLING, GOV_LEANS, GOV_OUTLAY_RESERVE_MONTHS, GOV_TYPES,
  INSOLVENCY_COLLAPSE_MONTHS, MAX_OCCUPIED_MARCHES, MAX_POLICY_RATE, MIN_POLICY_RATE, MINISTER_ROLES, MOBILIZATION_DEFS,
  OCCUPATION_DEFS, PEACE_TERMS, POLICY_CARDS, POLICY_SWAP_COST, REGION_LAWS, RIVAL_ARCHETYPES, RIVAL_REGIMES, UNIT_TYPES,
  WAR_SUPPORT_FLOOR, frontPhase, rivalAgendaKind,
  type ArmyUnit, type ArmyUnitType, type GovLean, type GovType, type MinisterRoleId, type Mobilization,
  type MonetaryRegime, type OccupationPolicy, type PeaceTerm, type PlayerWar, type RegionSim, type RivalNation,
} from '../../sim/region';
import { compositionMult } from '../../sim/systems/military';
import { CURRENCY_SYMBOLS, DAYS_PER_MONTH, DAYS_PER_YEAR, MONTHS, START_YEAR, formatCurrency, type CurrencySymbol } from '../../sim/defs';
import { ANNOUNCE_LEAD_DAYS } from '../../sim/currency';
import { issue } from '../../sim/commands';

export type NationTab = 'government' | 'budget' | 'politics' | 'military';
export type FiscalKey = 'taxRate' | 'servicesLevel' | 'militiaLevel';

const TABS: { id: NationTab; label: string }[] = [
  { id: 'government', label: 'Government' },
  { id: 'budget', label: 'Budget' },
  { id: 'politics', label: 'Politics' },
  { id: 'military', label: 'Military' },
];

const LEVEL_LABEL = ['None', 'Basic', 'Funded'];
const UNIT_ORDER: ArmyUnitType[] = ['militia', 'cavalry', 'artillery', 'warship'];
const UNREST_LABELS = ['Calm', 'Petitions', 'Strikes', 'Protests', 'Riots', 'Revolution'];
const REACH_LABEL: Record<string, string> = {
  word_of_mouth: 'Word of mouth', press: 'Press', radio: 'Radio', television: 'Television', internet: 'Internet', algorithmic: 'Algorithmic',
};
const BOND_SIZES = [50, 100, 250];

function esc(s: string | number): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function money(n: number, dec?: number): string {
  return formatCurrency(dec === undefined ? Math.round(n) : n, dec);
}

function signedMoney(n: number): string {
  const v = Math.round(n);
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatCurrency(Math.abs(v))}`;
}

function meter(pct: number, cls: string): string {
  const p = Math.max(0, Math.min(100, pct));
  return `<span class="nt-meter ${cls}"><i style="width:${p}%"></i></span>`;
}

function toneOf(v: number, good: number, warn: number): string {
  return v >= good ? 'good' : v >= warn ? 'warn' : 'bad';
}

interface Kpi { label: string; value: string; sub: string; cls: string; hint: string }

function kpiHtml(k: Kpi): string {
  return `<div class="nt-kpi ${k.cls}" title="${esc(k.hint)}"><span class="nt-kpi-l">${esc(k.label)}</span>` +
    `<b class="nt-kpi-v">${esc(k.value)}</b><span class="nt-kpi-s">${esc(k.sub)}</span></div>`;
}

interface BtnOpts {
  act: string;
  data?: Record<string, string | number>;
  off?: string | null;
  cls?: string;
  title?: string;
  on?: boolean;
}

function btn(label: string, o: BtnOpts): string {
  const data = Object.entries(o.data ?? {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  const title = o.off ? o.off : o.title ?? '';
  return `<button type="button" class="nt-btn${o.cls ? ` ${o.cls}` : ''}${o.on ? ' on' : ''}" data-act="${o.act}"${data}` +
    `${o.off ? ' disabled' : ''}${title ? ` title="${esc(title)}"` : ''}>${label}</button>`;
}

function card(title: string, body: string, cls = ''): string {
  return `<section class="nt-card${cls ? ` ${cls}` : ''}"><h3>${esc(title)}</h3>${body}</section>`;
}

function locked(text: string): string {
  return `<div class="nt-locked"><span aria-hidden="true">🔒</span><p>${esc(text)}</p></div>`;
}

function why(text: string | null): string {
  return text ? `<p class="nt-why">${esc(text)}</p>` : '';
}

function dateOfDay(day: number): string {
  const month = MONTHS[Math.floor((day % DAYS_PER_YEAR) / DAYS_PER_MONTH)];
  return `${month} ${(day % DAYS_PER_MONTH) + 1}, ${START_YEAR + Math.floor(day / DAYS_PER_YEAR)}`;
}

function playerTowns(r: RegionSim): RegionSim['settlements'] {
  return r.settlements.filter((t) => t.factionId === r.playerFactionId);
}

function activePolicyUpkeep(r: RegionSim): number {
  return r.activePolicies.reduce((s, id) => s + (POLICY_CARDS.find((c) => c.id === id)?.upkeep ?? 0), 0);
}

export class NationScreen {
  readonly el: HTMLElement;
  onSetFiscal: ((k: FiscalKey, v: number) => void) | null = null;
  onSetPolicyRate: ((v: number) => void) | null = null;
  onProclaimNation: (() => void) | null = null;
  private opened = false;
  private tab: NationTab = 'government';
  private last: RegionSim | null = null;
  private sig = '';
  private note: { text: string; ok: boolean } | null = null;
  private drafts = new Map<string, string>();
  private peacePicks = new Set<PeaceTerm>();
  private policySlot = -1;
  private conventionOpen = false;
  private convName = '';
  private convGov: GovType = 'democracy';
  private convMinisters = new Map<MinisterRoleId, string>();
  private charterName = 'The Valley State';
  private charterLean: GovLean = 'council';
  private pendingSwitch: CurrencySymbol | null = null;
  private pendingCapitulate = false;
  private dragging = false;
  private readonly onKey = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Escape') return;
    ev.stopPropagation();
    if (this.policySlot >= 0 && this.last) { this.policySlot = -1; this.redraw(this.last); return; }
    this.close();
  };

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'nation-screen hidden';
    root.appendChild(this.el);
    this.el.addEventListener('click', (ev) => this.onClick(ev));
    this.el.addEventListener('pointerdown', (ev) => {
      if ((ev.target as HTMLElement).matches('input[type=range]')) this.dragging = true;
    });
    const endDrag = (): void => { this.dragging = false; };
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
    this.el.addEventListener('input', (ev) => this.onInput(ev));
    this.el.addEventListener('change', (ev) => this.onChange(ev));
  }

  get isOpen(): boolean {
    return this.opened;
  }

  open(r: RegionSim, tab?: NationTab): void {
    this.last = r;
    if (tab) this.tab = tab;
    if (!this.opened) document.addEventListener('keydown', this.onKey, true);
    this.opened = true;
    this.el.classList.remove('hidden');
    this.note = null;
    this.redraw(r);
    this.el.querySelector<HTMLElement>('.nt-tabs button.on')?.focus();
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.policySlot = -1;
    document.removeEventListener('keydown', this.onKey, true);
    this.el.classList.add('hidden');
  }

  refresh(r: RegionSim): void {
    this.last = r;
    if (!this.opened) return;
    const a = document.activeElement as HTMLElement | null;
    const editing = !!a && this.el.contains(a) && a.matches('input:not([type=range]), select');
    if (this.dragging || editing) return;
    this.render(r);
  }

  private redraw(r: RegionSim): void {
    this.sig = '';
    this.render(r);
  }

  private say(text: string, ok: boolean): void {
    this.note = { text, ok };
  }

  private res(result: { ok: boolean; reason?: string }, okText: string, failText: string): void {
    this.say(result.ok ? okText : result.reason ?? failText, result.ok);
  }

  private num(key: string, def: number): number {
    const v = Number(this.drafts.get(key) ?? def);
    return Number.isFinite(v) ? v : def;
  }

  private onInput(ev: Event): void {
    const t = ev.target as HTMLInputElement;
    if (t.dataset.draft) this.drafts.set(t.dataset.draft, t.value);
    if (t.id === 'nt-tax') {
      const out = this.el.querySelector<HTMLElement>('#nt-tax-v');
      if (out) out.textContent = `${t.value}%`;
      this.onSetFiscal?.('taxRate', Number(t.value) / 100);
    } else if (t.id === 'nt-rate') {
      const out = this.el.querySelector<HTMLElement>('#nt-rate-v');
      if (out) out.textContent = `${t.value}%`;
      this.onSetPolicyRate?.(Number(t.value) / 100);
    } else if (t.id === 'nt-conv-name') {
      this.convName = t.value;
    } else if (t.id === 'nt-charter-name') {
      this.charterName = t.value;
    }
  }

  private onChange(ev: Event): void {
    const t = ev.target as HTMLInputElement | HTMLSelectElement;
    const r = this.last;
    if (!r) return;
    if (t.id === 'nt-tax' || t.id === 'nt-rate') { this.redraw(r); return; }
    if (t instanceof HTMLSelectElement && t.dataset.role) {
      this.convMinisters.set(t.dataset.role as MinisterRoleId, t.value);
    } else if (t.name === 'nt-gov') {
      this.convGov = t.value as GovType;
      this.redraw(r);
    } else if (t.name === 'nt-lean') {
      this.charterLean = t.value as GovLean;
      this.redraw(r);
    }
  }

  private onClick(ev: MouseEvent): void {
    const t = ev.target as HTMLElement;
    const r = this.last;
    if (t === this.el || t.closest('.nt-close')) { this.close(); return; }
    if (!r) return;
    if (t.classList.contains('nt-modal-veil')) { this.policySlot = -1; this.redraw(r); return; }
    const tabBtn = t.closest<HTMLElement>('[data-tab]');
    if (tabBtn) {
      this.tab = tabBtn.dataset.tab as NationTab;
      this.note = null;
      this.redraw(r);
      return;
    }
    const b = t.closest<HTMLButtonElement>('button[data-act]');
    if (!b || b.disabled) return;
    this.act(r, b.dataset.act ?? '', b.dataset);
    this.redraw(r);
  }

  private act(r: RegionSim, act: string, d: DOMStringMap): void {
    const arg = d.arg ?? '';
    switch (act) {
      case 'fiscal': {
        const k = d.k as FiscalKey;
        this.onSetFiscal?.(k, Number(d.v));
        return;
      }
      case 'charter':
        issue(r, 'completeIncorporation', this.charterName, this.charterLean);
        this.say(r.stateProclaimed ? `${r.stateName} is proclaimed.` : 'The charter could not be signed.', r.stateProclaimed);
        return;
      case 'conv-open':
        this.conventionOpen = true;
        if (!this.convName) this.convName = r.stateName ? `Republic of ${r.stateName}` : 'New Republic';
        return;
      case 'conv-cancel': this.conventionOpen = false; return;
      case 'conv-proclaim': {
        const assignments: Partial<Record<MinisterRoleId, number | null>> = {};
        for (const mr of MINISTER_ROLES) {
          const v = this.convMinisters.get(mr.id) ?? '';
          assignments[mr.id] = v ? Number(v) : null;
        }
        const name = (this.convName || `Republic of ${r.stateName}`).trim();
        issue(r, 'proclaimNation', name, this.convGov, assignments);
        if (r.nationProclaimed) {
          this.conventionOpen = false;
          this.say(`${r.nationName} is proclaimed.`, true);
          this.onProclaimNation?.();
        } else {
          this.say('The convention could not proclaim that form of government.', false);
        }
        return;
      }
      case 'law':
        this.say(issue(r, 'enactLaw', arg) ? 'Law enacted.' : 'That law cannot be enacted right now.', r.passedLaws.has(arg));
        return;
      case 'slot': this.policySlot = Number(arg); return;
      case 'slot-close': this.policySlot = -1; return;
      case 'policy':
        if (issue(r, 'setPolicy', this.policySlot, arg)) { this.policySlot = -1; this.say('Policy adopted.', true); }
        else this.say('That policy could not be adopted.', false);
        return;
      case 'policy-clear':
        if (issue(r, 'setPolicy', this.policySlot, null)) { this.policySlot = -1; this.say('Policy slot cleared.', true); }
        return;
      case 'dismiss-briefs': r.dismissAdvisorBriefs(); return;
      case 'loan': {
        const lender = Number(d.lender);
        const res = issue(r, 'requestLoan', lender, this.num(`loan-amt-${lender}`, 0), this.num(`loan-term-${lender}`, 12));
        this.res(res, 'Loan granted.', 'Loan rejected.');
        return;
      }
      case 'repay': {
        const id = Number(d.loan);
        const res = issue(r, 'repayLoan', id, this.num(`repay-${id}`, 0));
        this.res(res, 'Repayment made.', 'Repayment failed.');
        return;
      }
      case 'bonds':
      {
        const ok = issue(r, 'issueBonds', Number(arg));
        this.say(ok ? `Issued ${money(Number(arg))} in bonds.` : 'Bond issue refused.', ok);
        return;
      }
      case 'regime': issue(r, 'setMonetaryRegime', arg as MonetaryRegime); return;
      case 'cb-draw': this.res(issue(r, 'borrowFromCentralBank', Number(arg)), 'Discount window drawn.', 'Request rejected.'); return;
      case 'cb-repay': this.res(issue(r, 'repayCentralBank', Number(arg)), 'Discount window repaid.', 'Request rejected.'); return;
      case 'cur-announce': {
        const res = issue(r, 'announceCurrencyChange', arg as CurrencySymbol);
        this.res(res, `Announced a switch to ${arg}.`, 'Announcement refused.');
        return;
      }
      case 'cur-ask': this.pendingSwitch = arg as CurrencySymbol; return;
      case 'cur-cancel': this.pendingSwitch = null; return;
      case 'cur-switch': {
        const cause = r.confidence < 30 ? 'crisis' : 'strategic';
        const res = issue(r, 'changeCurrency', arg as CurrencySymbol, cause);
        this.pendingSwitch = null;
        this.res(res, `Currency standard switched to ${arg}.`, 'Switch refused.');
        return;
      }
      case 'geo': this.say(issue(r, 'deployGeoengineering') ? 'Stratospheric aerosols deployed.' : 'Deployment refused.', true); return;
      case 'media-censor': this.res(issue(r, 'censorMedia'), 'Press censored.', 'Refused.'); return;
      case 'media-license': this.res(issue(r, 'grantPressLicense'), 'Press licences granted.', 'Refused.'); return;
      case 'media-platform': this.res(issue(r, 'enactPlatformRegulation'), 'Platform regulation enacted.', 'Refused.'); return;
      case 'media-public': this.res(issue(r, 'fundPublicMedia'), 'Public media funded.', 'Refused.'); return;
      case 'media-literacy': this.res(issue(r, 'investMediaLiteracy'), 'Media-literacy programme funded.', 'Refused.'); return;
      case 'crackdown': issue(r, 'crackdownProtests'); this.say('Crackdown ordered.', true); return;
      case 'concede':
        this.say(issue(r, 'concedeToProtesters') ? 'Concessions granted; unrest eases.' : 'The treasury cannot cover the concessions.', r.unrestLevel < 4);
        return;
      case 'depression': this.res(issue(r, 'enactDepressionMeasure', arg as 'qe' | 'gold' | 'publicworks'), 'Measure enacted.', 'Refused.'); return;
      case 'recovery':
        this.say(issue(r, 'chooseRecoveryPath', arg as 'stimulus' | 'austerity') ? `Recovery path: ${arg}.` : 'Choice unavailable.', true);
        return;
      case 'mob': issue(r, 'setMobilization', arg as Mobilization); return;
      case 'blockade': issue(r, 'setBlockade', !r.playerWar?.blockade); return;
      case 'ally': this.say(issue(r, 'callAlly', Number(arg)) ? 'The ally answers the call.' : 'The call goes unanswered.', true); return;
      case 'occ': issue(r, 'setOccupationPolicy', arg as OccupationPolicy); return;
      case 'recruit': {
        const type = arg as ArmyUnitType;
        const n = issue(r, 'recruitUnits', type, Math.floor(this.num(`recruit-${type}`, 5)));
        this.say(n === null ? 'Recruitment refused.' : `Recruited ${type}.`, n !== null);
        return;
      }
      case 'term': {
        const term = arg as PeaceTerm;
        if (this.peacePicks.has(term)) this.peacePicks.delete(term); else this.peacePicks.add(term);
        return;
      }
      case 'offer':
        if (issue(r, 'offerPeaceBasket', [...this.peacePicks])) { this.peacePicks.clear(); this.say('The terms are accepted.', true); }
        else this.say('The other side has not signed. Check the log for a counter-offer.', false);
        return;
      case 'cap-ask': this.pendingCapitulate = true; return;
      case 'cap-cancel': this.pendingCapitulate = false; return;
      case 'capitulate':
        issue(r, 'capitulate');
        this.pendingCapitulate = false;
        this.peacePicks.clear();
        this.say('You have capitulated.', false);
        return;
      case 'yield': this.say(issue(r, 'yieldToCoalition') ? 'You yield to the ultimatum.' : 'Nothing to yield to.', true); return;
      default:
    }
  }

  private render(r: RegionSim): void {
    const html = this.build(r);
    if (html === this.sig) return;
    this.sig = html;
    const body = this.el.querySelector<HTMLElement>('.nt-body');
    const scroll = body?.scrollTop ?? 0;
    const focusId = (document.activeElement as HTMLElement | null)?.id;
    this.el.innerHTML = html;
    const nb = this.el.querySelector<HTMLElement>('.nt-body');
    if (nb) nb.scrollTop = scroll;
    if (focusId) this.el.querySelector<HTMLElement>(`#${focusId}`)?.focus();
  }

  private build(r: RegionSim): string {
    let body: string;
    switch (this.tab) {
      case 'government': body = this.government(r); break;
      case 'budget': body = this.budget(r); break;
      case 'politics': body = this.politics(r); break;
      default: body = this.military(r);
    }
    const title = r.nationProclaimed ? r.nationName : r.stateProclaimed ? r.stateName : r.stateName || 'The Region';
    const gov = r.nationProclaimed && r.govType
      ? GOV_TYPES.find((g) => g.id === r.govType)?.name ?? ''
      : r.govLean ? GOV_LEANS[r.govLean].name : 'Unincorporated region';
    const tier = r.nationProclaimed ? 'Nation' : r.stateProclaimed ? 'State' : 'Region';
    const head =
      `<header class="nt-head"><div><h2>${esc(title)}</h2>` +
      `<p><span class="nt-tier">${tier}</span> ${esc(gov)} · ${r.year} · treasury <b>${money(r.treasury)}</b>` +
      (r.stateProclaimed ? ` · political capital <b>${Math.round(r.politicalCapital)} PC</b>` : '') +
      (r.nationProclaimed ? ` · legitimacy <b>${Math.round(r.legitimacy)}</b>` : '') + `</p></div>` +
      `<button class="nt-close" aria-label="Close nation screen" title="Close (Esc)">×</button></header>` +
      `<nav class="nt-tabs" role="tablist">` +
      TABS.map((t) => `<button role="tab" aria-selected="${t.id === this.tab}" class="${t.id === this.tab ? 'on' : ''}" data-tab="${t.id}">${t.label}</button>`).join('') +
      `</nav>`;
    const note = this.note ? `<div class="nt-note ${this.note.ok ? 'ok' : 'err'}" role="status">${esc(this.note.text)}</div>` : '';
    return `<div class="nt-inner" role="dialog" aria-modal="true" aria-label="Nation">${head}${note}<div class="nt-body">${body}</div>` +
      `${this.policySlot >= 0 ? this.policyPicker(r) : ''}</div>`;
  }

  // ------------------------------------------------------------ Government

  private government(r: RegionSim): string {
    if (!r.stateProclaimed) return this.governmentPreState(r);
    const cols: string[] = [];
    if (r.nationProclaimed) cols.push(this.regimeCard(r), this.cabinetCard(r), this.policySlotsCard(r));
    else cols.push(this.stateCard(r), this.conventionCard(r));
    const right = [this.lawsCard(r)];
    if (r.nationProclaimed) right.unshift(this.briefsCard(r));
    else right.push(locked('Ministers, policy slots and the advisor briefs unlock when the nation is proclaimed at the Constitutional Convention.'));
    return `<div class="nt-cols"><div class="nt-stack">${cols.join('')}</div><div class="nt-stack">${right.join('')}</div></div>`;
  }

  private governmentPreState(r: RegionSim): string {
    const towns = playerTowns(r);
    const garrison = towns.reduce((s, t) => s + r.garrisonOf(t), 0);
    const req = (label: string, met: boolean, detail: string): string =>
      `<li class="${met ? 'met' : ''}"><span aria-hidden="true">${met ? '✓' : '○'}</span>${esc(label)}<em>${esc(detail)}</em></li>`;
    const list = `<ul class="nt-reqs">` +
      req('3 connected towns', towns.length >= 3 && r.connectedToAll(), `${towns.length} town${towns.length === 1 ? '' : 's'}${r.connectedToAll() ? ', linked' : ', not all linked by routes'}`) +
      req('500 citizens', r.totalPop() >= 500, `${Math.round(r.totalPop())}`) +
      req('Net treasury ' + money(8000), r.getNetTreasury() >= 8000, money(r.getNetTreasury())) +
      req('Garrison 10+', garrison >= 10, `${garrison}`) + `</ul>`;
    const eligible = r.charterEligible();
    const progress = `<div class="nt-row"><span>Charter drafting</span>${meter(r.charterProgress, eligible ? 'good' : 'info')}<b>${Math.round(r.charterProgress)}%</b></div>` +
      `<p class="nt-foot">${eligible ? 'The Mayor is drafting the Regional Charter: about 90 days.' : 'Drafting begins once every requirement is met.'}</p>`;
    const form = r.ceremonyPending ? this.charterForm() : '';
    return `<div class="nt-cols"><div class="nt-stack">${card('Regional Charter', list + progress + form)}</div>` +
      `<div class="nt-stack">${locked('Unlocks at statehood: laws, political capital, factions, elections, credit and the central bank.')}` +
      `${locked('Unlocks at nationhood: form of government, cabinet, policy slots and sovereign bonds.')}</div></div>`;
  }

  private charterForm(): string {
    const leans = (Object.keys(GOV_LEANS) as GovLean[]).map((k) =>
      `<label class="nt-choice"><input type="radio" name="nt-lean" value="${k}"${this.charterLean === k ? ' checked' : ''}>` +
      `<span><b>${esc(GOV_LEANS[k].name)}</b><em>${esc(GOV_LEANS[k].desc)}</em></span></label>`).join('');
    return `<div class="nt-form"><h4>The Incorporation</h4><p class="nt-foot">The charter is drafted. Name the State and choose how it is ruled. Signing costs ${money(4000)}.</p>` +
      `<input id="nt-charter-name" class="nt-input wide" type="text" maxlength="28" value="${esc(this.charterName)}" aria-label="State name">` +
      `<div class="nt-choices">${leans}</div>${btn('Proclaim the State', { act: 'charter', cls: 'gold' })}</div>`;
  }

  private stateCard(r: RegionSim): string {
    const lean = r.govLean ? GOV_LEANS[r.govLean] : null;
    return card(`State of ${r.stateName}`,
      (lean ? `<p><b>${esc(lean.name)}</b></p><p class="nt-foot">${esc(lean.desc)}</p>` : '') +
      `<p class="nt-foot">Territory held: <b>${Math.round(r.playerTerritoryControl() * 100)}%</b> of the map.</p>`);
  }

  private conventionCard(r: RegionSim): string {
    const gates = r.canCallConventionGates();
    const list = `<ul class="nt-reqs">` + gates.map((g) =>
      `<li class="${g.met ? 'met' : ''}"><span aria-hidden="true">${g.met ? '✓' : '○'}</span>${esc(g.label)}<em>${esc(g.detail)}</em></li>`).join('') + `</ul>`;
    const ready = r.canCallConvention();
    const hegemon = r.proclamationReady
      ? `<p class="nt-good">Regional hegemon: the nation gate is unlocked.</p>`
      : `<p class="nt-foot">Territory ${Math.round(r.playerTerritoryControl() * 100)}% of the 50% needed for the nation gate.</p>`;
    const action = this.conventionOpen ? '' : btn('Convene the Constitutional Convention', {
      act: 'conv-open', cls: 'gold', off: ready ? null : 'Meet every requirement above first.',
    });
    return card('Path to Nationhood', list + hegemon + `<div class="nt-actions">${action}</div>` + (ready && this.conventionOpen ? this.conventionForm(r) : ''));
  }

  private conventionForm(r: RegionSim): string {
    const notables = r.notables.filter((n) => n.alive);
    const govs = GOV_TYPES.map((g) => {
      const closed = g.maxYear !== undefined && r.year > g.maxYear;
      const open = g.minYear !== undefined && r.year < g.minYear;
      return `<label class="nt-choice${closed || open ? ' off' : ''}"><input type="radio" name="nt-gov" value="${g.id}"` +
        `${this.convGov === g.id ? ' checked' : ''}${closed || open ? ' disabled' : ''}>` +
        `<span><b>${esc(g.name)}</b><em>${esc(g.legitimacySource)}. Tax cap ${g.taxCap}%.${g.militiaBonus > 0 ? ` Militia +${g.militiaBonus}.` : ''}` +
        `${closed ? ` No longer adoptable after ${g.maxYear}.` : ''}${open ? ` Not before ${g.minYear}.` : ''}</em></span></label>`;
    }).join('');
    const mins = MINISTER_ROLES.map((mr) => {
      const cur = this.convMinisters.get(mr.id) ?? '';
      return `<label class="nt-minsel"><span><b>${esc(mr.title)}</b><em>${esc(mr.bonus)}</em></span>` +
        `<select class="nt-input" data-role="${mr.id}"><option value="">— vacant —</option>` +
        notables.map((n) => `<option value="${n.id}"${String(n.id) === cur ? ' selected' : ''}>${esc(n.name)} (${esc(n.role)})</option>`).join('') +
        `</select></label>`;
    }).join('');
    return `<div class="nt-form"><h4>The Constitutional Convention</h4>` +
      `<p class="nt-foot">${Math.round(r.totalPop()).toLocaleString()} citizens · ${r.settlements.length} towns · ${r.researched.size} discoveries. Convention expenses ${money(25000)}.</p>` +
      `<input id="nt-conv-name" class="nt-input wide" type="text" maxlength="36" placeholder="Name the nation" value="${esc(this.convName)}" aria-label="Nation name">` +
      `<h4>Form of government</h4><div class="nt-choices">${govs}</div><h4>Appoint ministers</h4><div class="nt-minlist">${mins}</div>` +
      `<div class="nt-actions">${btn('Proclaim the Nation', { act: 'conv-proclaim', cls: 'gold' })}${btn('Cancel', { act: 'conv-cancel' })}</div></div>`;
  }

  private regimeCard(r: RegionSim): string {
    const def = GOV_TYPES.find((g) => g.id === r.govType);
    const leg = Math.round(r.legitimacy);
    const floor = r.govType ? WAR_SUPPORT_FLOOR[r.govType] : 0;
    return card(def?.name ?? 'Regime',
      `<div class="nt-row"><span>Legitimacy</span>${meter(leg, toneOf(leg, 60, 35))}<b>${leg}</b></div>` +
      (def ? `<dl class="nt-facts"><dt>Source of legitimacy</dt><dd>${esc(def.legitimacySource)}</dd>` +
        `<dt>Elections</dt><dd>${def.electionsRequired ? 'Required' : 'Not required'}</dd>` +
        `<dt>Tax norm</dt><dd>cap ${def.taxCap}%</dd><dt>Policy slots</dt><dd>${def.policySlots.length}</dd>` +
        `<dt>War-support floor</dt><dd>${floor}</dd></dl>` : ''));
  }

  private cabinetCard(r: RegionSim): string {
    const rows = MINISTER_ROLES.map((mr) => {
      const n = r.ministerFor(mr.id);
      return `<tr><td>${esc(mr.title)}</td><td>${n ? `<b>${esc(n.name)}</b> <small>${esc(n.role)}</small>` : '<span class="nt-dim">vacant</span>'}</td>` +
        `<td class="n">${n ? `skill ${Math.round(n.skill)}` : ''}</td><td class="nt-dim">${esc(mr.bonus)}</td></tr>`;
    }).join('');
    return card('Cabinet', `<div class="nt-scroll"><table class="nt-table"><tbody>${rows}</tbody></table></div>`);
  }

  private briefsCard(r: RegionSim): string {
    if (r.advisorBriefs.length === 0) return card('Advisor Briefs', `<p class="nt-empty">No briefs. Your advisors have nothing to report.</p>`);
    const rows = r.advisorBriefs.map((b) =>
      `<li><b>${esc(b.portfolio)}</b> ${esc(b.message)} <small>${START_YEAR + Math.floor(b.day / DAYS_PER_YEAR)}</small></li>`).join('');
    return card('Advisor Briefs', `<ul class="nt-briefs">${rows}</ul><div class="nt-actions">${btn('Dismiss all', { act: 'dismiss-briefs' })}</div>`);
  }

  private policySlotsCard(r: RegionSim): string {
    const def = GOV_TYPES.find((g) => g.id === r.govType);
    if (!def) return '';
    const slots = def.policySlots.map((domain, i) => {
      const id = r.activePolicies[i] ?? null;
      const c = id ? POLICY_CARDS.find((x) => x.id === id) : null;
      const off = c && r.politicalCapital < POLICY_SWAP_COST ? `Swapping costs ${POLICY_SWAP_COST} PC (you have ${Math.round(r.politicalCapital)}).` : null;
      return `<div class="nt-slot"><span class="nt-slot-d">${esc(domain)}</span>` +
        `<b>${c ? esc(c.name) : '<span class="nt-dim">empty</span>'}</b>` +
        `<em>${c ? `${esc(c.desc)}${c.upkeep > 0 ? ` Upkeep ${money(c.upkeep)}/mo.` : ''}` : 'Choose a policy card for this slot.'}</em>` +
        btn(c ? 'Change' : 'Choose', { act: 'slot', data: { arg: i }, off }) + `</div>`;
    }).join('');
    return card('Policy Slots', `<div class="nt-slots">${slots}</div><p class="nt-foot">Changing an active policy costs ${POLICY_SWAP_COST} PC.</p>`);
  }

  private policyPicker(r: RegionSim): string {
    const def = GOV_TYPES.find((g) => g.id === r.govType);
    const domain = def?.policySlots[this.policySlot];
    if (!def || !domain) return '';
    const cards = r.availablePoliciesFor(domain);
    const activeId = r.activePolicies[this.policySlot] ?? null;
    const canSwap = !activeId || r.politicalCapital >= POLICY_SWAP_COST;
    const rows = cards.map((c) => {
      const isActive = c.id === activeId;
      return `<div class="nt-pick${isActive ? ' on' : ''}"><div><b>${esc(c.name)}${isActive ? ' ✓' : ''}</b>` +
        `${c.upkeep > 0 ? ` <small>${money(c.upkeep)}/mo</small>` : ''}<em>${esc(c.desc)}</em></div>` +
        btn(isActive ? 'Active' : 'Adopt', { act: 'policy', data: { arg: c.id }, off: isActive ? 'Already active.' : canSwap ? null : `Needs ${POLICY_SWAP_COST} PC to swap.` }) + `</div>`;
    }).join('');
    return `<div class="nt-modal-veil"><div class="nt-modal" role="dialog" aria-label="Policy">` +
      `<h3>Policy: ${esc(domain)} slot</h3>` +
      (activeId ? `<p class="nt-foot">Changing an active policy costs ${POLICY_SWAP_COST} PC (you have ${Math.round(r.politicalCapital)}).</p>` : '') +
      (rows || `<p class="nt-empty">No eligible cards yet. Research the prerequisite civics.</p>`) +
      `<div class="nt-actions">${activeId ? btn('Clear slot', { act: 'policy-clear', cls: 'danger' }) : ''}${btn('Cancel', { act: 'slot-close' })}</div></div></div>`;
  }

  private lawsCard(r: RegionSim): string {
    const laws = r.availableLaws();
    const render = (list: typeof laws): string => list.map((l) =>
      `<div class="nt-law"><div><b>${esc(l.name)}</b> <small>${esc(l.domain)}</small><em>${esc(l.desc)}</em></div>` +
      btn(`Enact (${l.cost} PC)`, { act: 'law', data: { arg: l.id }, off: l.canAfford ? null : `Needs ${l.cost} PC (you have ${Math.round(r.politicalCapital)}).` }) + `</div>`).join('');
    const stateLaws = laws.filter((l) => !l.requiresNation);
    const nationLaws = laws.filter((l) => l.requiresNation);
    let body = `<p class="nt-foot">Political capital <b>${Math.round(r.politicalCapital)} PC</b></p>`;
    if (stateLaws.length) body += `<h4>State laws</h4>${render(stateLaws)}`;
    if (r.nationProclaimed && nationLaws.length) body += `<h4>Nation laws</h4>${render(nationLaws)}`;
    else if (!r.nationProclaimed) body += `<p class="nt-foot">Nation laws unlock at nationhood.</p>`;
    if (!stateLaws.length && !(r.nationProclaimed && nationLaws.length)) {
      body += `<p class="nt-empty">${r.passedLaws.size > 0 ? 'Every available law is enacted.' : 'No laws are available yet. Research the prerequisite civics.'}</p>`;
    }
    if (r.passedLaws.size > 0) {
      body += `<h4>Enacted</h4><p class="nt-chips">${[...r.passedLaws].map((id) => `<span class="nt-chip">${esc(REGION_LAWS.find((l) => l.id === id)?.name ?? id)}</span>`).join('')}</p>`;
    }
    return card('Laws', body);
  }

  // ---------------------------------------------------------------- Budget

  private budget(r: RegionSim): string {
    const gdp = r.gdpLastMonth;
    const debt = r.getTotalDebt() + r.centralBankLoan + (r.nationProclaimed ? r.nationalDebt : 0);
    const kpis: Kpi[] = [
      { label: 'Treasury', value: money(r.treasury), sub: `${signedMoney(r.treasuryDeltaMonth)} last month`, cls: r.treasuryDeltaMonth >= 0 ? 'good' : 'bad', hint: 'Reserves and last month\'s net change' },
      { label: 'GDP / month', value: money(gdp), sub: `avg wage ${money(r.avgDailyWage(), 2)}/day`, cls: '', hint: 'Output plus trade, per month' },
      { label: 'Tax rate', value: `${Math.round(r.taxRate * 100)}%`, sub: `≈ ${money(gdp * r.taxRate)}/mo`, cls: r.taxRate > 0.15 ? 'warn' : '', hint: 'Global tax rate. High taxes breed strikes.' },
      { label: 'Debt', value: money(debt), sub: r.hasCentralBank() ? `rating ${r.creditRating}` : 'loans and bonds', cls: debt > gdp * 12 ? 'bad' : '', hint: 'Loans, discount-window balance and sovereign bonds' },
      { label: 'Trade', value: money(r.tradeValueLastMonth), sub: 'turnover / month', cls: '', hint: 'Trade value last month' },
    ];
    let banners = '';
    if (r.currencyTransition && r.day < r.currencyTransition.endDay) {
      banners += `<div class="nt-alert warn">Currency transition: output runs at ${Math.round(r.currencyEfficiency() * 100)}%, ` +
        `${Math.max(1, Math.round((r.currencyTransition.endDay - r.day) / 30))} months to stabilise.</div>`;
    }
    if (r.isInsolvent()) {
      banners += `<div class="nt-alert bad"><b>Sovereign default.</b> The government falls in ` +
        `${Math.max(1, INSOLVENCY_COLLAPSE_MONTHS - r.insolvencyMonths)} months unless the rating recovers off D or debt falls under the ceiling.</div>`;
    }
    const left = [this.ledgerCard(r), this.controlsCard(r)];
    const right = [this.climateCard(r)];
    if (r.stateProclaimed) right.unshift(this.creditCard(r), this.centralBankCard(r));
    else right.unshift(locked('Unlocks at statehood: lenders, loans, sovereign bonds, the central bank and the currency standard.'));
    return `<div class="nt-kpis">${kpis.map(kpiHtml).join('')}</div>${banners}` +
      `<div class="nt-cols"><div class="nt-stack">${left.join('')}</div><div class="nt-stack">${right.join('')}</div></div>`;
  }

  private ledgerCard(r: RegionSim): string {
    const gdp = r.gdpLastMonth;
    const towns = playerTowns(r).length;
    const mob = r.playerWar ? MOBILIZATION_DEFS[r.playerWar.mobilization] : null;
    const revenue = gdp * r.taxRate;
    const lines: { label: string; v: number; hint: string }[] = [
      { label: 'Administration', v: gdp * 0.025 + towns * 5, hint: 'Base overhead plus 5 per town' },
      { label: 'Public services', v: gdp * 0.04 * r.servicesLevel, hint: 'Scales with the services level' },
      { label: 'Militia and garrisons', v: gdp * 0.025 * r.militiaLevel, hint: 'Scales with the militia level' },
      { label: 'Active policies', v: activePolicyUpkeep(r), hint: 'Upkeep of slotted policy cards' },
      { label: 'War mobilisation', v: mob && r.playerWar ? r.playerPop() * mob.upkeepPerPop : 0, hint: 'Per-person war spending' },
      { label: 'State apparatus', v: r.lastGovOutlay, hint: `Spends only the surplus above a ${GOV_OUTLAY_RESERVE_MONTHS}-month reserve` },
    ].filter((l) => l.v > 0.5);
    const spend = lines.reduce((s, l) => s + l.v, 0);
    const max = Math.max(revenue, spend, 1);
    const row = (label: string, v: number, cls: string, hint: string): string =>
      `<div class="nt-ledger" title="${esc(hint)}"><span>${esc(label)}</span>${meter((v / max) * 100, cls)}<b>${money(v)}</b></div>`;
    const net = revenue - spend;
    return card('Monthly Ledger (estimate)',
      `<h4>Revenue</h4>${row('Tax take', revenue, 'good', 'GDP times the global tax rate')}` +
      `<h4>Spending</h4>${lines.map((l) => row(l.label, l.v, 'warn', l.hint)).join('') || '<p class="nt-empty">No recurring spending.</p>'}` +
      `<div class="nt-net ${net >= 0 ? 'good' : 'bad'}"><span>Estimated net</span><b>${signedMoney(net)}/mo</b></div>` +
      `<p class="nt-foot">Actual treasury change last month: <b>${signedMoney(r.treasuryDeltaMonth)}</b>. Estimates omit building upkeep, trade, loan service and one-off events.</p>` +
      this.forecastLine(r));
  }

  private forecastLine(r: RegionSim): string {
    const net = r.gdpLastMonth * r.taxRate - (r.servicesLevel * 2 + r.militiaLevel * 3);
    const f = r.advisorForecast('Finance', r.treasury + net * 12);
    const min = r.ministerFor('treasury');
    return `<p class="nt-foot" title="Accuracy depends on your Treasury minister's skill.">${esc(min ? min.name : 'Your advisors')} forecast the treasury at ` +
      `<b class="${f >= 0 ? 'nt-good' : 'nt-bad'}">${money(f)}</b> in twelve months.</p>`;
  }

  private controlsCard(r: RegionSim): string {
    const wired = this.onSetFiscal !== null;
    const off = wired ? null : 'Fiscal controls are not connected.';
    const tax = Math.round(r.taxRate * 100);
    const step = (k: 'servicesLevel' | 'militiaLevel', label: string, hint: string): string => {
      const v = r[k];
      const lv = Math.round(v);
      return `<div class="nt-ctl"><div><b>${label}</b><em>${esc(hint)}</em></div><div class="nt-step">` +
        btn('−', { act: 'fiscal', data: { k, v: Math.max(0, lv - 1) }, off: off ?? (lv <= 0 ? 'Already at the minimum.' : null) }) +
        `<span>${LEVEL_LABEL[Math.max(0, Math.min(2, lv))] ?? lv}</span>` +
        btn('+', { act: 'fiscal', data: { k, v: Math.min(2, lv + 1) }, off: off ?? (lv >= 2 ? 'Already at the maximum.' : null) }) + `</div></div>`;
    };
    return card('Fiscal Controls',
      `<div class="nt-ctl"><div><b>Tax rate</b><em>High taxes breed strikes; the regime's norm is ${GOV_TYPES.find((g) => g.id === r.govType)?.taxCap ?? 30}% at most.</em></div>` +
      `<div class="nt-slider"><input id="nt-tax" type="range" min="0" max="30" value="${tax}"${wired ? '' : ' disabled'} aria-label="Tax rate"><b id="nt-tax-v">${tax}%</b></div></div>` +
      step('servicesLevel', 'Public services', 'Costs coin, saves lives, lifts productivity and contentment.') +
      step('militiaLevel', 'Militia', 'Garrisons and reserves; funded militia also permits a blockade.') +
      (wired ? '' : why(off)));
  }

  private climateCard(r: RegionSim): string {
    const farm = r.agriClimateMult() < 1 ? `<p class="nt-bad">Farm output −${Math.round((1 - r.agriClimateMult()) * 100)}% to heat and water stress.</p>` : '';
    const ind = r.industryClimateMult() < 1 ? `<p class="nt-bad">Industry −${Math.round((1 - r.industryClimateMult()) * 100)}% to brownout drag.</p>` : '';
    let geo = '';
    if (r.has('geoengineering')) {
      const off = r.geoDeployed ? 'Aerosols are already active.' : !r.nationProclaimed ? 'Requires nationhood.' : null;
      geo = `<div class="nt-actions">${btn('Deploy geoengineering', { act: 'geo', off, title: `−${GEOENGINEER_COOLING}°C over two years, but every rival loses 15 relations.` })}</div>`;
    }
    return card('Climate Ledger',
      `<p>CO₂ <b>${Math.round(r.co2ppm)} ppm</b> · <b>+${r.warmingC.toFixed(1)}°C</b>` +
      `${r.eraBranch ? ` · <span class="nt-chip">${esc(r.eraBranch.toUpperCase())}</span>` : ` <small>(→ +${r.projectedWarming().toFixed(1)}°C by 2100)</small>`}</p>` +
      (r.geoDeployed ? `<p class="nt-info">Aerosols active: warming suppressed for two years.</p>` : '') + farm + ind + geo);
  }

  private creditCard(r: RegionSim): string {
    const hasMarket = r.settlements.some((s) => s.buildings.some((b) => b.includes('market')));
    const hasBank = r.settlements.some((s) => s.buildings.some((b) => b.includes('bank')));
    let body: string;
    if (!hasMarket && !hasBank && !r.hasCentralBank()) {
      body = `<p class="nt-empty">No lender will deal with you yet. Build a Market or a Bank in one of your towns.</p>`;
    } else {
      const rateNote = r.hasCentralBank() ? ` (policy ${(r.policyRate * 100).toFixed(0)}% plus spread)` : '';
      const lenders = r.lenders.map((l) => {
        const max = Math.max(0, Math.min(l.maxLoan, l.liquidCash));
        const ak = `loan-amt-${l.id}`, tk = `loan-term-${l.id}`;
        const amt = this.num(ak, Math.round(Math.min(1000, max / 2)));
        const term = this.num(tk, 12);
        const off = r.treasury <= 0 ? 'A bankrupt treasury cannot borrow.' : l.liquidCash <= 0 ? 'This lender has no liquidity.'
          : amt <= 0 ? 'Enter an amount.' : amt > max ? `At most ${money(max)}.` : term < 1 || term > 120 ? 'Term must be 1 to 120 months.' : null;
        return `<div class="nt-lender"><div><b>${esc(l.name)}</b><em>max ${money(l.maxLoan)} at ${(l.interestRate * 100).toFixed(1)}% · ` +
          `${l.liquidCash > 0 ? `available ${money(l.liquidCash)}` : '<span class="nt-bad">no liquidity</span>'}</em></div>` +
          `<label class="nt-mini">amount<input id="in-${ak}" class="nt-input" type="number" min="0" step="10" value="${amt}" data-draft="${ak}"></label>` +
          `<label class="nt-mini">months<input id="in-${tk}" class="nt-input" type="number" min="1" max="120" value="${term}" data-draft="${tk}"></label>` +
          btn('Borrow', { act: 'loan', data: { lender: l.id }, off }) + `</div>`;
      }).join('');
      const loans = r.getActiveLoans().map((ln) => {
        const owing = Math.round(ln.borrowed);
        const minPay = Math.max(1, Math.round(owing * 0.1));
        const k = `repay-${ln.id}`;
        const amt = this.num(k, minPay);
        const lender = r.lenders.find((l) => l.id === ln.lenderId);
        const off = amt < minPay ? `Minimum payment is ${money(minPay)}.` : amt > r.treasury ? 'The treasury cannot cover that.' : null;
        return `<div class="nt-lender"><div><b>${esc(lender?.name ?? 'Lender')}</b><em>${money(owing)} owing at ${(ln.interestRate * 100).toFixed(1)}%</em></div>` +
          `<label class="nt-mini">repay<input id="in-${k}" class="nt-input" type="number" min="0" step="10" value="${amt}" data-draft="${k}"></label>` +
          btn('Repay', { act: 'repay', data: { loan: ln.id }, off }) + `</div>`;
      }).join('');
      body = `<h4>Lenders${esc(rateNote)}</h4>${lenders || '<p class="nt-empty">No lenders in the region.</p>'}` +
        `<h4>Active loans</h4>${loans || '<p class="nt-empty">No outstanding loans.</p>'}`;
    }
    return card('Credit', body + this.bondsBlock(r));
  }

  private bondsBlock(r: RegionSim): string {
    const annual = Math.max(1, r.gdpLastMonth * 12);
    const debtPct = Math.round((r.nationalDebt / annual) * 100);
    const gate = !r.nationProclaimed ? 'Sovereign bonds unlock at nationhood.' : !r.passedLaws.has('central_bank_charter') ? 'Bonds need the Central Bank Charter law.'
      : r.creditRating === 'D' ? 'Your credit rating is D.' : null;
    const buttons = BOND_SIZES.map((a) => btn(`+${money(a)}`, {
      act: 'bonds', data: { arg: a }, off: gate ?? (r.nationalDebt + a > annual * 2 ? 'Debt would exceed twice annual GDP.' : null),
    })).join('');
    return `<h4>Sovereign bonds</h4><p class="nt-foot">Debt <b>${money(r.nationalDebt)}</b> (${debtPct}% of GDP) · rating <b>${esc(r.creditRating)}</b> · ${(r.bondRate * 100).toFixed(1)}% coupon</p>` +
      `<div class="nt-actions">${buttons}</div>${why(gate)}`;
  }

  private centralBankCard(r: RegionSim): string {
    if (!r.hasCentralBank()) {
      return card('Central Bank', locked('Unlocks with the Central Banking civic or the Central Bank Charter law: policy rate, monetary regime, discount window and currency standard.'));
    }
    const conf = Math.round(r.confidence);
    const regime = (id: MonetaryRegime, label: string, hint: string): string => btn(label, { act: 'regime', data: { arg: id }, on: r.monetaryRegime === id, title: hint });
    const rate = Math.round(r.policyRate * 100);
    const rateWired = this.onSetPolicyRate !== null;
    return card('Central Bank',
      `<div class="nt-row" title="Below 30 the economy deleverages: credit contracts and GDP falls."><span>Confidence</span>${meter(conf, toneOf(conf, 60, 30))}<b>${conf}</b></div>` +
      `<p class="nt-foot">Leverage ${(r.privateLeverage * r.policyRate * 100).toFixed(0)}% debt service · inflation ${(r.inflationRate * 100).toFixed(1)}% · FX ${r.exchangeRate.toFixed(2)}</p>` +
      `<div class="nt-ctl"><div><b>Policy rate</b><em>Low rates: boom then bust. High rates: credit contraction, inflation down.</em></div>` +
      `<div class="nt-slider"><input id="nt-rate" type="range" min="${Math.round(MIN_POLICY_RATE * 100)}" max="${Math.round(MAX_POLICY_RATE * 100)}" value="${rate}"` +
      `${rateWired ? '' : ' disabled'} aria-label="Policy rate"><b id="nt-rate-v">${rate}%</b></div></div>` +
      (rateWired ? '' : why('The policy-rate control is not connected.')) +
      `<h4>Monetary regime</h4><div class="nt-actions">${regime('float', 'Float', 'Market-driven rate that follows trade balance and confidence.')}` +
      `${regime('peg', 'Peg', 'Fix the rate; drains reserves if trade is unfavourable.')}${regime('print', 'Print', 'Print money: boosts the treasury but drives inflation.')}</div>` +
      this.discountWindow(r) + this.currencyBlock(r));
  }

  private discountWindow(r: RegionSim): string {
    const maxDraw = Math.max(0, r.treasury * 0.5 - r.centralBankLoan);
    const out = r.centralBankLoan > 0
      ? `<p class="nt-foot">Outstanding <b class="${r.centralBankLoan > r.treasury * 0.3 ? 'nt-bad' : 'nt-good'}">${money(r.centralBankLoan)}</b> at ${(r.policyRate * 100).toFixed(1)}%</p>` +
        `<div class="nt-actions">${btn('Repay half', { act: 'cb-repay', data: { arg: Math.ceil(r.centralBankLoan * 0.5) } })}${btn('Repay all', { act: 'cb-repay', data: { arg: Math.ceil(r.centralBankLoan) } })}</div>`
      : `<p class="nt-foot">No outstanding balance.</p>`;
    const draws = maxDraw > 0
      ? `<div class="nt-actions">${[0.25, 0.5, 1].map((f) => btn(`Draw ${money(Math.floor(maxDraw * f))}`, { act: 'cb-draw', data: { arg: Math.floor(maxDraw * f) } })).join('')}</div>`
      : why('Ceiling reached: the balance is capped at 50% of the treasury.');
    return `<h4 title="Short-term borrowing at the policy rate, capped at 50% of the treasury.">Discount window</h4>${out}${draws}`;
  }

  private currencyBlock(r: RegionSim): string {
    const others = CURRENCY_SYMBOLS.filter((s) => s !== r.currencySymbol);
    const a = r.currencyAnnouncement;
    const announce = a
      ? `<p class="nt-foot">Announced ${esc(a.newSymbol)}: ${r.day - a.announcedDay >= ANNOUNCE_LEAD_DAYS ? 'markets are ready, the switch is cushioned.' : `${ANNOUNCE_LEAD_DAYS - (r.day - a.announcedDay)} days until markets price it in.`}</p>`
      : `<div class="nt-actions"><span class="nt-lbl">Announce</span>${others.map((s) => btn(esc(s), { act: 'cur-announce', data: { arg: s }, title: `Telegraphing a switch ${ANNOUNCE_LEAD_DAYS}+ days ahead softens the penalties by 25%.` })).join('')}</div>`;
    const sw = `<div class="nt-actions"><span class="nt-lbl">Switch now</span>${others.map((s) => btn(esc(s), { act: 'cur-ask', data: { arg: s }, on: this.pendingSwitch === s })).join('')}</div>`;
    let confirm = '';
    if (this.pendingSwitch) {
      const crisis = r.confidence < 30;
      confirm = `<div class="nt-alert ${crisis ? 'info' : 'warn'}"><b>Switch the currency standard to ${esc(this.pendingSwitch)}?</b> ` +
        `${crisis ? 'Markets are already in crisis; they will understand this move.' : 'Markets see no reason for this. Expect heavy capital flight and years of friction.'} ` +
        `Announced switches (${ANNOUNCE_LEAD_DAYS}+ days notice) and deep reserves soften the blow.` +
        `<div class="nt-actions">${btn('Switch', { act: 'cur-switch', data: { arg: this.pendingSwitch }, cls: 'danger' })}${btn('Cancel', { act: 'cur-cancel' })}</div></div>`;
    }
    return `<h4 title="Switching costs capital flight and an efficiency dip. Crisis-driven switches are forgiven faster than whims.">Currency standard: ${esc(r.currencySymbol)}</h4>${announce}${sw}${confirm}`;
  }

  // -------------------------------------------------------------- Politics

  private politics(r: RegionSim): string {
    if (!r.stateProclaimed) {
      return `<div class="nt-cols"><div class="nt-stack">${locked('Unlocks at statehood: estates and factions, political capital, elections, the media, protests and the depression toolkit.')}</div>` +
        `<div class="nt-stack">${this.regionalPowersCard(r)}</div></div>`;
    }
    const leg = Math.round(r.legitimacy);
    const election = !r.has('universal_suffrage') ? 'no elections' : r.nextElectionDay < 0 ? 'after suffrage' : `${Math.max(0, r.nextElectionDay - r.day)} days`;
    const kpis: Kpi[] = [
      { label: 'Political capital', value: `${Math.round(r.politicalCapital)} PC`, sub: 'spent on laws, policies, media', cls: '', hint: 'Earned over time; spent on statutes and policy swaps' },
      { label: 'Legitimacy', value: r.nationProclaimed ? `${leg}` : 'n/a', sub: r.nationProclaimed ? 'right to rule' : 'nation tier only', cls: r.nationProclaimed ? toneOf(leg, 60, 35) : '', hint: 'The regime\'s right to rule' },
      { label: 'Next election', value: election, sub: r.lastElectionYear > 0 ? `last held ${r.lastElectionYear}` : 'none held yet', cls: '', hint: 'Elections need universal suffrage' },
      { label: 'Unrest', value: UNREST_LABELS[r.unrestLevel], sub: `${r.unrestMonthsAtLevel} months at this rung`, cls: r.unrestLevel >= 4 ? 'bad' : r.unrestLevel >= 2 ? 'warn' : 'good', hint: 'The unrest ladder' },
    ];
    const left = [this.estatesCard(r), this.unrestCard(r), this.slumpCard(r)];
    const right = [this.mediaCard(r), this.regionalPowersCard(r)];
    return `<div class="nt-kpis">${kpis.map(kpiHtml).join('')}</div>` +
      `<div class="nt-cols"><div class="nt-stack">${left.join('')}</div><div class="nt-stack">${right.join('')}</div></div>`;
  }

  private estatesCard(r: RegionSim): string {
    const bars = r.factions.length > 0
      ? r.factions.map((f) => {
          const sup = Math.round(f.support);
          return `<div class="nt-frow" title="${esc(f.name)}: power ${Math.round(f.power)}%. ${esc(f.demand)}"><span>${esc(f.name)}</span>${meter(sup, toneOf(sup, 60, 40))}<b>${sup}%</b>` +
            `<em>power ${Math.round(f.power)} · wants: ${esc(f.demand)}</em></div>`;
        }).join('')
      : `<p class="nt-empty">The estates form next month.</p>`;
    const elections = !r.has('universal_suffrage')
      ? `<p class="nt-foot">Universal suffrage has not been achieved, so no elections are held.</p>`
      : r.nextElectionDay < 0 ? `<p class="nt-foot">The first election falls about four years after suffrage is enacted.</p>`
        : `<p class="nt-foot">Next election in <b>${Math.max(0, r.nextElectionDay - r.day)}</b> days${r.lastElectionYear > 0 ? `, last held in ${r.lastElectionYear}` : ''}.</p>`;
    return card('Estates and Factions', bars + elections);
  }

  private unrestCard(r: RegionSim): string {
    const rungs = UNREST_LABELS.map((l, i) => `<li class="${i <= r.unrestLevel ? `on r${i}` : ''}${i === r.unrestLevel ? ' cur' : ''}"><i></i><span>${l}</span></li>`).join('');
    const gdpCost = r.gdpLastMonth * 0.02;
    const atProtests = r.unrestLevel === 3;
    const off = atProtests ? null : 'Only available at the Protests rung.';
    return card('Unrest and Protests',
      `<ol class="nt-ladder" aria-label="Unrest ladder">${rungs}</ol>` +
      `<p class="nt-foot">${UNREST_LABELS[r.unrestLevel]} for ${r.unrestMonthsAtLevel} months.</p>` +
      `<div class="nt-actions">${btn('Crackdown', { act: 'crackdown', off, cls: 'danger', title: 'Suppress the movement: workers −10 support, escalation eases briefly.' })}` +
      `${btn(`Concede (${money(gdpCost)})`, { act: 'concede', off: off ?? (r.treasury < gdpCost ? 'The treasury cannot cover 2% of GDP.' : null), title: 'Concede for 2% of monthly GDP: unrest drops a rung.' })}</div>${why(off)}`);
  }

  private slumpCard(r: RegionSim): string {
    const active = r.depressionDepth > 0.01 || r.crashRecoveryChoice === 'pending';
    if (!active) return card('Economic Crisis', `<p class="nt-empty">No depression is under way.</p>`);
    const pct = Math.round(r.depressionDepth * 100);
    const path = r.crashRecoveryChoice === 'stimulus' ? 'Stimulus' : r.crashRecoveryChoice === 'austerity' ? 'Austerity' : r.crashRecoveryChoice === 'pending' ? 'choosing' : 'not yet chosen';
    const cross = r.crashRecoveryChoice === 'pending'
      ? `<h4>Recovery crossroads</h4><div class="nt-twin">` +
        `<button class="nt-btn big" data-act="recovery" data-arg="stimulus" title="Deficit spending restarts the engine faster but costs the treasury for two years."><b>Stimulus</b><span>spend now, faster recovery, ${money(8)}/mo for 24 months</span></button>` +
        `<button class="nt-btn big" data-act="recovery" data-arg="austerity" title="Balance the budget: services are cut and recovery is slower."><b>Austerity</b><span>balance the books, slower, services cut</span></button></div>`
      : '';
    const done = r.depressionDepth <= 0.05;
    const measures = DEPRESSION_MEASURES.map((m) => {
      const used = r.depressionMeasuresUsed.includes(m.id);
      let off: string | null = used ? 'Already enacted.' : done ? 'The slump is nearly over.' : null;
      if (!off && m.id === 'qe' && !r.passedLaws.has('central_bank_charter')) off = 'Needs the Central Bank Charter law.';
      if (!off && m.id === 'publicworks') {
        const cost = Math.round(r.gdpLastMonth * 0.5 + 60);
        if (r.treasury < cost) off = `Needs ${money(cost)} in the treasury.`;
      }
      return `<div class="nt-law"><div><b>${esc(m.title)}${used ? ' ✓' : ''}</b><em>${esc(m.blurb)} ${esc(m.effect)}</em></div>` +
        btn('Enact', { act: 'depression', data: { arg: m.id }, off }) + `</div>`;
    }).join('');
    return card('Great Depression',
      `<div class="nt-row" title="Depth decays about 5% a month; emergency measures cut it faster."><span>Depth</span>${meter(pct, pct > 60 ? 'bad' : pct > 30 ? 'warn' : 'info')}<b>${pct}%</b></div>` +
      `<p class="nt-foot">Recovery path: <b>${path}</b></p>${cross}<h4>Emergency measures</h4>${measures}`, 'crisis');
  }

  private mediaCard(r: RegionSim): string {
    const pf = Math.round(r.pressFreedom);
    const cg = Math.round(r.credibilityGap);
    const pc = r.politicalCapital;
    const state = r.stateProclaimed;
    const lack = (need: number): string | null => (!state ? 'Requires statehood.' : pc < need ? `Needs ${need} PC (you have ${Math.round(pc)}).` : null);
    const platformOff = r.platformRegulationEnacted ? 'Already enacted.' : !r.has('digital_economy') ? 'Needs the Digital Economy tech.' : pc < 20 ? `Needs 20 PC (you have ${Math.round(pc)}).` : null;
    const publicOff = r.publicMediaFunded ? 'Already funded.' : lack(25);
    const litCost = r.gdpLastMonth * 0.05;
    const litOff = r.mediaLiteracyInvested ? 'Already invested.' : r.treasury < litCost ? `Needs ${money(litCost)} in the treasury.` : null;
    const counters = r.misinformationEra
      ? `<h4>Counter-measures</h4><div class="nt-actions">` +
        btn(`Platform regulation${r.platformRegulationEnacted ? ' ✓' : ' (20 PC)'}`, { act: 'media-platform', off: platformOff, title: 'Slows polarisation growth by 0.005 a month.' }) +
        btn(`Public media${r.publicMediaFunded ? ' ✓' : ' (25 PC)'}`, { act: 'media-public', off: publicOff, title: 'The credibility gap decays twice as fast; 0.8% of GDP a month upkeep.' }) +
        btn(`Media literacy${r.mediaLiteracyInvested ? (r.mediaLiteracyApplied ? ' ✓' : ` (${r.mediaLiteracyYear + 15})`) : ` (${money(litCost)})`}`, { act: 'media-literacy', off: litOff, title: 'Polarisation −0.15 after a 15-year lag. Costs 5% of GDP up front.' }) + `</div>`
      : '';
    return card('Media and Press',
      `<p class="nt-foot">Reach <b>${esc(REACH_LABEL[r.mediaReach] ?? r.mediaReach)}</b>${r.misinformationEra ? ' · <span class="nt-bad">algorithmic misinformation era</span>' : ''}</p>` +
      `<div class="nt-row" title="Above 65 the press is free; below 35 it is controlled."><span>Press freedom</span>${meter(pf, toneOf(pf, 65, 36))}<b>${pf}</b></div>` +
      `<div class="nt-actions">${btn('Censor −20', { act: 'media-censor', off: lack(15), title: 'Press freedom −20 (15 PC). Merchants −10, Landowners +10.' })}` +
      `${btn('Liberalise +20', { act: 'media-license', off: lack(15), title: 'Press freedom +20 (15 PC). Merchants +5.' })}</div>` +
      `<div class="nt-row" title="A high gap risks a legitimacy collapse when a crisis hits."><span>Credibility gap</span>${meter(cg, cg >= 60 ? 'bad' : cg >= 30 ? 'warn' : 'good')}<b>${cg}</b></div>` +
      (cg > 60 ? `<p class="nt-bad">Credibility gap critical: legitimacy collapse risk.</p>` : '') +
      `<p class="nt-foot">Polarisation <b>${(r.polarization * 100).toFixed(0)}%</b>${r.misinformationEra ? ` · opinion velocity ×${r.opinionVelocity().toFixed(1)}` : ''}</p>` + counters);
  }

  private regionalPowersCard(r: RegionSim): string {
    const others = r.regionalFactions.filter((f) => f.id !== r.playerFactionId);
    if (others.length === 0) return '';
    const rows = others.map((f) => {
      const s = r.getFactionStats(f.id);
      if (!s) return '';
      const allies = s.allies.map((id) => r.faction(id)?.name ?? '?').join(', ');
      const foes = s.rivals.map((id) => r.faction(id)?.name ?? '?').join(', ');
      const regime = RIVAL_REGIMES.find((g) => g.id === f.regime)?.name ?? 'Unknown';
      return `<div class="nt-power"><div><b style="color:${esc(f.color ?? '#aaa')}">${esc(f.name)}</b> <small>${esc(regime)} · pop ${s.population} · ${money(s.treasury)}</small></div>` +
        `<p>${f.currentGoal ? `<span class="nt-gold" title="${esc(f.currentGoal.description ?? '')}">${esc(f.currentGoal.objective)}</span>${s.goalProgress > 0 ? ` <small>(${s.goalProgress}%)</small>` : ''}` : '<span class="nt-dim">no active goal</span>'}</p>` +
        (allies || foes ? `<p class="nt-foot">${allies ? `<span class="nt-good">allies: ${esc(allies)}</span>` : ''}${allies && foes ? ' · ' : ''}${foes ? `<span class="nt-bad">rivals: ${esc(foes)}</span>` : ''}</p>` : '') + `</div>`;
    }).join('');
    const log = r.log.filter((e) => /TENSION|RAID|RETALIATION|FACTION|proclaims new goal|achieves ambition|abandons goal/i.test(e.text)).slice(-6).reverse();
    return card('Regional Powers', rows + (log.length ? `<h4>Recent activity</h4><ul class="nt-briefs">${log.map((e) => `<li>${esc(e.text)}</li>`).join('')}</ul>` : ''));
  }

  // -------------------------------------------------------------- Military

  private military(r: RegionSim): string {
    const w = r.playerWar;
    const rv = w ? r.rival(w.rivalId) : undefined;
    const coalition = this.coalitionCard(r);
    if (!w || !rv) {
      const cap = Math.round(r.armamentsCapacity() * 100);
      const garrison = playerTowns(r).reduce((s, t) => s + r.garrisonOf(t), 0);
      const kpis: Kpi[] = [
        { label: 'Militia level', value: LEVEL_LABEL[Math.max(0, Math.min(2, Math.round(r.militiaLevel)))] ?? String(r.militiaLevel), sub: 'set on the Budget tab', cls: '', hint: 'Funded militia permits a blockade' },
        { label: 'Garrisons', value: String(garrison), sub: 'across your towns', cls: '', hint: 'Total garrison strength' },
        { label: 'Arms base', value: `${cap}%`, sub: 'steel and chemicals', cls: toneOf(cap, 75, 40), hint: 'Industrial capacity to arm an army' },
      ];
      return `<div class="nt-kpis">${kpis.map(kpiHtml).join('')}</div>${coalition}` +
        `<div class="nt-cols"><div class="nt-stack">${card('At Peace', `<p class="nt-empty">No war is being fought. Declare war from the Foreign Affairs screen.</p>` +
          (r.stateProclaimed ? '' : `<p class="nt-foot">Unlocks at statehood: mobilisation, recruitment, occupation and the peace table.</p>`))}` +
        `${this.recruitCard(r, null)}</div><div class="nt-stack">${this.arsenalCard(r)}</div></div>`;
    }
    const floor = WAR_SUPPORT_FLOOR[r.govType ?? 'democracy'];
    const front = w.front ?? { position: w.score, peak: w.score, phase: frontPhase(w.score) };
    const phase = FRONT_PHASE_LABEL[front.phase];
    const power = Math.round(r.warPower()), enemy = Math.round(r.rivalWarPower(rv));
    const kpis: Kpi[] = [
      { label: 'War score', value: `${Math.round(w.score)}`, sub: `vs ${rv.name}`, cls: w.score >= 15 ? 'good' : w.score >= -15 ? 'warn' : 'bad', hint: 'This month\'s balance of the war, −100 to +100' },
      { label: 'Front', value: phase.label, sub: `peak ${Math.round(front.peak)}`, cls: phase.bar, hint: 'The war score smoothed into a front line' },
      { label: 'Home support', value: `${Math.round(w.support)}`, sub: `regime floor ${floor}`, cls: w.support >= floor + 15 ? 'good' : w.support >= floor ? 'warn' : 'bad', hint: `Below ${floor} the war eats the government` },
      { label: 'Combat power', value: `${power}`, sub: `enemy ${enemy}`, cls: power >= enemy ? 'good' : 'bad', hint: 'Your combat power against theirs' },
      { label: 'Casualties', value: `${Math.round(w.casualties)}`, sub: 'running total', cls: '', hint: 'The demographic scar' },
    ];
    const banner = `<div class="nt-alert bad war"><b>At war with ${esc(rv.name)}: ${esc(CASUS_BELLI_DEFS[w.cb].name)}${w.defensive ? ', defensive' : ''}</b>` +
      `<span>${esc(RIVAL_ARCHETYPES[rv.archetype].name)}</span></div>`;
    const left = [this.frontCard(r, w, rv, floor), this.forcesCard(r, w), this.peaceCard(r, w)];
    const right = [this.mobilizationCard(r, w), this.alliesCard(r, w), this.occupationCard(w), this.recruitCard(r, w), this.arsenalCard(r)];
    return `${banner}<div class="nt-kpis">${kpis.map(kpiHtml).join('')}</div>${coalition}` +
      `<div class="nt-cols"><div class="nt-stack">${left.join('')}</div><div class="nt-stack">${right.join('')}</div></div>`;
  }

  private coalitionCard(r: RegionSim): string {
    const c = r.coalition;
    if (!c) return '';
    const members = c.memberIds.map((id) => r.rival(id)?.name).filter(Boolean).join(', ') || '?';
    if (c.warDeclared) {
      return `<div class="nt-alert bad"><b>The coalition has marched.</b> ${esc(members)} declared war together; the encirclement war is now the active war.</div>`;
    }
    const cohesion = Math.round(c.cohesion);
    const ultimatum = c.demand != null
      ? `<p>Ultimatum: <b>${c.demand === 'tribute' ? 'pay tribute' : 'disarm'}</b>, issued ${dateOfDay(c.ultimatumDay ?? r.day)}.</p>` +
        `<div class="nt-actions">${btn('Yield to the ultimatum', { act: 'yield', cls: 'danger', title: 'Submit to their terms: the bloc disperses at a cost to treasury and legitimacy.' })}</div>`
      : '';
    return `<div class="nt-alert bad"><b>Encirclement: a coalition forms against you.</b> Members: ${esc(members)}` +
      `<div class="nt-row" title="Dissolves below about 25; issues an ultimatum at 60 and above."><span>Cohesion</span>${meter(cohesion, cohesion >= 60 ? 'bad' : 'warn')}<b>${cohesion}</b></div>${ultimatum}` +
      `<p class="nt-foot">Three ways out: split a member below the join line (a deal, entente or gift), yield to the ultimatum, or win the war outright.</p></div>`;
  }

  private frontCard(r: RegionSim, w: PlayerWar, rv: RivalNation, floor: number): string {
    const front = w.front ?? { position: w.score, peak: w.score, phase: frontPhase(w.score) };
    const phase = FRONT_PHASE_LABEL[front.phase];
    const scorePct = Math.round((w.score + 100) / 2);
    const frontPct = Math.round((front.position + 100) / 2);
    const peakLev = Math.floor(Math.max(0, front.peak) * FRONT_PEAK_LEVERAGE_SCALE);
    const sup = Math.round(w.support);
    return card('The Front',
      `<div class="nt-row" title="Balance of the war this month, −100 to +100."><span>War score</span>${meter(scorePct, w.score >= 15 ? 'good' : w.score >= -15 ? 'warn' : 'bad')}<b>${Math.round(w.score)}</b></div>` +
      `<div class="nt-row" title="The war score with inertia. Deepest advance ${Math.round(front.peak)}${peakLev > 0 ? `, worth −${peakLev} on the peace ask` : ''}."><span>Front line</span>${meter(frontPct, phase.bar)}<b>${esc(phase.label)}</b></div>` +
      `<div class="nt-row" title="Home-front consent. Below ${floor} the war eats the government."><span>Home support</span>` +
      `<span class="nt-meter ${sup >= floor + 15 ? 'good' : sup >= floor ? 'warn' : 'bad'} floor"><i style="width:${Math.max(0, Math.min(100, sup))}%"></i><u style="left:${floor}%" title="Regime floor ${floor}"></u></span><b>${sup}</b></div>` +
      `<p class="nt-foot">Combat power ${Math.round(r.warPower())} against ${Math.round(r.rivalWarPower(rv))}. Casualties ${Math.round(w.casualties)}.</p>`);
  }

  private forcesCard(r: RegionSim, w: PlayerWar): string {
    const rows = w.units.map((u: ArmyUnit) =>
      `<tr><td>${esc(u.type)}</td><td class="n">${u.count}</td><td class="nt-mor">${meter(u.morale, toneOf(u.morale, 60, 35))}<small>${Math.round(u.morale)}</small></td>` +
      `<td class="n">${(u.count * UNIT_TYPES[u.type].powerPerUnit).toFixed(0)}</td></tr>`).join('');
    const table = w.units.length
      ? `<div class="nt-scroll"><table class="nt-table"><thead><tr><th>Unit</th><th class="n">Count</th><th>Morale</th><th class="n">Power</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<p class="nt-empty">No units recruited yet.</p>`;
    const sup = w.supplyReserve;
    const supCls = sup > 2 ? 'good' : sup > 1 ? 'warn' : 'bad';
    return card('Forces', table + this.compositionLine(r, w) +
      `<div class="nt-row" title="Months of food and ammunition in reserve."><span>Supply</span>${meter((sup / 4) * 100, supCls)}<b class="nt-${supCls}">${(Math.round(sup * 10) / 10)} mo</b></div>`);
  }

  private compositionLine(r: RegionSim, w: PlayerWar): string {
    const mine = w.units;
    if (mine.length === 0) return '';
    const comp = { militia: 0, cavalry: 0, artillery: 0 };
    for (const u of mine) if (u.type === 'militia' || u.type === 'cavalry' || u.type === 'artillery') comp[u.type] += u.count;
    const land = comp.militia + comp.cavalry + comp.artillery;
    const line = land > 0 ? `<p class="nt-foot" title="A force with two or more arms avoids being hard-countered.">Composition: militia ${comp.militia}, cavalry ${comp.cavalry}, artillery ${comp.artillery}.</p>` : '';
    const foe = r.provincialArmies.filter((a) => a.ownerId === w.rivalId).flatMap((a) => a.units) as ArmyUnit[];
    const tip = `<p class="nt-foot">Militia beat cavalry, cavalry beat artillery, artillery beat militia. A balanced army avoids being hard-countered.</p>`;
    if (land === 0 || foe.length === 0) return line + tip;
    const mult = compositionMult(mine, foe, undefined);
    const v = mult > 1.05 ? ['nt-good', 'Your composition counters theirs'] : mult < 0.95 ? ['nt-bad', 'They counter your composition: mix your arms'] : ['nt-warn', 'Even matchup'];
    return line + `<p class="nt-foot" title="Composition multiplier ${mult.toFixed(2)}">Matchup: <b class="${v[0]}">${v[1]}</b></p>`;
  }

  private arsenalCard(r: RegionSim): string {
    const cap = Math.round(r.armamentsCapacity() * 100);
    return card('Arsenal',
      `<div class="nt-row" title="The Liebig minimum of steel and chemicals supply. 100% means arsenals fully fed."><span>Arms base</span>${meter(cap, toneOf(cap, 75, 40))}<b>${cap}%</b></div>` +
      `<p class="nt-foot">Steel stock <b>${Math.round(r.goodStock('steel'))}</b> · chemicals stock <b>${Math.round(r.goodStock('chemicals'))}</b></p>` +
      (cap < 100 ? `<p class="nt-warn">Strained arsenals raise recruit and upkeep costs and blunt combat power.</p>` : ''));
  }

  private mobilizationCard(r: RegionSim, w: PlayerWar): string {
    const mobs = (Object.keys(MOBILIZATION_DEFS) as Mobilization[]).map((m) => {
      const d = MOBILIZATION_DEFS[m];
      return `<button type="button" class="nt-btn opt${m === w.mobilization ? ' on' : ''}" data-act="mob" data-arg="${m}"${m === w.mobilization ? ' disabled' : ''} title="${esc(d.desc)}">` +
        `<b>${esc(d.name)}</b><span>power ×${d.power} · ${d.upkeepPerPop > 0 ? `${money(d.upkeepPerPop, 2)}/pop/mo` : 'no upkeep'}${d.satMonthly < 0 ? ` · contentment ${d.satMonthly}/mo` : ''}</span></button>`;
    }).join('');
    const canBlockade = r.militiaLevel >= 2 || r.policyActive('standing_army');
    const off = w.blockade || canBlockade ? null : 'Needs funded militia or a standing army.';
    return card('Mobilisation', `<div class="nt-opts">${mobs}</div>` +
      `<div class="nt-actions">${btn(w.blockade ? 'Lift blockade' : 'Blockade', {
        act: 'blockade', off, on: w.blockade,
        title: w.blockade ? 'Reopen the lanes for both sides.' : `Close their lanes: their power −15%, the score climbs. Costs ${money(BLOCKADE_UPKEEP_PER_POP, 2)}/pop/mo and your own exports.`,
      })}</div>${why(off)}`);
  }

  private alliesCard(r: RegionSim, w: PlayerWar): string {
    const rv = r.rival(w.rivalId);
    const name = (id: number): string => r.rival(id)?.name ?? '?';
    const callable = r.rivals.filter((x) => x.id !== w.rivalId && x.treaties.includes('defensive_pact') && !w.allies.includes(x.id));
    return card('Allies and Enemies',
      `<p>With you: ${w.allies.length ? esc(w.allies.map(name).join(', ')) : '<span class="nt-dim">none</span>'}</p>` +
      `<p>Against you: ${esc(rv?.name ?? '?')}${w.enemyAllies.length ? ` and ${esc(w.enemyAllies.map(name).join(', '))}` : ''}</p>` +
      (callable.length
        ? `<div class="nt-actions">${callable.map((x) => btn(`Call ${esc(x.name)}`, { act: 'ally', data: { arg: x.id }, title: 'Honour decides whether the ink holds.' })).join('')}</div>`
        : `<p class="nt-foot">No defensive pacts to call on.</p>`));
  }

  private occupationCard(w: PlayerWar): string {
    const front = w.front ?? { position: w.score, peak: w.score, phase: frontPhase(w.score) };
    if (w.occupied <= 0) {
      return card('Occupation', `<p class="nt-empty">${front.position >= FRONT_OCCUPY_THRESHOLD ? 'The front is deep enough to take ground: the columns probe their marches.' : `No ground held. Push the front past ${FRONT_OCCUPY_THRESHOLD} to take marches.`}</p>`);
    }
    const def = OCCUPATION_DEFS[w.occupationPolicy];
    const opts = (Object.keys(OCCUPATION_DEFS) as OccupationPolicy[]).map((p) =>
      `<button type="button" class="nt-btn opt${p === w.occupationPolicy ? ' on' : ''}" data-act="occ" data-arg="${p}"${p === w.occupationPolicy ? ' disabled' : ''} title="${esc(OCCUPATION_DEFS[p].desc)}">` +
      `<b>${esc(OCCUPATION_DEFS[p].name)}</b><span>${esc(OCCUPATION_DEFS[p].desc)}</span></button>`).join('');
    return card('Occupation',
      `<p class="nt-foot">Marches held <b>${w.occupied}/${MAX_OCCUPIED_MARCHES}</b> · net yield <b>${money(w.occupied * (def.yield - def.garrison))}/mo</b></p>` +
      `<div class="nt-row" title="Past 50, partisans bleed the garrisons."><span>Resistance</span>${meter(w.resistance, w.resistance > 50 ? 'bad' : 'warn')}<b>${Math.round(w.resistance)}</b></div>` +
      `<div class="nt-opts">${opts}</div>`);
  }

  private recruitCard(r: RegionSim, w: PlayerWar | null): string {
    const rows = UNIT_ORDER.map((t) => {
      const d = UNIT_TYPES[t];
      const k = `recruit-${t}`;
      const n = Math.floor(this.num(k, 5));
      const total = d.recruitCost * n;
      const off = !w ? 'No active war.' : t === 'warship' && !r.hasHarbor() ? 'Warships need a Harbor in a coastal town.'
        : n <= 0 ? 'Enter a unit count.' : total > r.treasury ? `Needs about ${money(total)} (short by ${money(total - r.treasury)}).` : null;
      return `<div class="nt-lender"><div><b>${esc(t)}</b><em>${money(d.recruitCost)}/unit · power ${d.powerPerUnit} · ${d.trainingDays}d training · supply ${d.supplyCost}/day</em></div>` +
        `<label class="nt-mini">units<input id="in-${k}" class="nt-input" type="number" min="1" max="100" value="${n}" data-draft="${k}"></label>` +
        btn('Recruit', { act: 'recruit', data: { arg: t }, off }) + `</div>`;
    }).join('');
    return card('Recruitment', `<p class="nt-foot">Treasury <b>${money(r.treasury)}</b></p>${rows}`);
  }

  private peaceCard(r: RegionSim, w: PlayerWar): string {
    const rv = r.rival(w.rivalId);
    if (!rv) return '';
    for (const t of [...this.peacePicks]) if (t === 'border_province' && w.occupied === 0) this.peacePicks.delete(t);
    const resist = AGENDA_PEACE_RESISTANCE[rivalAgendaKind(rv)];
    const arch = RIVAL_ARCHETYPES[rv.archetype].name;
    const terms = (Object.keys(PEACE_TERMS) as PeaceTerm[]).map((t) => {
      const picked = this.peacePicks.has(t);
      const blocked = t === 'border_province' && w.occupied === 0;
      const delta = resist[t] ?? 0;
      const note = delta > 0 ? `${rv.name} will resist (${arch}: +${delta}).` : delta < 0 ? `${rv.name} is more willing (${arch}: ${delta}).` : '';
      return `<button type="button" class="nt-btn opt${picked ? ' on' : ''}" data-act="term" data-arg="${t}"${blocked ? ' disabled' : ''} ` +
        `title="${esc(blocked ? 'You must hold a march to claim it.' : `${PEACE_TERMS[t].desc} ${note}`)}">` +
        `<b>${picked ? '☑ ' : '☐ '}${esc(PEACE_TERMS[t].name)}</b><span>cost ${PEACE_TERMS[t].score + delta}${delta ? ` (${delta > 0 ? '+' : ''}${delta} ${esc(arch)})` : ''}${blocked ? ' · hold a march first' : ''}</span></button>`;
    }).join('');
    const picks = [...this.peacePicks];
    const ask = picks.length ? r.peaceBasketAsk(rv, picks) : null;
    const front = w.front ?? { position: w.score, peak: w.score, phase: frontPhase(w.score) };
    const peakLev = Math.floor(Math.max(0, front.peak) * FRONT_PEAK_LEVERAGE_SCALE);
    const lev = w.occupied > 0 || peakLev > 0
      ? `Discounts: ${w.occupied > 0 ? `${w.occupied} march${w.occupied > 1 ? 'es' : ''} held (−${w.occupied * 6})` : ''}${w.occupied > 0 && peakLev > 0 ? ', ' : ''}${peakLev > 0 ? `front peak ${Math.round(front.peak)} (−${peakLev})` : ''}.`
      : 'No discounts yet: hold marches or push the front deeper.';
    const scale = Math.max(100, ask ?? 0, w.score);
    let compare = `<p class="nt-foot">Tick terms to compose the instrument.</p>`;
    let offerOff: string | null = 'Tick at least one term.';
    if (ask !== null) {
      const gap = ask - w.score;
      compare = `<div class="nt-row"><span>Your war score</span>${meter((Math.max(0, w.score) / scale) * 100, 'info')}<b>${Math.round(w.score)}</b></div>` +
        `<div class="nt-row"><span>Their ask</span>${meter((ask / scale) * 100, gap > 0 ? 'bad' : 'good')}<b>${ask}</b></div>` +
        `<p class="${gap > 0 ? 'nt-bad' : 'nt-good'}">${gap > 0 ? `You need ${Math.ceil(gap)} more war score.` : 'Your score covers their ask.'}</p><p class="nt-foot">${esc(lev)}</p>`;
      offerOff = gap > 0 ? `War score ${Math.round(w.score)} is below their ask of ${ask}.` : null;
    }
    const cap = this.pendingCapitulate
      ? `<div class="nt-alert bad">Capitulate on their terms? Reparations and a stripped treasury.` +
        `<div class="nt-actions">${btn('Confirm capitulation', { act: 'capitulate', cls: 'danger' })}${btn('Keep fighting', { act: 'cap-cancel' })}</div></div>`
      : '';
    return card('The Peace Table',
      `<p class="nt-foot">Terms are priced in war score and shaped by ${esc(rv.name)}'s ${esc(arch)} agenda.</p><div class="nt-opts four">${terms}</div>${compare}` +
      `<div class="nt-actions">${btn(`Offer terms${ask !== null ? ` (ask ${ask})` : ''}`, { act: 'offer', off: offerOff, cls: 'gold' })}` +
      `${btn('Capitulate', { act: 'cap-ask', cls: 'danger', title: 'End the war on their terms.' })}</div>${why(offerOff && picks.length ? offerOff : null)}${cap}`);
  }
}

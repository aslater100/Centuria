import {
  MAX_ENTENTES, RIVAL_ARCHETYPES, TREATY_DEFS,
  type DealBasket, type RegionSim, type RivalNation, type TreatyKind,
} from '../../sim/region';
import { formatCurrency, getCurrencySymbol } from '../../sim/defs';
import { issue } from '../../sim/commands';

function esc(s: string | number): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export class DealModal {
  readonly el: HTMLElement;
  onClose: (() => void) | null = null;
  private rivalId = -1;
  private region: RegionSim | null = null;
  private treaties = new Set<TreatyKind>();
  private goldToThem = 0;
  private goldToYou = 0;
  private border = false;
  private entente: number | null = null;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'dip-deal hidden';
    root.appendChild(this.el);
    this.el.addEventListener('click', (ev) => {
      if (ev.target === this.el) this.close();
    });
  }

  get isOpen(): boolean {
    return this.rivalId >= 0;
  }

  open(r: RegionSim, rivalId: number): void {
    this.region = r;
    this.rivalId = rivalId;
    this.treaties.clear();
    this.goldToThem = 0;
    this.goldToYou = 0;
    this.border = false;
    this.entente = null;
    this.render();
  }

  close(): void {
    const was = this.isOpen;
    this.rivalId = -1;
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
    if (was) this.onClose?.();
  }

  private basket(): DealBasket {
    return {
      treaties: [...this.treaties],
      goldToThem: this.goldToThem,
      goldToYou: this.goldToYou,
      borderSettlement: this.border,
      entente: this.entente,
    };
  }

  private verdict(r: RegionSim, rv: RivalNation): string {
    const v = r.evaluateDeal(rv, this.basket());
    const ledger = `they value it ${v.get.toFixed(1)} pts against ${v.cost.toFixed(1)} asked`;
    const embattled = r.rivalSituation(rv) > 0 ? ' At war abroad — keener to deal.' : '';
    if (v.accept) return `✓ Their envoy nods — ${ledger}. They would sign.${embattled}`;
    if (v.counter) return `± Close: ${ledger}. They would counter, asking ${formatCurrency(v.counter.goldToThem - this.goldToThem)} more.${embattled}`;
    return `✗ ${ledger}. They would walk — "${v.reason}."${embattled}`;
  }

  private forecast(r: RegionSim, rv: RivalNation): string {
    const v = r.evaluateDeal(rv, this.basket());
    if (!v.accept) return '';
    const change = Math.round(Math.min(20, v.get / 5));
    const next = Math.min(100, Math.round(rv.relations) + change);
    const trend = next >= 25 ? 'friendly' : next >= -25 ? 'neutral' : 'hostile';
    return `Forecast: relations ${Math.round(rv.relations)} → ${next} (${trend})`;
  }

  private render(): void {
    const r = this.region;
    const rv = r?.rival(this.rivalId);
    if (!r || !rv) { this.close(); return; }
    const treatyRows = (Object.keys(TREATY_DEFS) as TreatyKind[])
      .filter((k) => k !== 'climate_accord' || r.accordUnlocked())
      .map((k) => {
        const held = rv.treaties.includes(k);
        const appetite = r.treatyAppetite(rv, k);
        const hint = held ? 'already in force' : appetite >= 0 ? 'they want this' : 'a concession — they want paying';
        return `<label class="dip-deal-row" title="${esc(TREATY_DEFS[k].desc)}">` +
          `<input type="checkbox" class="deal-treaty" data-kind="${k}" ${this.treaties.has(k) ? 'checked' : ''} ${held ? 'disabled' : ''}> ` +
          `<b>${esc(TREATY_DEFS[k].name)}</b> <span class="dip-hint">— ${hint}</span></label>`;
      }).join('');
    const borderHint = rv.borderSettled
      ? 'already settled'
      : r.borderAppetite(rv) >= 0 ? 'they would welcome a fixed frontier' : 'they will not pin a border they mean to move';
    const borderRow = `<label class="dip-deal-row" title="Survey and sign the frontier: no more border friction, and no border casus belli — for either side">` +
      `<input type="checkbox" id="deal-border" ${this.border ? 'checked' : ''} ${rv.borderSettled ? 'disabled' : ''}> ` +
      `<b>Border Settlement</b> <span class="dip-hint">— ${borderHint}</span></label>`;
    const capped = r.ententes.length >= MAX_ENTENTES;
    const targets = r.rivals.filter((x) => x.id !== rv.id);
    const options = targets.map((x) =>
      `<option value="${x.id}" ${this.entente === x.id ? 'selected' : ''}>${esc(x.name)} (${r.ententeAppetite(rv, x.id) >= 0 ? 'keen' : 'reluctant'})</option>`).join('');
    const ententeRow = targets.length > 0
      ? `<div class="dip-deal-row" title="Pledge alignment against a third power: signing costs ${esc(rv.name)} relations with the target and gains you +6 with ${esc(rv.name)}. If you later declare war on the target, ${esc(rv.name)} may roll in on your side.">` +
        `<b>Entente</b> — align against <select id="deal-entente" ${capped ? 'disabled' : ''}><option value="">none</option>${options}</select> ` +
        `<span class="dip-hint">${capped ? `bloc capped at ${MAX_ENTENTES}/${MAX_ENTENTES} — retire one to add another` : `${r.ententes.length}/${MAX_ENTENTES} ententes signed`}</span></div>`
      : '';
    const sym = esc(getCurrencySymbol());
    const affordable = r.treasury >= this.goldToThem;
    this.el.innerHTML =
      `<div class="dip-deal-box">` +
      `<h3>The Bargaining Table — ${esc(rv.name)}</h3>` +
      `<p class="dip-hint">${esc(RIVAL_ARCHETYPES[rv.archetype].name)} · relations ${Math.round(rv.relations)} · every item is priced from their situation and personality</p>` +
      treatyRows + borderRow + ententeRow +
      `<div class="dip-deal-gold">` +
      `<label>${sym} to them <input type="number" id="deal-gold-them" min="0" step="5" value="${this.goldToThem}"></label>` +
      `<label>${sym} asked of them <input type="number" id="deal-gold-you" min="0" step="5" value="${this.goldToYou}"></label>` +
      `<span class="dip-hint">treasury ${formatCurrency(Math.floor(r.treasury))}</span></div>` +
      `<p id="deal-verdict" class="dip-verdict">${esc(this.verdict(r, rv))}</p>` +
      `<p id="deal-forecast" class="dip-hint">${esc(this.forecast(r, rv))}</p>` +
      `<div class="dip-actions"><button class="dip-btn primary" id="deal-propose" ${affordable ? '' : 'disabled title="Not enough in the treasury for that gift"'}>Put it on the table</button>` +
      `<button class="dip-btn" id="deal-cancel">Withdraw</button></div>` +
      `</div>`;
    this.el.classList.remove('hidden');

    const live = (): void => {
      const v = this.el.querySelector('#deal-verdict');
      const f = this.el.querySelector('#deal-forecast');
      const p = this.el.querySelector<HTMLButtonElement>('#deal-propose');
      if (v) v.textContent = this.verdict(r, rv);
      if (f) f.textContent = this.forecast(r, rv);
      if (p) p.disabled = r.treasury < this.goldToThem;
    };
    for (const box of this.el.querySelectorAll<HTMLInputElement>('.deal-treaty')) {
      box.onchange = () => {
        const k = box.dataset.kind as TreatyKind;
        if (box.checked) this.treaties.add(k); else this.treaties.delete(k);
        live();
      };
    }
    const border = this.el.querySelector<HTMLInputElement>('#deal-border');
    if (border) border.onchange = () => { this.border = border.checked; live(); };
    const sel = this.el.querySelector<HTMLSelectElement>('#deal-entente');
    if (sel) sel.onchange = () => { this.entente = sel.value === '' ? null : Number(sel.value); live(); };
    const them = this.el.querySelector<HTMLInputElement>('#deal-gold-them');
    if (them) them.oninput = () => { this.goldToThem = Math.max(0, Number(them.value) || 0); live(); };
    const you = this.el.querySelector<HTMLInputElement>('#deal-gold-you');
    if (you) you.oninput = () => { this.goldToYou = Math.max(0, Number(you.value) || 0); live(); };
    const propose = this.el.querySelector<HTMLButtonElement>('#deal-propose');
    if (propose) propose.onclick = () => { issue(r, 'proposeDeal', this.rivalId, this.basket()); this.close(); };
    const cancel = this.el.querySelector<HTMLButtonElement>('#deal-cancel');
    if (cancel) cancel.onclick = () => this.close();
  }
}

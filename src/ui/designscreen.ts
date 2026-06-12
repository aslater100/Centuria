/**
 * Design screens for game start and tier transitions.
 * Player customizes: currency, difficulty, region template, nation government.
 */
import type { CurrencySymbol } from '../sim/defs';
import { CURRENCY_SYMBOLS } from '../sim/defs';
import type { SectorId } from '../sim/region';

export interface TownDesign {
  currencySymbol: CurrencySymbol;
  difficulty: 'easy' | 'normal' | 'hard';
  populationLimit: 'small' | 'medium' | 'large';
}

export interface RegionDesign {
  template: 'agricultural' | 'industrial' | 'commercial' | 'balanced';
  primarySector: SectorId;
  taxRate: number; // 0.1–0.3
}

export interface NationDesign {
  template: 'federal' | 'centralized' | 'merchant-republic' | 'balanced';
  currencySymbol?: CurrencySymbol;
  primaryFocus: 'military' | 'economy' | 'culture' | 'balanced';
}

export class DesignScreen {
  private container: HTMLElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'design-screen';
    this.container.style.position = 'fixed';
    this.container.style.inset = '0';
    this.container.style.backgroundColor = 'rgba(0,0,0,0.8)';
    this.container.style.zIndex = '10000';
    this.container.style.display = 'flex';
    this.container.style.alignItems = 'center';
    this.container.style.justifyContent = 'center';
    this.container.style.fontFamily = 'monospace';
    document.body.appendChild(this.container);
  }

  showTownDesign(callback: (design: TownDesign) => void): void {
    let currency: CurrencySymbol = '$';
    let difficulty: 'easy' | 'normal' | 'hard' = 'normal';
    let populationLimit: 'small' | 'medium' | 'large' = 'medium';

    this.container.innerHTML = `
      <div style="background: #222; color: #ccc; padding: 40px; max-width: 500px; border: 2px solid #666;">
        <h2 style="text-align: center; margin-top: 0;">TOWN DESIGN</h2>

        <div style="margin: 20px 0;">
          <p><strong>Currency</strong></p>
          <div id="currency-buttons" style="display: flex; gap: 10px; flex-wrap: wrap;">
            ${CURRENCY_SYMBOLS.map(sym => `
              <button style="padding: 8px 16px; background: ${currency === sym ? '#444' : '#333'}; color: #ccc; border: 1px solid #666; cursor: pointer;"
                      onclick="window.designCurrency = '${sym}'">
                ${sym}
              </button>
            `).join('')}
          </div>
        </div>

        <div style="margin: 20px 0;">
          <p><strong>Difficulty</strong></p>
          <div id="difficulty-buttons" style="display: flex; gap: 10px;">
            ${(['easy', 'normal', 'hard'] as const).map(d => `
              <button style="padding: 8px 16px; background: ${difficulty === d ? '#444' : '#333'}; color: #ccc; border: 1px solid #666; cursor: pointer; flex: 1;"
                      onclick="window.designDifficulty = '${d}'; this.parentElement.querySelectorAll('button').forEach(b => b.style.background = '#333'); this.style.background = '#444';">
                ${d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            `).join('')}
          </div>
          <p style="font-size: 12px; color: #999;">Easy: ↓30% costs, ↑60% starting gold. Hard: ↑50% costs, ↓75% starting gold.</p>
        </div>

        <div style="margin: 20px 0;">
          <p><strong>Population Limit</strong></p>
          <div id="population-buttons" style="display: flex; gap: 10px;">
            ${(['small', 'medium', 'large'] as const).map(p => `
              <button style="padding: 8px 16px; background: ${populationLimit === p ? '#444' : '#333'}; color: #ccc; border: 1px solid #666; cursor: pointer; flex: 1;"
                      onclick="window.designPopLimit = '${p}'; this.parentElement.querySelectorAll('button').forEach(b => b.style.background = '#333'); this.style.background = '#444';">
                ${p === 'small' ? '150' : p === 'medium' ? '200' : '250'}
              </button>
            `).join('')}
          </div>
        </div>

        <button id="town-design-confirm" style="width: 100%; padding: 12px; margin-top: 30px; background: #444; color: #ccc; border: 1px solid #666; cursor: pointer; font-size: 16px;">
          BEGIN
        </button>
      </div>
    `;

    (window as any).designCurrency = currency;
    (window as any).designDifficulty = difficulty;
    (window as any).designPopLimit = populationLimit;

    const confirmBtn = this.container.querySelector('#town-design-confirm') as HTMLButtonElement;
    confirmBtn.addEventListener('click', () => {
      currency = (window as any).designCurrency || '$';
      difficulty = (window as any).designDifficulty || 'normal';
      populationLimit = (window as any).designPopLimit || 'medium';

      this.container.innerHTML = '';
      this.container.remove();
      callback({ currencySymbol: currency, difficulty, populationLimit });
    });
  }

  showRegionDesign(callback: (design: RegionDesign) => void): void {
    let template: 'agricultural' | 'industrial' | 'commercial' | 'balanced' = 'balanced';
    let primarySector: SectorId = 'agriculture';
    let taxRate = 0.15;

    const templates = {
      agricultural: { desc: 'Focus: food & stability', sectors: ['agriculture', 'services'] },
      industrial: { desc: 'Focus: production & growth', sectors: ['industry', 'information'] },
      commercial: { desc: 'Focus: trade & wealth', sectors: ['services', 'information'] },
      balanced: { desc: 'All sectors equal', sectors: ['agriculture', 'industry'] },
    };

    this.container.innerHTML = `
      <div style="background: #222; color: #ccc; padding: 40px; max-width: 600px; border: 2px solid #666;">
        <h2 style="text-align: center; margin-top: 0;">REGIONAL CHARTER</h2>

        <div style="margin: 20px 0;">
          <p><strong>Template</strong></p>
          <div id="template-buttons" style="display: grid; gap: 10px;">
            ${(Object.entries(templates) as Array<[typeof template, any]>).map(([t, info]) => `
              <button style="padding: 12px; text-align: left; background: ${template === t ? '#444' : '#333'}; color: #ccc; border: 1px solid #666; cursor: pointer;"
                      onclick="window.designTemplate = '${t}'; this.parentElement.querySelectorAll('button').forEach(b => b.style.background = '#333'); this.style.background = '#444';">
                <strong>${t.charAt(0).toUpperCase() + t.slice(1)}</strong> — ${info.desc}
              </button>
            `).join('')}
          </div>
        </div>

        <div style="margin: 20px 0;">
          <p><strong>Primary Sector</strong></p>
          <p style="font-size: 12px; color: #999;">Workers drift toward high-paying sectors. Set primary to give it a boost.</p>
          <div id="sector-buttons" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            ${(['agriculture', 'industry', 'services', 'information'] as const).map(s => `
              <button style="padding: 8px; background: ${primarySector === s ? '#444' : '#333'}; color: #ccc; border: 1px solid #666; cursor: pointer;"
                      onclick="window.designPrimarySector = '${s}'; this.parentElement.querySelectorAll('button').forEach(b => b.style.background = '#333'); this.style.background = '#444';">
                ${s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            `).join('')}
          </div>
        </div>

        <div style="margin: 20px 0;">
          <p><strong>Tax Rate: <span id="tax-display">${(taxRate * 100).toFixed(0)}%</span></strong></p>
          <input type="range" id="tax-slider" min="10" max="30" value="${taxRate * 100}" style="width: 100%;" />
          <p style="font-size: 12px; color: #999;">Higher taxes fund services but reduce satisfaction. Lower taxes boost morale but treasury suffers.</p>
        </div>

        <button id="region-design-confirm" style="width: 100%; padding: 12px; margin-top: 30px; background: #444; color: #ccc; border: 1px solid #666; cursor: pointer; font-size: 16px;">
          ESTABLISH CHARTER
        </button>
      </div>
    `;

    (window as any).designTemplate = template;
    (window as any).designPrimarySector = primarySector;

    const taxSlider = this.container.querySelector('#tax-slider') as HTMLInputElement;
    const taxDisplay = this.container.querySelector('#tax-display') as HTMLElement;
    taxSlider.addEventListener('input', (e) => {
      taxRate = parseInt((e.target as HTMLInputElement).value) / 100;
      taxDisplay.textContent = `${(taxRate * 100).toFixed(0)}%`;
    });

    const confirmBtn = this.container.querySelector('#region-design-confirm') as HTMLButtonElement;
    confirmBtn.addEventListener('click', () => {
      template = (window as any).designTemplate || 'balanced';
      primarySector = (window as any).designPrimarySector || 'agriculture';

      this.container.innerHTML = '';
      this.container.remove();
      callback({ template, primarySector, taxRate });
    });
  }

  showNationDesign(currentCurrency: CurrencySymbol, callback: (design: NationDesign) => void): void {
    let template: 'federal' | 'centralized' | 'merchant-republic' | 'balanced' = 'balanced';
    let newCurrency: CurrencySymbol | undefined = undefined;
    let primaryFocus: 'military' | 'economy' | 'culture' | 'balanced' = 'balanced';

    const templates = {
      federal: { desc: 'Distributed power, consensus-building. Trade agreements +20%. War morale +10%.' },
      centralized: { desc: 'Rapid decision-making. Tech research +25%. War morale +25%.' },
      'merchant-republic': { desc: 'Commerce-driven. Trade revenue +30%. Militaria cost +15%.' },
      balanced: { desc: 'All aspects equal.' },
    };

    this.container.innerHTML = `
      <div style="background: #222; color: #ccc; padding: 40px; max-width: 600px; border: 2px solid #666; max-height: 90vh; overflow-y: auto;">
        <h2 style="text-align: center; margin-top: 0;">CONSTITUTIONAL CONVENTION</h2>

        <div style="margin: 20px 0;">
          <p><strong>Government Form</strong></p>
          <div id="gov-buttons" style="display: grid; gap: 10px;">
            ${(Object.entries(templates) as Array<[typeof template, any]>).map(([t, info]) => `
              <button style="padding: 12px; text-align: left; background: ${template === t ? '#444' : '#333'}; color: #ccc; border: 1px solid #666; cursor: pointer;"
                      onclick="window.designGovTemplate = '${t}'; this.parentElement.querySelectorAll('button').forEach(b => b.style.background = '#333'); this.style.background = '#444';">
                <strong>${t.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</strong> — ${info.desc}
              </button>
            `).join('')}
          </div>
        </div>

        <div style="margin: 20px 0; padding: 15px; background: #333; border: 1px solid #666;">
          <p style="margin: 0 0 10px 0;"><strong>⚠ Currency Change Penalties</strong></p>
          <p style="font-size: 12px; color: #999; margin: 0;">Switching from ${currentCurrency} will trigger:</p>
          <ul style="margin: 10px 0; font-size: 12px; color: #999;">
            <li>10% treasury loss (transaction fees)</li>
            <li>20% inflation (temporary price spike)</li>
            <li>90-day market disruption (price volatility ±15%)</li>
          </ul>
        </div>

        <div style="margin: 20px 0;">
          <p><strong>Currency Standard</strong></p>
          <p style="font-size: 12px; color: #999;">Current: <strong>${currentCurrency}</strong>. ${newCurrency ? `Switching to: <strong>${newCurrency}</strong>` : 'Keep current.'}</p>
          <div id="currency-buttons" style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button style="padding: 8px 16px; background: #444; color: #ccc; border: 1px solid #666; cursor: pointer;"
                    onclick="window.designNewCurrency = undefined; this.parentElement.querySelectorAll('button').forEach(b => b.style.background = '#333'); this.style.background = '#444';">
              Keep ${currentCurrency}
            </button>
            ${CURRENCY_SYMBOLS.filter(s => s !== currentCurrency).map(sym => `
              <button style="padding: 8px 16px; background: #333; color: #ccc; border: 1px solid #666; cursor: pointer;"
                      onclick="window.designNewCurrency = '${sym}'; this.parentElement.querySelectorAll('button').forEach(b => b.style.background = '#333'); this.style.background = '#444';">
                Switch to ${sym}
              </button>
            `).join('')}
          </div>
        </div>

        <div style="margin: 20px 0;">
          <p><strong>Primary Focus</strong></p>
          <div id="focus-buttons" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            ${(['military', 'economy', 'culture', 'balanced'] as const).map(f => `
              <button style="padding: 8px; background: ${primaryFocus === f ? '#444' : '#333'}; color: #ccc; border: 1px solid #666; cursor: pointer;"
                      onclick="window.designPrimaryFocus = '${f}'; this.parentElement.querySelectorAll('button').forEach(b => b.style.background = '#333'); this.style.background = '#444';">
                ${f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            `).join('')}
          </div>
        </div>

        <button id="nation-design-confirm" style="width: 100%; padding: 12px; margin-top: 30px; background: #444; color: #ccc; border: 1px solid #666; cursor: pointer; font-size: 16px;">
          PROCLAIM NATION
        </button>
      </div>
    `;

    (window as any).designGovTemplate = template;
    (window as any).designNewCurrency = newCurrency;
    (window as any).designPrimaryFocus = primaryFocus;

    const confirmBtn = this.container.querySelector('#nation-design-confirm') as HTMLButtonElement;
    confirmBtn.addEventListener('click', () => {
      template = (window as any).designGovTemplate || 'balanced';
      newCurrency = (window as any).designNewCurrency;
      primaryFocus = (window as any).designPrimaryFocus || 'balanced';

      this.container.innerHTML = '';
      this.container.remove();
      callback({ template, currencySymbol: newCurrency, primaryFocus });
    });
  }
}

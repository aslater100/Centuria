export type Action = 'endMonth' | 'pause' | 'speed1' | 'speed2' | 'speed3' | 'diplomacy' | 'history' | 'dispatch';
export type ColorblindMode = 'off' | 'deuteranopia' | 'protanopia' | 'tritanopia';

export interface Settings {
  colorblind: ColorblindMode;
  monthlyTurns: boolean;
  uiScale: number;
  keymap: Record<Action, string>;
  showTutorial: boolean;
}

const STORAGE_KEY = 'centuria-settings';

export const DEFAULT_SETTINGS: Settings = {
  colorblind: 'off',
  monthlyTurns: true,
  uiScale: 1,
  keymap: {
    endMonth: 'Enter', pause: ' ', speed1: '1', speed2: '2', speed3: '3',
    diplomacy: 'd', history: 'h', dispatch: 'n',
  },
  showTutorial: true,
};

const ACTIONS: Action[] = ['endMonth', 'pause', 'speed1', 'speed2', 'speed3', 'diplomacy', 'history', 'dispatch'];
const ACTION_LABELS: Record<Action, string> = {
  endMonth: 'End month', pause: 'Pause / resume', speed1: 'Speed 1', speed2: 'Speed 2', speed3: 'Speed 3',
  diplomacy: 'Diplomacy screen', history: 'History screen', dispatch: 'Dispatch',
};

const OKABE_ITO = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7', '#999999'];
const PALETTES: Record<Exclude<ColorblindMode, 'off'>, string[]> = {
  deuteranopia: OKABE_ITO,
  protanopia: OKABE_ITO,
  tritanopia: ['#B2182B', '#EF8A62', '#F7B6D2', '#4D4D4D', '#009E9E', '#FDBF6F', '#8C510A', '#BDBDBD'],
};

function cloneDefaults(): Settings {
  return { ...DEFAULT_SETTINGS, keymap: { ...DEFAULT_SETTINGS.keymap } };
}

export function loadSettings(): Settings {
  const out = cloneDefaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return out;
    const p = JSON.parse(raw) as Partial<Settings> | null;
    if (!p || typeof p !== 'object') return out;
    if (p.colorblind === 'off' || p.colorblind === 'deuteranopia' || p.colorblind === 'protanopia' || p.colorblind === 'tritanopia') out.colorblind = p.colorblind;
    if (typeof p.monthlyTurns === 'boolean') out.monthlyTurns = p.monthlyTurns;
    if (typeof p.showTutorial === 'boolean') out.showTutorial = p.showTutorial;
    if (typeof p.uiScale === 'number' && isFinite(p.uiScale)) out.uiScale = Math.min(1.4, Math.max(0.8, p.uiScale));
    if (p.keymap && typeof p.keymap === 'object') {
      for (const a of ACTIONS) {
        const k = p.keymap[a];
        if (typeof k === 'string' && k.length > 0) out.keymap[a] = k;
      }
    }
  } catch {
    return cloneDefaults();
  }
  return out;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    return;
  }
}

function normKey(k: string): string {
  return k.length === 1 ? k.toLowerCase() : k;
}

export function actionForKey(s: Settings, key: string): Action | null {
  const k = normKey(key);
  for (const a of ACTIONS) if (normKey(s.keymap[a]) === k) return a;
  return null;
}

export function factionColor(base: string, index: number, s: Settings): string {
  if (s.colorblind === 'off') return base;
  const pal = PALETTES[s.colorblind];
  const i = ((Math.trunc(index) % pal.length) + pal.length) % pal.length;
  return pal[i];
}

function keyLabel(k: string): string {
  if (k === ' ') return 'Space';
  return k.length === 1 ? k.toUpperCase() : k;
}

export class SettingsPanel {
  onChange: ((s: Settings) => void) | null = null;
  private readonly overlay: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private settings: Settings = loadSettings();
  private rebinding: Action | null = null;
  private readonly keyHandler = (e: KeyboardEvent): void => this.onKey(e);

  constructor(root: HTMLElement) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'settings-panel hidden';
    this.overlay.addEventListener('mousedown', (e) => { if (e.target === this.overlay) this.close(); });
    this.body = document.createElement('div');
    this.body.className = 'settings-inner';
    this.overlay.appendChild(this.body);
    root.appendChild(this.overlay);
  }

  open(): void {
    this.settings = loadSettings();
    this.rebinding = null;
    this.render();
    this.overlay.classList.remove('hidden');
    window.addEventListener('keydown', this.keyHandler, true);
  }

  close(): void {
    this.overlay.classList.add('hidden');
    this.rebinding = null;
    window.removeEventListener('keydown', this.keyHandler, true);
  }

  private commit(): void {
    saveSettings(this.settings);
    if (this.onChange) this.onChange(this.settings);
  }

  private onKey(e: KeyboardEvent): void {
    if (this.rebinding) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        this.rebinding = null;
      } else if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
        this.settings.keymap[this.rebinding] = e.key;
        this.rebinding = null;
        this.commit();
      }
      this.render();
      return;
    }
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.close();
    }
  }

  private render(): void {
    const s = this.settings;
    this.body.replaceChildren();

    const h = document.createElement('h2');
    h.textContent = 'Settings';
    this.body.appendChild(h);

    const row = (label: string, control: HTMLElement, hint?: string): void => {
      const r = document.createElement('div');
      r.className = 'settings-row';
      const l = document.createElement('label');
      l.textContent = label;
      r.appendChild(l);
      r.appendChild(control);
      if (hint) {
        const p = document.createElement('small');
        p.textContent = hint;
        r.appendChild(p);
      }
      this.body.appendChild(r);
    };

    const sel = document.createElement('select');
    for (const m of ['off', 'deuteranopia', 'protanopia', 'tritanopia'] as ColorblindMode[]) {
      const o = document.createElement('option');
      o.value = m;
      o.textContent = m === 'off' ? 'Off' : m[0].toUpperCase() + m.slice(1);
      o.selected = s.colorblind === m;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => { s.colorblind = sel.value as ColorblindMode; this.commit(); });
    row('Colourblind mode', sel, 'Recolours factions with a safe palette.');

    const monthly = document.createElement('input');
    monthly.type = 'checkbox';
    monthly.checked = s.monthlyTurns;
    monthly.addEventListener('change', () => { s.monthlyTurns = monthly.checked; this.commit(); });
    row('Monthly turns', monthly, 'Pause at the turn of each month when something new needs you');

    const scaleWrap = document.createElement('div');
    scaleWrap.className = 'settings-scale';
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0.8';
    range.max = '1.4';
    range.step = '0.05';
    range.value = String(s.uiScale);
    const val = document.createElement('span');
    val.textContent = `${Math.round(s.uiScale * 100)}%`;
    range.addEventListener('input', () => {
      s.uiScale = Number(range.value);
      val.textContent = `${Math.round(s.uiScale * 100)}%`;
      this.commit();
    });
    scaleWrap.append(range, val);
    row('UI scale', scaleWrap);

    const tut = document.createElement('input');
    tut.type = 'checkbox';
    tut.checked = s.showTutorial;
    tut.addEventListener('change', () => { s.showTutorial = tut.checked; this.commit(); });
    row('Show tutorial', tut);

    const kh = document.createElement('h3');
    kh.textContent = 'Keys';
    this.body.appendChild(kh);
    const table = document.createElement('div');
    table.className = 'settings-keys';
    for (const a of ACTIONS) {
      const conflict = ACTIONS.some((b) => b !== a && normKey(s.keymap[b]) === normKey(s.keymap[a]));
      const r = document.createElement('button');
      r.type = 'button';
      r.className = 'settings-key-row' + (this.rebinding === a ? ' binding' : '') + (conflict ? ' conflict' : '');
      const n = document.createElement('span');
      n.textContent = ACTION_LABELS[a];
      const k = document.createElement('kbd');
      k.textContent = this.rebinding === a ? 'press a key...' : keyLabel(s.keymap[a]);
      r.append(n, k);
      if (conflict && this.rebinding !== a) {
        const c = document.createElement('em');
        c.textContent = 'conflict';
        r.appendChild(c);
      }
      r.addEventListener('click', () => { this.rebinding = a; this.render(); });
      table.appendChild(r);
    }
    this.body.appendChild(table);

    const foot = document.createElement('div');
    foot.className = 'settings-foot';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'Reset keys';
    reset.addEventListener('click', () => { s.keymap = { ...DEFAULT_SETTINGS.keymap }; this.rebinding = null; this.commit(); this.render(); });
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'primary';
    done.textContent = 'Done';
    done.addEventListener('click', () => this.close());
    foot.append(reset, done);
    this.body.appendChild(foot);
  }
}

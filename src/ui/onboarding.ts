export interface OnboardingState {
  year: number;
  month: number;
  paused: boolean;
  hasDecision: boolean;
  logLen: number;
  stateProclaimed: boolean;
  towns: number;
}

interface Step {
  id: string;
  title: string;
  text: string;
  anchor: string | null;
  ready: (s: OnboardingState) => boolean;
}

const STORAGE_KEY = 'centuria-onboarding';

const STEPS: Step[] = [
  { id: 'welcome', title: 'A colony, a century', anchor: null, ready: () => true,
    text: 'You govern a young colony in 1919. Guide it through the century to 2100 and leave a nation that endures.' },
  { id: 'dispatch', title: 'The Dispatch', anchor: '.dispatch', ready: () => true,
    text: 'The world talks back here — every power remembers what you do.' },
  { id: 'agenda', title: 'The agenda', anchor: '.agenda-bar', ready: () => true,
    text: 'Each month, matters that need you gather here. End month advances time and stops at the next turn.' },
  { id: 'decision', title: 'A decision', anchor: '.decision-card .decision-inner', ready: (s) => s.hasDecision,
    text: 'Decisions are voiced by people. Your choices become deeds that foreign powers react to.' },
  { id: 'borders', title: 'Borders', anchor: null, ready: (s) => s.towns >= 2,
    text: 'Your borders grow from your towns and drift under pressure; hatched ground is contested.' },
  { id: 'state', title: 'A state among states', anchor: null, ready: (s) => s.stateProclaimed,
    text: 'Press D for the diplomacy screen and H for the history of your nation.' },
];

function loadDone(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const p = JSON.parse(raw) as unknown;
    if (Array.isArray(p)) return new Set(p.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
  return new Set();
}

function saveDone(done: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...done]));
  } catch {
    return;
  }
}

export class Onboarding {
  private readonly root: HTMLElement;
  private readonly done: Set<string> = loadDone();
  private bubble: HTMLDivElement | null = null;
  private current: Step | null = null;
  private dismissed = false;

  constructor(root: HTMLElement) {
    this.root = root;
    if (STEPS.every((s) => this.done.has(s.id))) this.dismissed = true;
  }

  get active(): boolean {
    return this.bubble !== null;
  }

  update(state: OnboardingState): void {
    if (this.dismissed) return;
    if (this.current) {
      this.place(this.current);
      return;
    }
    const next = STEPS.find((s) => !this.done.has(s.id) && s.ready(state));
    if (next) this.show(next);
  }

  dismissAll(): void {
    for (const s of STEPS) this.done.add(s.id);
    saveDone(this.done);
    this.dismissed = true;
    this.hide();
  }

  private complete(step: Step): void {
    this.done.add(step.id);
    saveDone(this.done);
    this.hide();
  }

  private hide(): void {
    this.bubble?.remove();
    this.bubble = null;
    this.current = null;
  }

  private show(step: Step): void {
    this.current = step;
    const b = document.createElement('div');
    b.className = 'tip-bubble';
    const h = document.createElement('strong');
    h.textContent = step.title;
    const p = document.createElement('p');
    p.textContent = step.text;
    const row = document.createElement('div');
    row.className = 'tip-actions';
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'tip-skip';
    skip.textContent = 'Skip tutorial';
    skip.addEventListener('click', () => this.dismissAll());
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'tip-ok';
    ok.textContent = 'Got it';
    ok.addEventListener('click', () => this.complete(step));
    row.append(skip, ok);
    b.append(h, p, row);
    this.root.appendChild(b);
    this.bubble = b;
    this.place(step);
  }

  private place(step: Step): void {
    const b = this.bubble;
    if (!b) return;
    const target = step.anchor ? document.querySelector<HTMLElement>(step.anchor) : null;
    const r = target ? target.getBoundingClientRect() : null;
    if (!r || (r.width === 0 && r.height === 0)) {
      b.classList.add('centered');
      b.style.left = '';
      b.style.top = '';
      return;
    }
    b.classList.remove('centered');
    const bw = b.offsetWidth;
    const bh = b.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = r.bottom + 12;
    if (top + bh > vh - 8) top = Math.max(8, r.top - bh - 12);
    const left = Math.min(Math.max(8, r.left + r.width / 2 - bw / 2), vw - bw - 8);
    b.style.left = `${left}px`;
    b.style.top = `${top}px`;
  }
}

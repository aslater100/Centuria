import './researchScreen.css';
import { TECH_TREE, type RegionSim, type TechNode } from '../../sim/region';
import { DAYS_PER_YEAR } from '../../sim/defs';
import { issue } from '../../sim/commands';

type Tree = 'tech' | 'civics';
type State = 'done' | 'active' | 'avail' | 'locked';

const NODE_W = 172;
const NODE_H = 58;
const COL_GAP = 78;
const ROW_GAP = 16;
const PAD = 60;

interface Layout {
  pos: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
  cols: { x: number; label: string }[];
}

function esc(s: string | number): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDuration(days: number): string {
  if (!isFinite(days)) return 'never';
  if (days < 1) return '<1 day';
  if (days < 60) return `${Math.ceil(days)} days`;
  const yrs = days / DAYS_PER_YEAR;
  if (yrs < 1.5) return `${Math.round(days / 30)} months`;
  return `${yrs.toFixed(1)} years`;
}

function computeLayout(nodes: TechNode[]): Layout {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depth = new Map<string, number>();
  const depthOf = (id: string, stack: Set<string>): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (stack.has(id)) return 0;
    stack.add(id);
    let d = 0;
    for (const p of byId.get(id)?.prereqs ?? []) if (byId.has(p)) d = Math.max(d, depthOf(p, stack) + 1);
    stack.delete(id);
    depth.set(id, d);
    return d;
  };
  for (const n of nodes) depthOf(n.id, new Set());

  const maxDepth = Math.max(0, ...depth.values());
  const columns: TechNode[][] = Array.from({ length: maxDepth + 1 }, () => []);
  for (const n of nodes) columns[depth.get(n.id) ?? 0].push(n);
  columns[0].sort((a, b) => a.era - b.era || a.name.localeCompare(b.name));

  const row = new Map<string, number>();
  columns[0].forEach((n, i) => row.set(n.id, i));
  for (let c = 1; c <= maxDepth; c++) {
    const bary = (n: TechNode): number => {
      const rs = n.prereqs.map((p) => row.get(p)).filter((v): v is number => v !== undefined);
      return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
    };
    columns[c].sort((a, b) => bary(a) - bary(b) || a.era - b.era || a.name.localeCompare(b.name));
    const used = new Set<number>();
    for (const n of columns[c]) {
      let r = Math.max(0, Math.round(bary(n)));
      while (used.has(r)) r++;
      used.add(r);
      row.set(n.id, r);
    }
  }

  const pos = new Map<string, { x: number; y: number }>();
  let maxRow = 0;
  for (const [id, r] of row) {
    maxRow = Math.max(maxRow, r);
    pos.set(id, { x: PAD + (depth.get(id) ?? 0) * (NODE_W + COL_GAP), y: PAD + 30 + r * (NODE_H + ROW_GAP) });
  }
  const cols = columns.map((list, c) => {
    const era = list.length ? Math.min(...list.map((n) => n.era)) : 0;
    return { x: PAD + c * (NODE_W + COL_GAP), label: list.length ? (era <= 0 ? 'Origins' : `${era}`) : '' };
  });
  return {
    pos,
    width: PAD * 2 + (maxDepth + 1) * NODE_W + maxDepth * COL_GAP,
    height: PAD * 2 + 30 + (maxRow + 1) * NODE_H + maxRow * ROW_GAP,
    cols,
  };
}

export class ResearchScreen {
  readonly el: HTMLElement;
  private opened = false;
  private tab: Tree = 'tech';
  private last: RegionSim | null = null;
  private selected: string | null = null;
  private hovered: string | null = null;
  private query = '';
  private layouts = new Map<Tree, Layout>();
  private builtTab: Tree | null = null;
  private pan = { x: 0, y: 0 };
  private panned = new Set<Tree>();
  private drag: { sx: number; sy: number; px: number; py: number; moved: boolean } | null = null;
  private headEl!: HTMLElement;
  private viewport!: HTMLElement;
  private world!: HTMLElement;
  private cardEl!: HTMLElement;
  private searchEl!: HTMLInputElement;
  private nodeEls = new Map<string, HTMLElement>();
  private edgeEls: { el: SVGPathElement; from: string; to: string }[] = [];
  private cardSig = '';
  private readonly onKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') { ev.stopPropagation(); this.close(); }
  };

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'rs-screen hidden';
    this.el.innerHTML =
      `<div class="rs-top">` +
        `<div class="rs-title">Research</div>` +
        `<div class="rs-tabs">` +
          `<button class="rs-tab" data-tab="tech">Technology</button>` +
          `<button class="rs-tab" data-tab="civics">Civics</button>` +
        `</div>` +
        `<div class="rs-head"></div>` +
        `<input class="rs-search" type="search" placeholder="Search…" spellcheck="false" aria-label="Search research">` +
        `<button class="rs-close" aria-label="Close">×</button>` +
      `</div>` +
      `<div class="rs-body">` +
        `<div class="rs-viewport"><div class="rs-world"></div>` +
          `<div class="rs-hint">Drag to pan · scroll to move · shift+scroll sideways</div></div>` +
        `<aside class="rs-card"></aside>` +
      `</div>`;
    root.appendChild(this.el);
    this.headEl = this.el.querySelector('.rs-head')!;
    this.viewport = this.el.querySelector('.rs-viewport')!;
    this.world = this.el.querySelector('.rs-world')!;
    this.cardEl = this.el.querySelector('.rs-card')!;
    this.searchEl = this.el.querySelector('.rs-search')!;

    this.el.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      if (t.closest('.rs-close')) { this.close(); return; }
      const tabBtn = t.closest<HTMLElement>('[data-tab]');
      if (tabBtn) { this.tab = tabBtn.dataset.tab as Tree; this.selected = null; if (this.last) this.refresh(this.last); return; }
      const act = t.closest<HTMLButtonElement>('button[data-act]');
      if (act && !act.disabled && this.last) {
        if (act.dataset.act === 'start' && act.dataset.id) issue(this.last, 'startResearch', act.dataset.id);
        else if (act.dataset.act === 'cancel') issue(this.last, 'cancelResearch');
        this.refresh(this.last);
        return;
      }
      const node = t.closest<HTMLElement>('.rs-node');
      if (node && !this.drag?.moved) {
        this.selected = node.dataset.id ?? null;
        if (this.last) this.refresh(this.last);
      }
    });
    this.searchEl.addEventListener('input', () => {
      this.query = this.searchEl.value.trim().toLowerCase();
      if (this.last) this.refresh(this.last);
    });
    this.world.addEventListener('mouseover', (ev) => {
      const id = (ev.target as HTMLElement).closest<HTMLElement>('.rs-node')?.dataset.id ?? null;
      if (id !== this.hovered) { this.hovered = id; if (this.last) this.renderCard(this.last); }
    });
    this.world.addEventListener('mouseleave', () => {
      this.hovered = null;
      if (this.last) this.renderCard(this.last);
    });
    this.viewport.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      this.drag = { sx: ev.clientX, sy: ev.clientY, px: this.pan.x, py: this.pan.y, moved: false };
    });
    window.addEventListener('pointermove', (ev) => {
      const d = this.drag;
      if (!d) return;
      const dx = ev.clientX - d.sx, dy = ev.clientY - d.sy;
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
      d.moved = true;
      this.viewport.classList.add('dragging');
      this.setPan(d.px + dx, d.py + dy);
    });
    window.addEventListener('pointerup', () => {
      if (!this.drag) return;
      this.viewport.classList.remove('dragging');
      const moved = this.drag.moved;
      setTimeout(() => { this.drag = null; }, 0);
      if (!moved) this.drag = null;
    });
    this.viewport.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const horiz = ev.shiftKey || Math.abs(ev.deltaX) > Math.abs(ev.deltaY);
      const d = horiz ? (ev.deltaX || ev.deltaY) : ev.deltaY;
      this.setPan(this.pan.x - (horiz ? d : 0), this.pan.y - (horiz ? 0 : d));
    }, { passive: false });
  }

  get isOpen(): boolean {
    return this.opened;
  }

  open(r: RegionSim): void {
    this.last = r;
    if (!this.opened) document.addEventListener('keydown', this.onKey, true);
    this.opened = true;
    this.el.classList.remove('hidden');
    this.builtTab = null;
    this.panned.clear();
    this.refresh(r);
    this.searchEl.focus({ preventScroll: true });
  }

  close(): void {
    if (this.opened) document.removeEventListener('keydown', this.onKey, true);
    this.opened = false;
    this.hovered = null;
    this.el.classList.add('hidden');
  }

  refresh(r: RegionSim): void {
    this.last = r;
    if (!this.opened) return;
    for (const b of this.el.querySelectorAll<HTMLElement>('.rs-tab')) b.classList.toggle('active', b.dataset.tab === this.tab);
    if (this.builtTab !== this.tab) this.buildGraph();
    this.updateGraph(r);
    this.renderHead(r);
    this.renderCard(r);
  }

  private setPan(x: number, y: number): void {
    const lay = this.layouts.get(this.tab);
    const vw = this.viewport.clientWidth, vh = this.viewport.clientHeight;
    if (lay) {
      const minX = Math.min(0, vw - lay.width), minY = Math.min(0, vh - lay.height);
      x = Math.max(minX - 40, Math.min(40, x));
      y = Math.max(minY - 40, Math.min(40, y));
    }
    this.pan = { x, y };
    this.world.style.transform = `translate(${x}px, ${y}px)`;
  }

  private buildGraph(): void {
    const nodes = TECH_TREE.filter((n) => n.tree === this.tab);
    let lay = this.layouts.get(this.tab);
    if (!lay) { lay = computeLayout(nodes); this.layouts.set(this.tab, lay); }
    this.nodeEls.clear();
    this.edgeEls = [];
    let edges = '';
    const ids = new Set(nodes.map((n) => n.id));
    for (const n of nodes) {
      const to = lay.pos.get(n.id)!;
      for (const p of n.prereqs) {
        const from = lay.pos.get(p);
        if (!from || !ids.has(p)) continue;
        const x1 = from.x + NODE_W, y1 = from.y + NODE_H / 2, x2 = to.x, y2 = to.y + NODE_H / 2;
        const mx = (x1 + x2) / 2;
        edges += `<path class="rs-edge" data-from="${esc(p)}" data-to="${esc(n.id)}" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}"/>`;
      }
    }
    const heads = lay.cols.filter((c) => c.label).map((c) =>
      `<div class="rs-colhead" style="left:${c.x}px;width:${NODE_W}px">${esc(c.label)}</div>`).join('');
    const boxes = nodes.map((n) => {
      const p = lay!.pos.get(n.id)!;
      return `<div class="rs-node" data-id="${esc(n.id)}" style="left:${p.x}px;top:${p.y}px;width:${NODE_W}px;height:${NODE_H}px">` +
        `<div class="rs-fill"></div><div class="rs-name">${esc(n.name)}</div>` +
        `<div class="rs-meta"><span class="rs-era">${n.era}</span><span class="rs-cost"></span></div></div>`;
    }).join('');
    this.world.style.width = `${lay.width}px`;
    this.world.style.height = `${lay.height}px`;
    this.world.innerHTML = `<svg class="rs-edges" width="${lay.width}" height="${lay.height}">${edges}</svg>${heads}${boxes}`;
    for (const el of this.world.querySelectorAll<HTMLElement>('.rs-node')) this.nodeEls.set(el.dataset.id!, el);
    for (const el of this.world.querySelectorAll<SVGPathElement>('.rs-edge')) {
      this.edgeEls.push({ el, from: el.dataset.from!, to: el.dataset.to! });
    }
    this.builtTab = this.tab;
    if (!this.panned.has(this.tab)) {
      this.panned.add(this.tab);
      this.setPan(0, 0);
    } else this.setPan(this.pan.x, this.pan.y);
  }

  private stateOf(r: RegionSim, n: TechNode, avail: Set<string>): State {
    if (r.has(n.id)) return 'done';
    if (r.activeResearch === n.id) return 'active';
    return avail.has(n.id) ? 'avail' : 'locked';
  }

  private updateGraph(r: RegionSim): void {
    const avail = new Set(r.availableToResearch().map((n) => n.id));
    const q = this.query;
    const focus = this.selected;
    const chain = new Set<string>();
    if (focus) {
      const walk = (id: string): void => {
        if (chain.has(id)) return;
        chain.add(id);
        for (const p of TECH_TREE.find((n) => n.id === id)?.prereqs ?? []) walk(p);
      };
      walk(focus);
    }
    for (const n of TECH_TREE) {
      const el = this.nodeEls.get(n.id);
      if (!el) continue;
      const st = this.stateOf(r, n, avail);
      el.dataset.state = st;
      const match = !q || n.name.toLowerCase().includes(q) || n.desc.toLowerCase().includes(q);
      el.classList.toggle('dim', !match);
      el.classList.toggle('hit', !!q && match);
      el.classList.toggle('sel', n.id === focus);
      el.classList.toggle('chain', !!focus && chain.has(n.id) && n.id !== focus);
      const cost = el.querySelector<HTMLElement>('.rs-cost')!;
      const fill = el.querySelector<HTMLElement>('.rs-fill')!;
      if (st === 'done') { cost.textContent = '✓'; fill.style.width = '0'; }
      else if (st === 'active') {
        const pct = Math.min(100, (r.researchProgress / r.techCost(n)) * 100);
        cost.textContent = `${Math.floor(pct)}%`;
        fill.style.width = `${pct}%`;
      } else { cost.textContent = `${r.techCost(n)} RP`; fill.style.width = '0'; }
    }
    for (const e of this.edgeEls) {
      e.el.classList.toggle('on', r.has(e.from));
      e.el.classList.toggle('chain', !!focus && chain.has(e.from) && chain.has(e.to));
      e.el.classList.toggle('dim', !!q && !(this.nodeEls.get(e.from)?.classList.contains('hit') || this.nodeEls.get(e.to)?.classList.contains('hit')));
    }
  }

  private renderHead(r: RegionSim): void {
    const rate = r.researchRate();
    const active = r.activeResearch ? TECH_TREE.find((n) => n.id === r.activeResearch) : undefined;
    let html = `<span class="rs-rate"><b>${rate.toFixed(1)}</b> RP/day</span>`;
    if (active) {
      const cost = r.techCost(active);
      const pct = Math.min(100, (r.researchProgress / cost) * 100);
      const eta = fmtDuration((cost - r.researchProgress) / Math.max(rate, 1e-9));
      html += `<span class="rs-cur"><span class="rs-cur-name">${esc(active.name)}</span>` +
        `<span class="rs-bar"><i style="width:${pct}%"></i></span>` +
        `<span class="rs-eta">${Math.floor(pct)}% · ${esc(eta)}</span></span>`;
    } else {
      html += `<span class="rs-idle">Idle — choose a node to research</span>`;
    }
    if (this.headEl.dataset.sig !== html) { this.headEl.innerHTML = html; this.headEl.dataset.sig = html; }
  }

  private renderCard(r: RegionSim): void {
    const id = this.hovered ?? this.selected;
    const n = id ? TECH_TREE.find((x) => x.id === id) : undefined;
    if (!n) {
      const sig = 'empty';
      if (this.cardSig !== sig) {
        this.cardSig = sig;
        const done = TECH_TREE.filter((t) => t.tree === this.tab && r.has(t.id)).length;
        const total = TECH_TREE.filter((t) => t.tree === this.tab).length;
        this.cardEl.innerHTML = `<div class="rs-empty"><div class="rs-empty-big">${done}<span> / ${total}</span></div>` +
          `<p>${this.tab === 'tech' ? 'technologies' : 'civics'} discovered.</p><p class="rs-dimtxt">Hover a node for details, click to select it.</p>` +
          `<div class="rs-legend"><i class="lg done"></i>Researched<i class="lg avail"></i>Available<i class="lg active"></i>In progress<i class="lg locked"></i>Locked</div></div>`;
      }
      return;
    }
    const avail = new Set(r.availableToResearch().map((x) => x.id));
    const st = this.stateOf(r, n, avail);
    const cost = r.techCost(n);
    const rate = r.researchRate();
    const unmet = n.prereqs.filter((p) => !r.has(p));
    const pct = st === 'active' ? Math.min(100, (r.researchProgress / cost) * 100) : 0;
    const sig = `${n.id}|${st}|${cost}|${rate.toFixed(1)}|${Math.floor(pct)}|${this.hovered ? 'h' : 's'}|${r.year}|${r.stateProclaimed}`;
    if (sig === this.cardSig) return;
    this.cardSig = sig;

    const pre = n.prereqs.map((p) => {
      const pn = TECH_TREE.find((x) => x.id === p);
      return `<li class="${r.has(p) ? 'ok' : 'no'}">${r.has(p) ? '✓' : '○'} ${esc(pn?.name ?? p)}</li>`;
    }).join('');
    const unlocks = TECH_TREE.filter((x) => x.prereqs.includes(n.id)).map((x) => `<li>${esc(x.name)}</li>`).join('');
    const stLabel = { done: 'Researched', active: 'In progress', avail: 'Available', locked: 'Locked' }[st];
    let lock = '';
    if (st === 'locked') {
      if (unmet.length) lock = `Requires ${unmet.map((p) => TECH_TREE.find((x) => x.id === p)?.name ?? p).join(', ')}`;
      else if (n.requiresState && !r.stateProclaimed) lock = 'Requires statehood';
      else if (r.year < n.era) lock = `Available from ${n.era}`;
    }
    const time = st === 'done' ? '—' : fmtDuration((st === 'active' ? cost - r.researchProgress : cost) / Math.max(rate, 1e-9));
    let btn = '';
    if (!this.hovered || this.hovered === this.selected) {
      if (st === 'avail') btn = `<button class="rs-btn primary" data-act="start" data-id="${esc(n.id)}">${r.activeResearch ? 'Switch research here' : 'Research'}</button>`;
      else if (st === 'active') btn = `<button class="rs-btn danger" data-act="cancel">Cancel research</button>`;
    }
    this.cardEl.innerHTML =
      `<div class="rs-card-state" data-state="${st}">${stLabel}</div>` +
      `<h2>${esc(n.name)}</h2>` +
      `<div class="rs-card-sub">${n.tree === 'tech' ? 'Technology' : 'Civic'} · era ${n.era}${n.requiresState ? ' · needs a State' : ''}</div>` +
      `<p class="rs-desc">${esc(n.desc)}</p>` +
      (st === 'active' ? `<div class="rs-bar big"><i style="width:${pct}%"></i></div>` : '') +
      `<dl class="rs-stats"><dt>Cost</dt><dd>${cost} RP</dd><dt>${st === 'active' ? 'Remaining' : 'Time'}</dt><dd>${esc(time)}</dd>` +
      `<dt>Rate</dt><dd>${rate.toFixed(1)} RP/day</dd></dl>` +
      (lock ? `<div class="rs-lock">${esc(lock)}</div>` : '') +
      (pre ? `<h3>Requires</h3><ul class="rs-list">${pre}</ul>` : '') +
      (unlocks ? `<h3>Unlocks</h3><ul class="rs-list">${unlocks}</ul>` : '') +
      (btn ? `<div class="rs-actions">${btn}</div>` : '');
  }
}

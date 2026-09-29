/**
 * Region view (Tier 1.5 → 2): the zoomed-out map that becomes the default
 * operating altitude after the flip (GDD §2.5). Painterly backdrop, town
 * markers, routes, expedition wagons; DOM panel for the selected settlement.
 */
import './panels.css';
import type { Scout, GovLean, GovType, MinisterRoleId, ArmyUnitType, Province, DynastyNode } from '../sim/region';
import { RegionSim, GOV_LEANS, GOV_TYPES, MINISTER_ROLES, REGION_BUILDINGS, DISTRICT_DEFS, RIVAL_REGIMES, BRANCH_YEAR, UNIT_TYPES } from '../sim/region';


import { formatCurrency } from '../sim/defs';

import { REGION_N } from '../sim/worldgen';
import { hexNeighbors, hexNeighborDir, hexCenter, hexCorners, hexLayoutParams, screenToHex } from '../sim/hex';
import { DesignScreen } from './designscreen';
import { Minimap } from './minimap';
import { displayScale } from './dpr';

import { centuryGraphHtml } from './centuryGraph';
import { AssetRegistry, townSpriteTier, TOWN_TIER_PX } from './assets/registry';
import { buildPawnSprites } from './sprites';
import { Backdrop, buildBackdropPalette, eraIdForYear, eraKeyLight, type Sky, type Branch } from './backdrop';
import { Modal } from './components';
import { WikiPanel } from './WikiPanel';
import { issue } from '../sim/commands';
import { expandHistory } from '../sim/territory';
import { factionColor, type Settings } from './settings';
import { QUIRKS } from '../sim/procgen/nation';
import { flagDataUrl } from './flag';
import { Dispatch, AgendaBar, DecisionCard } from './dispatch';
import { DiplomacyScreen } from './diplomacyScreen';
import { EconomyScreen } from './screens/economyScreen';
import { ResearchScreen } from './screens/researchScreen';
import { TownDrawer } from './screens/townDrawer';
import { NationScreen } from './screens/nationScreen';
import { ScreenRail, type RailScreen } from './screens/rail';

/** localStorage flag (U3): the in-game wiki auto-opens once on a player's first game. */
const WIKI_FIRST_RUN_KEY = 'centuria-wiki-seen';

// Hoisted draw-path color tables — the per-frame loops that use these run
// every frame, so the literals must not be rebuilt inside them.
const CARGO_RGB: Record<string, string> = {
  agriculture: '194,161,77', industry: '140,104,72', services: '74,127,164', information: '122,90,154',
};
const SECTOR_RGB: Record<string, string> = {
  agriculture: '138,154,74', industry: '154,106,58', services: '74,127,164', information: '122,90,154',
};
const SECTOR_HEX: Record<string, string> = {
  agriculture: '#8a9a4a', industry: '#9a6a3a', services: '#4a7fa4', information: '#7a5a9a', all: '#9a8a5a',
};
// The era/branch key-light table lives in backdrop.ts (eraKeyLight) beside
// ERA_SKY, so a future branch repaints the light exactly as it repaints the
// sky. Season nudges the wash alphas: summer brighter/warmer, winter cooler.
const SEASON_WARM_A = [0.07, 0.08, 0.07, 0.055];
const SEASON_COOL_A = [0.10, 0.09, 0.105, 0.125];

// O(1) def lookups for the per-frame building/district render loops (the
// arrays are small, but `.find` per placed item per frame adds up).
const DISTRICT_DEF_BY_ID = new Map(DISTRICT_DEFS.map((d) => [d.id, d]));
const REGION_BUILDING_BY_ID = new Map(REGION_BUILDINGS.map((b) => [b.id, b]));

/** Trace the hex polygon from precomputed corners into the current path —
 *  the single copy of the corner walk shared by fill/stroke/clip sites, so
 *  hex geometry can never drift between the fill and the clip that masks it. */
function traceHexPath(g: CanvasRenderingContext2D, corners: { x: number; y: number }[]): void {
  g.beginPath();
  g.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 6; i++) g.lineTo(corners[i].x, corners[i].y);
  g.closePath();
}

/** Fill a hex polygon from precomputed corners (no stroke). */
function fillHexPath(g: CanvasRenderingContext2D, corners: { x: number; y: number }[]): void {
  traceHexPath(g, corners);
  g.fill();
}

function strokeHexPath(g: CanvasRenderingContext2D, corners: { x: number; y: number }[]): void {
  traceHexPath(g, corners);
  g.stroke();
}

/** Parse a #rrggbb (or #rgb) hex string to {r,g,b}; falls back to grey. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (!Number.isFinite(n) || h.length !== 6) return { r: 136, g: 136, b: 136 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Gilded meter bar (style.css .meter): an inlaid channel with a lit fill.
 *  Tone maps the old semantic bar colors onto the m-good/m-bad/m-info variants;
 *  'warn' and 'gold' ride the default brass fill. The fill width stays inline —
 *  it is data, not styling. An explicit `fill` color (categorical data like
 *  sector or cargo hues) also stays inline for the same reason. */
function meterBar(pct: number, tone: 'good' | 'warn' | 'bad' | 'info' | 'gold' = 'gold', fill?: string): string {
  const cls = tone === 'good' ? ' m-good' : tone === 'bad' ? ' m-bad' : tone === 'info' ? ' m-info' : '';
  const w = Math.max(0, Math.min(100, Math.round(pct)));
  return `<div class="meter${cls}"><i style="width:${w}%${fill ? `;background:${fill}` : ''}"></i></div>`;
}

/** U7c: a hue-independent state glyph so a c-good/c-warn/c-bad value still reads
 *  as safe/attention/danger for color-blind players. Matches the repo's existing
 *  ✓/⚠/✗ vocabulary (cf. supplyStatus). Returns '' for neutral/unknown tones. */
function toneGlyph(cls: string): string {
  return cls === 'c-good' ? '✓' : cls === 'c-warn' ? '⚠' : cls === 'c-bad' ? '✗' : '';
}

/** Build an HTML dynasty section for the Century Report.
 *  Renders parent → children relationships among Notables. */
function dynastyHtml(r: RegionSim): string {
  const tree: DynastyNode[] = r.buildDynastyTree();
  if (tree.length === 0) return '';

  // Group by parent: roots are nodes without a parentId in the tree set
  const ids = new Set(tree.map((n) => n.id));
  const roots = tree.filter((n) => n.parentId === undefined || !ids.has(n.parentId));
  const childrenOf = (parentId: number) => tree.filter((n) => n.parentId === parentId);

  const renderNode = (n: DynastyNode, depth: number): string => {
    const indent = '&nbsp;'.repeat(depth * 4);
    const lifespan = n.deathYear
      ? `${n.birthYear}–${n.deathYear}`
      : `b. ${n.birthYear}`;
    const roleTag = n.role ? ` <span class="insp-skills">[${n.role}]</span>` : '';
    const line = `<p>${indent}<b>${n.name}</b> ${lifespan}${roleTag}</p>`;
    return line + childrenOf(n.id).map((c) => renderNode(c, depth + 1)).join('');
  };

  return `<p class="insp-skills">DYNASTIES</p>` +
    roots.map((root) => renderNode(root, 0)).join('');
}

export class RegionView {
  selectedId: number | null = null;
  /** Currently highlighted rival faction (null = none). */
  selectedFactionId: number | null = null;
  /** set true by the view while the Incorporation ceremony is on screen */
  ceremonyOpen = false;
  conventionOpen = false;
  /** Guards drawConvention against rebuilding its DOM every frame — the rebuild
   *  wiped the player's picks and destroyed buttons mid-click. Built once on open,
   *  reset when the convention closes. */
  private conventionBuilt = false;
  /** True when player is in "claim land" mode — clicking map cells triggers claimCell(). */
  claimLandMode = false;
  /** "Found town" placement mode: the source town whose expedition we're siting,
   *  plus the precomputed set of valid target cells (key = col*REGION_N + row) so
   *  the per-frame highlight doesn't re-validate 16k hexes. */
  private foundingFromId: number | null = null;
  private foundingValidCells: Set<number> | null = null;
  /** "Place building" mode (spatial-4X Phase B): the town + building def awaiting a
   *  hex, plus the precomputed legal cells for the highlight overlay. */
  private buildingPlacement: { townId: number; defId: string } | null = null;
  private buildingValidCells: Set<number> | null = null;
  /** Spatial-4X Phase D — district zoning placement mode (mutually exclusive with
   *  building placement and founding). Same legal cells as a building. */
  private districtPlacement: { townId: number; defId: string } | null = null;
  private districtValidCells: Set<number> | null = null;
  /** Province overlay toggle (P key or State panel button). Shows province labels + stats on map. */
  provinceViewActive = false;
  /** Currently selected province id (= settlement id), null if none. */
  private selectedProvinceId: number | null = null;
  private provincePanel: HTMLElement;
  private lastProvincePanelId: number | null = null;
  private lastProvincePanelBuildFrame = -999;
  private g: CanvasRenderingContext2D;
  /** Top-bar speed control: when true the speed cell shows the pause/1×/3×/8×
   *  buttons instead of the compact readout. Purely a display toggle. */
  private speedExpanded = false;
  /** Hooks into main.ts, which owns the authoritative game-speed / pause / menu
   *  state (the loop reads them). Assigned in main.ts after RegionView is built;
   *  null-safe so headless callers don't need to wire them. */
  onSetSpeed: ((speed: number) => void) | null = null;
  onTogglePause: (() => void) | null = null;
  onOpenGameMenu: (() => void) | null = null;
  /** Dedicated Central Bank window (B key); unlocked by the Central Banking civic
   *  or the Central Bank Charter law. */
  private ceremony: HTMLElement;
  private convention: HTMLElement;
  // the bargaining table (GDD §6.3): basket state lives here while composing
  private rivalPanel: HTMLElement;
  private lastRivalPanelFactionId: number | null = null;
  /** The Century Report (GDD §8.4): shown once at 2100, dismissible. */
  private centuryModal: HTMLElement;
  private centuryDismissed = false;
  /** Win condition modal: shown once when any path is achieved. */
  private winModal: HTMLElement;
  private winDismissed = false;
  /** Era-branch reveal modal: shown once when the century forks (GDD §3.2). */
  private eraModal: HTMLElement;
  private eraDismissed = false;
  /** Post-2100 epilogue scroll: the accumulated legacy beats (GDD §8.5). */
  private epilogueModal: HTMLElement;
  /** U3: in-game help/wiki, opened from the top bar's Help button or the ?/H keys. */
  private wikiPanel: WikiPanel;
  /** Cinematic state machine: a frame-driven canvas sequence under the era/win
   *  modal. While active, the DOM reveal is held back so the animation reads. */
  private cinematic: { kind: 'era' | 'win'; variant: string; startFrame: number } | null = null;
  /** View-only latches so each cinematic plays at most once per session. */
  private playedEraCinematic = false;
  private playedWinCinematic = false;
  /** Unit recruitment modal (GDD §7.1: military depth). */
  private recruitmentModal: HTMLElement;
  /** Animation clock in 60ths of a second (a "frame" at the 60 fps design
   *  baseline). Advanced by wall-clock dt each draw — NOT by 1 per draw — so
   *  pulses, waves, and cadence throttles run at the same real-world speed at
   *  any render rate. Fractional; comparisons stay inequality-based. */
  private frame = 0;
  /** Wall-clock timestamp of the previous draw, for the `frame` advance. */
  private lastDrawMs = 0;
  /** Pawn sprites (settler/armed/raider) for rendering armies on the map; built
   *  lazily on first army draw so a session with no armies pays nothing. */
  private pawns?: ReturnType<typeof buildPawnSprites>;
  // ---- Static-map cache. Terrain + territory fills are O(N²) and barely change,
  //      so render them once into an offscreen canvas (base coords) and blit it
  //      under the camera each frame. Rebuilt only when the signature changes,
  //      which keeps the per-frame cost independent of REGION_N. ----
  // Memory-fog cache: explored-but-not-visible tiles. Same idea as mapCache but
  // keyed on exploredCount + visibilityVersion so it rebuilds when scouts move.
  // Offscreen canvas of water pixels; rebuilt only on canvas resize (biomes are fixed).
  private waterMaskCanvas: HTMLCanvasElement | null = null;
  // Water pixels carrying a diagonal sun-highlight (bright upper-left) for an
  // additive specular glint; built alongside the mask, blitted per frame.
  private waterGlintCanvas: HTMLCanvasElement | null = null;
  private waterMaskDims = '';
  // Cached vignette gradient — rebuilt only when canvas dimensions change.
  private vignetteGrad: CanvasGradient | null = null;
  private vignetteDims = '';
  // Cached era/season key-light gradient — rebuilt only when size, era or season changes.
  private lightGrad: CanvasGradient | null = null;
  private lightSig = '';
  // Reusable hex-shaped alpha masks (ambient occlusion, coast shallows), keyed by
  // kind+size. Blitted per tile into the static mapCache — one drawImage instead
  // of a per-hex CanvasGradient (there are up to REGION_N² = 16384 tiles).
  private hexMaskCache = new Map<string, HTMLCanvasElement>();
  // Cached hex layout params (size/ox/oy) — only depend on canvas dimensions.
  private cachedHexLayout: { size: number; ox: number; oy: number } | null = null;
  // Cached pixel-coord arrays for route paths — stable until canvas resize.
  private routePtsCache = new WeakMap<object, { px: number; py: number }[]>();
  /** Route bounding boxes in base coords, for viewport culling — derived from
   *  `routePtsCache`, reset together with it (paths are immutable per route). */
  private routeBBoxCache = new WeakMap<object, { l: number; t: number; r: number; b: number }>();
  // Last HTML written to each panel, so setInnerHtml can skip no-op reflows.
  private lastPanelHtml = new WeakMap<HTMLElement, string>();
  // Canvas dims from last frame — detects resize so caches above can be cleared.
  private prevCanvasW = 0;
  private prevCanvasH = 0;
  // DOM update throttles — avoid innerHTML reflows every rAF frame.
  private lastTopBarFrame = -999;
  // Province list cache: computeProvinces() is O(settlements) but called in two hot paths.
  private _provincesCache: Province[] = [];
  private _provincesCacheFrame = -1;
  /** Visible region in base (pre-camera) coords — culls off-screen sprites. */
  private vb = { l: 0, t: 0, r: 0, b: 0 };
  private lastPanelBuildFrame = -999;
  /** Currently selected player scout id (null = none). Click map to send to target. */
  private selectedScoutId: number | null = null;
  // ---- Map camera (zoom + pan). Default view starts zoomed on the founding
  //      settlement (Civ-style); zoom out to see the whole region. ----
  private camScale = 11;
  private camX = 0; // screen-px offset applied after scaling
  private camY = 0;
  // Centuria 2.0 world map: HOME_SCALE frames the founding valley at the same hex
  // size as the old 128² region; MIN_SCALE pulls back to the whole world (the
  // tiled cache keeps that cheap); MAX_SCALE zooms until one hex fills a good
  // chunk of the screen.
  private static readonly HOME_SCALE = 11;
  private static readonly MIN_SCALE = 0.9;
  private static readonly MAX_SCALE = 40;
  // ---- Minimap (corner navigation aid) ----
  private minimap: Minimap;
  // ---- Tooltips (settlement hover info) ----
  private tooltip: HTMLElement;
  private tooltipSettlementId: number | null = null;

  /** Manifest-driven art overrides for the 4X map; procedural fallback when absent. */
  private readonly assets = new AssetRegistry();

  /** Parallax atmosphere behind the map; era/season/weather/tension-tinted. */
  private readonly backdrop = new Backdrop();

  constructor(private canvas: HTMLCanvasElement, private region: RegionSim, private root: HTMLElement) {
    this.g = canvas.getContext('2d', { alpha: false })!;
    void this.assets.load();
    // If the era was already decided in a prior session (loaded save), treat the
    // reveal as already dismissed — only fire for a fork that happens live here.
    this.eraDismissed = region.eraBranch !== null;
    // Same for the cinematics: a save loaded mid/late-game skips the animation
    // for moments that already happened, so they only play on a live transition.
    this.playedEraCinematic = region.eraBranch !== null;
    this.playedWinCinematic = region.winCondition !== null;
    this.ceremony = document.createElement('div');
    this.ceremony.className = 'ceremony hidden';
    root.appendChild(this.ceremony);
    this.convention = document.createElement('div');
    this.convention.className = 'ceremony hidden';
    root.appendChild(this.convention);
    this.centuryModal = document.createElement('div');
    this.centuryModal.className = 'ceremony hidden';
    root.appendChild(this.centuryModal);
    this.winModal = document.createElement('div');
    this.winModal.className = 'win-modal hidden';
    root.appendChild(this.winModal);
    this.eraModal = document.createElement('div');
    this.eraModal.className = 'win-modal hidden';
    root.appendChild(this.eraModal);
    this.epilogueModal = document.createElement('div');
    this.epilogueModal.className = 'ceremony hidden';
    root.appendChild(this.epilogueModal);
    this.recruitmentModal = document.createElement('div');
    this.recruitmentModal.className = 'ceremony hidden';
    root.appendChild(this.recruitmentModal);
    this.rivalPanel = document.createElement('div');
    this.rivalPanel.className = 'inspector region-panel hidden';
    root.appendChild(this.rivalPanel);
    this.provincePanel = document.createElement('div');
    this.provincePanel.className = 'inspector region-panel hidden';
    root.appendChild(this.provincePanel);
    // U3: in-game wiki — dead code until now. Auto-opens once on a player's very
    // first game (localStorage flag), otherwise stays closed until the Help
    // button or ? key open it.
    this.wikiPanel = new WikiPanel(root);
    // The first-session tutorial (onboarding.ts) now does the welcoming; the wiki
    // stays one keypress (?) away instead of covering the map on first launch.
    try { localStorage.setItem(WIKI_FIRST_RUN_KEY, '1'); } catch { /* storage blocked */ }
    this.minimap = new Minimap(region, root, { size: 140, position: 'bottom-right' });
    // Create tooltip element
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'cv-tooltip hidden';
    root.appendChild(this.tooltip);
    // Create top bar for metrics
    const topBar = document.createElement('div');
    topBar.id = 'top-bar';
    topBar.className = 'topbar';
    root.appendChild(topBar);
    this.topBar = topBar;
    // Create scrollable event log (recent events, newest first)
    this.dispatch = new Dispatch(root);
    this.agendaBar = new AgendaBar(root);
    this.dispatch.onFocusRival = () => this.focusDiplomacy();
    this.agendaBar.onFocusRival = () => this.focusDiplomacy();
    this.agendaBar.onFocusSettlement = (id) => this.focusTown(id);
    this.agendaBar.onAdvanceMonth = () => this.onAdvanceMonth?.();
    this.decisionCard = new DecisionCard(root);
    this.diplomacyScreen = new DiplomacyScreen(root);
    this.diplomacyScreen.onLocate = (rid) => this.locateRival(rid);
    this.economyScreen = new EconomyScreen(root);
    this.researchScreen = new ResearchScreen(root);
    this.townDrawer = new TownDrawer(root);
    this.nationScreen = new NationScreen(root);
    this.nationScreen.onSetFiscal = (k, v) => {
      if (k === 'taxRate') issue(this.region, 'setTaxRate', v);
      else if (k === 'servicesLevel') issue(this.region, 'setServicesLevel', v);
      else issue(this.region, 'setMilitiaLevel', v);
    };
    this.agendaBar.onOpenNation = (tab) => this.nationScreen.open(this.region, tab);
    this.nationScreen.onProclaimNation = () => { this.nationScreen.close(); this.conventionOpen = true; };
    this.rail = new ScreenRail(root);
    this.rail.onOpen = (id) => this.openScreen(id);
    this.economyScreen.onFocusTown = (id) => { this.economyScreen.close(); this.focusTown(id); };
    this.townDrawer.onFound = (id) => { this.townDrawer.close(); this.toggleFoundingMode(id); };
    this.townDrawer.onStartBuild = (id, def) => { this.townDrawer.close(); this.toggleBuildingPlacement(id, def); };
    this.townDrawer.onStartDistrict = (id, def) => { this.townDrawer.close(); this.toggleDistrictPlacement(id, def); };
    this.agendaBar.onOpenDecision = (id) => this.decisionCard.open(this.region, id);
    this.decisionCard.onChoose = (id, i) => { issue(this.region, 'chooseEventOption', id, i); };
    // Start zoomed in on the founding settlement (Civ-style entry view).
    if (region.settlements.length > 0) {
      const home = region.settlements[0];
      this.camScale = RegionView.HOME_SCALE;
      const { size, ox, oy } = hexLayoutParams(this.viewW, this.viewH, REGION_N, 60);
      const col = Math.max(0, Math.min(REGION_N - 1, Math.floor((home.x / 100) * REGION_N)));
      const row = Math.max(0, Math.min(REGION_N - 1, Math.floor((home.y / 100) * REGION_N)));
      const { x: bx, y: by } = hexCenter(col, row, size, ox, oy);
      this.camX = this.viewW / 2 - bx * this.camScale;
      this.camY = this.viewH / 2 - by * this.camScale;
      this.clampCamera();
    }
  }

  /** Top bar displaying game metrics. */
  private topBar: HTMLElement;
  /** Scrollable event log showing recent events (newest first). */
  readonly dispatch: Dispatch;
  readonly agendaBar: AgendaBar;
  readonly decisionCard: DecisionCard;
  readonly diplomacyScreen: DiplomacyScreen;
  readonly economyScreen: EconomyScreen;
  readonly researchScreen: ResearchScreen;
  readonly townDrawer: TownDrawer;
  readonly nationScreen: NationScreen;
  readonly rail: ScreenRail;
  /** Set by main.ts for rail entries it owns (history, settings, nation). */
  onRailScreen: ((id: RailScreen) => void) | null = null;

  /** Open one full screen from the rail or its hotkey (toggles if already open). */
  openScreen(id: RailScreen): void {
    const r = this.region;
    const toggle = (s: { isOpen: boolean; open(r: RegionSim): void; close(): void }) => (s.isOpen ? s.close() : s.open(r));
    if (id === 'nation') toggle(this.nationScreen);
    else if (id === 'economy') toggle(this.economyScreen);
    else if (id === 'research') toggle(this.researchScreen);
    else if (id === 'foreign') toggle(this.diplomacyScreen);
    else if (id === 'help') this.toggleWikiPanel();
    else if (id === 'provinces') this.toggleProvinceView();
    else if (id === 'claim') this.claimLandMode = !this.claimLandMode && r.stateProclaimed;
    else this.onRailScreen?.(id);
  }

  /** Pan to a great power's capital (Foreign Affairs → "Locate on map"). */
  locateRival(rivalId: number): void {
    const rv = this.region.rival(rivalId);
    const f = rv?.factionId !== undefined ? this.region.faction(rv.factionId) : undefined;
    const cap = f ? this.region.settlement(f.capital) : undefined;
    if (!cap) return;
    this.diplomacyScreen.close();
    this.centerOn(cap.x, cap.y, Math.max(4, Math.min(this.camScale, 8)));
    this.selectedFactionId = f!.id;
  }

  /** Centre the camera on a town and open its drawer. */
  focusTown(id: number): void {
    const t = this.region.settlement(id);
    if (!t) return;
    this.selectedId = id;
    this.townDrawer.open(this.region, id);
    this.centerOn(t.x, t.y);
  }

  /** Pop the first open decision (called by main.ts when the turn holds). */
  openPendingDecision(): void {
    const a = this.region.activeDecisions[0];
    if (a && !this.decisionCard.isOpen) this.decisionCard.open(this.region, a.eventId);
  }
  /** Set by main.ts: the loop is holding at the turn of the month. */
  awaitingTurn = false;
  onAdvanceMonth: (() => void) | null = null;

  /** Draggable panels for the WindowManager (region mode). */
  get draggablePanels(): { id: string; element: HTMLElement; baseZ: number }[] {
    return [
      { id: 'region-rival', element: this.rivalPanel, baseZ: 20 },
      { id: 'region-province', element: this.provincePanel, baseZ: 20 },
    ];
  }

  destroyPanel(): void {
    this.ceremony.remove();
    this.convention.remove();
    this.centuryModal.remove();
    this.winModal.remove();
    this.eraModal.remove();
    this.epilogueModal.remove();
    this.rivalPanel.remove();
    this.provincePanel.remove();
  }

  /** Logical (CSS-pixel) view size. The backing store is scaled by the device
   *  pixel ratio (see `displayScale`); all layout/camera math stays logical. */
  private get viewW(): number {
    return this.canvas.width / displayScale();
  }

  private get viewH(): number {
    return this.canvas.height / displayScale();
  }

  /** measureText memo for the statehood banner — its strings change a few
   *  times per game-day, not per frame, and measureText is a layout-engine
   *  call. Keyed by font+text; cleared wholesale if it ever grows unbounded. */
  private textWidthCache = new Map<string, number>();

  private textW(s: string): number {
    const key = `${this.g.font}|${s}`;
    let w = this.textWidthCache.get(key);
    if (w === undefined) {
      if (this.textWidthCache.size > 256) this.textWidthCache.clear();
      w = this.g.measureText(s).width;
      this.textWidthCache.set(key, w);
    }
    return w;
  }

  /** The standard hex layout for the current view size, cached until resize. */
  private hexLayout(): { size: number; ox: number; oy: number } {
    if (!this.cachedHexLayout) {
      this.cachedHexLayout = hexLayoutParams(this.viewW, this.viewH, REGION_N, 60);
    }
    return this.cachedHexLayout;
  }

  private toPx(rx: number, ry: number): { px: number; py: number } {
    const { size, ox, oy } = this.hexLayout();
    const col = Math.max(0, Math.min(REGION_N - 1, Math.floor((rx / 100) * REGION_N)));
    const row = Math.max(0, Math.min(REGION_N - 1, Math.floor((ry / 100) * REGION_N)));
    const { x: px, y: py } = hexCenter(col, row, size, ox, oy);
    return { px, py };
  }

  /** Width of one hex in base/map units (constant across zoom). */
  private hexWidth(): number {
    const size = this.cachedHexLayout?.size
      ?? hexLayoutParams(this.viewW, this.viewH, REGION_N, 60).size;
    return Math.sqrt(3) * size;
  }

  /** Scale factor for per-settlement glyphs (sprites, labels, resource icons) so
   *  the smallest settlement footprint fills roughly one hex and larger tiers
   *  grow to span a few. The sprite art was authored ~16 base units wide for the
   *  shack tier (→ ~1 hex) up to ~36 for the castle (→ a couple of hexes), so a
   *  single factor keyed off hex width gives the "starts in one hex, grows into
   *  more" progression for free. Constant across zoom (hex and glyph share map
   *  space). */
  private glyphScale(): number {
    return this.hexWidth() / 16;
  }

  /** Run `body` with the canvas scaled around (px,py) by the glyph factor, so a
   *  block of fixed-base-unit drawing tracks hex size. */
  private withGlyphScale(px: number, py: number, body: () => void): void {
    const s = this.glyphScale();
    const g = this.g;
    g.save();
    g.translate(px, py);
    g.scale(s, s);
    g.translate(-px, -py);
    body();
    g.restore();
  }

  private getRoutePts(r: { path: { x: number; y: number }[] }): { px: number; py: number }[] {
    let pts = this.routePtsCache.get(r);
    if (!pts) {
      pts = r.path.map((cell) => {
        const c = this.region.map.cellToCoord(cell.x, cell.y);
        return this.toPx(c.rx, c.ry);
      });
      this.routePtsCache.set(r, pts);
    }
    return pts;
  }

  /** True if any part of the route's corridor can be on screen this frame.
   *  Settlements/scouts cull per point; routes are polylines, so cull on a
   *  cached bounding box — most routes are fully off-screen at close zoom. */
  private routeInView(r: { path: { x: number; y: number }[] }, margin: number): boolean {
    let bb = this.routeBBoxCache.get(r);
    if (!bb) {
      const pts = this.getRoutePts(r);
      let l = Infinity, t = Infinity, rt = -Infinity, b = -Infinity;
      for (const p of pts) {
        if (p.px < l) l = p.px;
        if (p.px > rt) rt = p.px;
        if (p.py < t) t = p.py;
        if (p.py > b) b = p.py;
      }
      bb = { l, t, r: rt, b };
      this.routeBBoxCache.set(r, bb);
    }
    const vb = this.vb;
    return bb.r >= vb.l - margin && bb.l <= vb.r + margin && bb.b >= vb.t - margin && bb.t <= vb.b + margin;
  }

  private setInnerHtml(el: HTMLElement, html: string, scrollSelectors: string[] = ['']): void {
    // Skip the rebuild entirely when the markup is byte-for-byte identical to
    // last time: innerHTML assignment forces a layout + paint even for equal
    // content, and panels rebuild on a timer far more often than they change.
    if (this.lastPanelHtml.get(el) === html) return;
    this.lastPanelHtml.set(el, html);
    const saved: { sel: string; top: number; left: number }[] = [];
    for (const sel of scrollSelectors) {
      const target = sel === '' ? el : el.querySelector<HTMLElement>(sel);
      if (target) saved.push({ sel, top: target.scrollTop, left: target.scrollLeft });
    }
    el.innerHTML = html;
    for (const { sel, top, left } of saved) {
      const target = sel === '' ? el : el.querySelector<HTMLElement>(sel);
      if (target) { target.scrollTop = top; target.scrollLeft = left; }
    }
  }

  /** Has the player explored or scouted the tile under this region coord
   *  (0..100)? Used to keep undiscovered rivals hidden under the fog. */
  private revealedAt(rx: number, ry: number): boolean {
    const emap = this.region.explorationMap;
    const E = emap.length;
    const ex = Math.min(E - 1, Math.max(0, Math.floor((rx / 100) * E)));
    const ey = Math.min(E - 1, Math.max(0, Math.floor((ry / 100) * E)));
    return emap[ex][ey] !== 'fogged';
  }

  click(px: number, py: number): void {
    // A click skips a running cinematic and consumes the event.
    if (this.cinematic) { this.skipCinematic(); return; }
    this.selectedId = null;
    this.selectedFactionId = null;
    // Convert the screen click into map-space (undo the camera) so hit-testing
    // matches the transformed sprites. Pick radius tracks hex size so it stays
    // ~one hex around the settlement now that sprites are hex-scaled.
    const mx = (px - this.camX) / this.camScale;
    const my = (py - this.camY) / this.camScale;
    const radius = Math.max(14, this.hexWidth());

    // Province view: clicking a settlement selects its province and opens the panel.
    if (this.provinceViewActive) {
      let hit = false;
      for (const t of this.region.settlements) {
        const p = this.toPx(t.x, t.y);
        if (Math.hypot(p.px - mx, p.py - my) < radius) {
          this.selectedProvinceId = t.id;
          hit = true;
          break;
        }
      }
      if (!hit) this.selectedProvinceId = null;
      return;
    }

    // Scout click — check before settlements so the scout sprite intercepts first.
    const { region } = this;
    const playerScouts = region.scouts.filter((s) => s.factionId === region.playerFactionId);
    for (const scout of playerScouts) {
      const sp = this.toPx(scout.x, scout.y);
      if (Math.hypot(sp.px - mx, sp.py - my) < 12) {
        // Toggle selection
        this.selectedScoutId = scout.id === this.selectedScoutId ? null : scout.id;
        return;
      }
    }
    // Place building: in placement mode, a map click breaks ground on the chosen
    // worked-ring hex (validated by buildCity).
    if (this.buildingPlacement !== null) {
      const W = this.viewW;
      const H = this.viewH;
      const { size, ox, oy } = hexLayoutParams(W, H, REGION_N, 60);
      const { col, row } = screenToHex(mx, my, size, ox, oy);
      if (col >= 0 && col < REGION_N && row >= 0 && row < REGION_N) {
        issue(this.region, 'buildCity', this.buildingPlacement.townId, this.buildingPlacement.defId, col * REGION_N + row);
      }
      this.cancelBuildingPlacement();
      this.refreshPanel();
      return;
    }
    // Zone district: in district-placement mode, a map click zones the chosen hex.
    if (this.districtPlacement !== null) {
      const W = this.viewW;
      const H = this.viewH;
      const { size, ox, oy } = hexLayoutParams(W, H, REGION_N, 60);
      const { col, row } = screenToHex(mx, my, size, ox, oy);
      if (col >= 0 && col < REGION_N && row >= 0 && row < REGION_N) {
        issue(this.region, 'placeDistrict', this.districtPlacement.townId, this.districtPlacement.defId, col * REGION_N + row);
      }
      this.cancelDistrictPlacement();
      this.refreshPanel();
      return;
    }
    // Click-to-found: in placement mode, a map click sites the new town's
    // expedition at the chosen hex (validated by foundTownAt).
    if (this.foundingFromId !== null) {
      const W = this.viewW;
      const H = this.viewH;
      const { size, ox, oy } = hexLayoutParams(W, H, REGION_N, 60);
      const { col, row } = screenToHex(mx, my, size, ox, oy);
      if (col >= 0 && col < REGION_N && row >= 0 && row < REGION_N) {
        issue(this.region, 'foundTownAt', this.foundingFromId, (col / REGION_N) * 100, (row / REGION_N) * 100);
      }
      this.cancelFoundingMode();
      this.refreshPanel();
      return;
    }
    // If a scout is selected, clicking the map sends it to that hex.
    if (this.selectedScoutId !== null) {
      const W = this.viewW;
      const H = this.viewH;
      const { size, ox, oy } = hexLayoutParams(W, H, REGION_N, 60);
      const { col: hc, row: hr } = screenToHex(mx, my, size, ox, oy);
      if (hc >= 0 && hc < REGION_N && hr >= 0 && hr < REGION_N) {
        const rx = (hc / REGION_N) * 100;
        const ry = (hr / REGION_N) * 100;
        issue(this.region, 'setScoutTarget', this.selectedScoutId, rx, ry);
      }
      this.selectedScoutId = null;
      return;
    }

    for (const t of this.region.settlements) {
      const p = this.toPx(t.x, t.y);
      if (Math.hypot(p.px - mx, p.py - my) < radius) {
        if (t.factionId === this.region.playerFactionId) {
          this.selectedId = t.id;
          this.townDrawer.open(this.region, t.id);
        } else {
          // Clicking a rival settlement opens the rival faction panel
          this.selectedFactionId = t.factionId;
        }
        return;
      }
    }

    // If in claim land mode and no settlement was clicked, try to claim the hex
    if (this.claimLandMode) {
      const W = this.viewW;
      const H = this.viewH;
      const { size, ox, oy } = hexLayoutParams(W, H, REGION_N, 60);
      const { col, row } = screenToHex(mx, my, size, ox, oy);
      if (col >= 0 && col < REGION_N && row >= 0 && row < REGION_N) {
        issue(this.region, 'claimCell', col, row);
      }
    }
  }

  // ---- Camera controls (wired from main.ts) ----
  /** Zoom toward a screen point (wheel or +/-). dir>0 zooms in. */
  zoomAt(screenX: number, screenY: number, dir: number): void {
    const factor = dir > 0 ? 1.15 : 1 / 1.15;
    const next = Math.max(RegionView.MIN_SCALE, Math.min(RegionView.MAX_SCALE, this.camScale * factor));
    if (next === this.camScale) return;
    // Keep the map point under the cursor fixed: solve for the new offset.
    const baseX = (screenX - this.camX) / this.camScale;
    const baseY = (screenY - this.camY) / this.camScale;
    this.camScale = next;
    this.camX = screenX - baseX * next;
    this.camY = screenY - baseY * next;
    this.clampCamera();
  }

  /** Toggle province view on/off (also clears the selected province). */
  toggleProvinceView(): void {
    this.provinceViewActive = !this.provinceViewActive;
    if (!this.provinceViewActive) this.selectedProvinceId = null;
  }

  // ---- U6: keyboard-shortcut entry points (bound from main.ts's keydown
  // handler, alongside T/P/B). Each wraps an existing toggle/flag so the key
  // map reuses the real panel machinery instead of inventing a new one. ----

  /** E key: toggle the Economy panel. */
  toggleEconomyPanel(): void {
    this.openScreen('economy');
  }


  /** B key etc.: open the Nation screen on a given tab. */
  openNation(tab: 'government' | 'budget' | 'politics' | 'military'): void {
    this.nationScreen.open(this.region, tab);
  }

  /** O key: the selected town's drawer. */
  toggleOverviewPanel(): void {
    if (this.townDrawer.isOpen) this.townDrawer.close();
    else if (this.selectedId !== null) this.townDrawer.open(this.region, this.selectedId);
  }

  /** ?/H keys: toggle the in-game help wiki (U3). */
  toggleWikiPanel(): void {
    this.wikiPanel.toggle();
  }

  /** C key / nav-strip button (U10): open the century graph standalone, any
   *  time — not just from the Century Report modal or Economy panel. Reuses
   *  centuryGraphHtml() verbatim; no new charting path. */
  openCenturyGraph(): void {
    const body = document.createElement('div');
    body.innerHTML = centuryGraphHtml(this.region.statsHistory) ||
      `<p class="insp-skills">No history yet — check back after the first in-game year.</p>`;
    const modal = new Modal({
      title: 'THE LONG VIEW',
      content: body,
      size: 'lg',
      actions: [{ label: 'Close', variant: 'primary', onClick: () => modal.close() }],
    });
    modal.show();
  }

  /** Pan by a screen-space delta (drag or arrow/WASD keys). */
  panBy(dx: number, dy: number): void {
    this.camX += dx;
    this.camY += dy;
    this.clampCamera();
  }

  /** Snap back to the full-region view. */
  resetView(): void {
    this.camScale = 1;
    this.camX = 0;
    this.camY = 0;
  }

  /** Pan to a logical coordinate (0..100), centering the viewport on it. */
  panTo(regionX: number, regionY: number): void {
    const W = this.viewW;
    const H = this.viewH;
    const p = this.toPx(regionX, regionY);
    this.camX = W / 2 - p.px * this.camScale;
    this.camY = H / 2 - p.py * this.camScale;
    this.clampCamera();
  }

  /** Center the viewport on a logical coordinate; optionally set zoom level. */
  centerOn(regionX: number, regionY: number, zoom?: number): void {
    const W = this.viewW;
    const H = this.viewH;
    if (zoom !== undefined) {
      this.camScale = Math.max(RegionView.MIN_SCALE, Math.min(RegionView.MAX_SCALE, zoom));
    }
    const p = this.toPx(regionX, regionY);
    this.camX = W / 2 - p.px * this.camScale;
    this.camY = H / 2 - p.py * this.camScale;
    this.clampCamera();
  }

  /** Update tooltip position and visibility based on mouse position. */
  updateTooltip(screenX: number, screenY: number): void {
    const mx = (screenX - this.camX) / this.camScale;
    const my = (screenY - this.camY) / this.camScale;
    const radius = Math.max(14, this.hexWidth());
    let hoveredId: number | null = null;

    for (const t of this.region.settlements) {
      const p = this.toPx(t.x, t.y);
      if (Math.hypot(p.px - mx, p.py - my) < radius) {
        hoveredId = t.id;
        break;
      }
    }

    if (hoveredId !== this.tooltipSettlementId) {
      this.tooltipSettlementId = hoveredId;
      if (hoveredId !== null) {
        const settlement = this.region.settlement(hoveredId);
        if (settlement) {
          const pop = Math.round(this.region.popOf(settlement));
          const happy = Math.round(settlement.satisfaction || 0);
          const food = settlement.food || 0;
          const foodStatus = food < pop * 5 ? '⚠ low' : 'ok';
          this.tooltip.innerHTML = `<b>${settlement.name}</b><br>` +
            `pop ${pop} · happy ${happy}% · food ${foodStatus}`;
          this.tooltip.classList.remove('hidden');
        }
      } else {
        this.tooltip.classList.add('hidden');
      }
    }

    if (hoveredId !== null) {
      // Position tooltip near cursor, avoiding edges
      let tx = screenX + 12;
      let ty = screenY + 12;
      const rect = this.tooltip.getBoundingClientRect();
      if (tx + rect.width > window.innerWidth) tx = screenX - rect.width - 12;
      if (ty + rect.height > window.innerHeight) ty = screenY - rect.height - 12;
      this.tooltip.style.left = tx + 'px';
      this.tooltip.style.top = ty + 'px';
    }
  }

  /** Hide the hover tooltip (e.g. when the cursor leaves the canvas). */
  hideTooltip(): void {
    this.tooltipSettlementId = null;
    this.tooltip.classList.add('hidden');
  }

  /** Keep the scaled map from drifting off-screen; at scale 1 it stays pinned. */
  private clampCamera(): void {
    const W = this.viewW;
    const H = this.viewH;
    const minX = W - W * this.camScale; // most-negative offset (right edge held)
    const minY = H - H * this.camScale;
    this.camX = Math.min(0, Math.max(minX, this.camX));
    this.camY = Math.min(0, Math.max(minY, this.camY));
  }

  draw(): void {
    // Advance the animation clock by wall-clock time in 60fps frame units,
    // clamped so a stall (tab switch, breakpoint) can't lurch the animations.
    // The floor keeps `frame` strictly increasing for per-draw memo keys.
    const nowMs = performance.now();
    const dtMs = this.lastDrawMs === 0 ? 1000 / 60 : nowMs - this.lastDrawMs;
    this.lastDrawMs = nowMs;
    this.frame += Math.min(6, Math.max(0.01, dtMs / (1000 / 60)));
    const { g, region } = this;
    const dpr = displayScale();
    const W = this.viewW;
    const H = this.viewH;

    // Detect canvas resize: clear position caches that depend on canvas dimensions.
    if (W !== this.prevCanvasW || H !== this.prevCanvasH) {
      this.prevCanvasW = W;
      this.prevCanvasH = H;
      this.cachedHexLayout = null;
      this.routePtsCache = new WeakMap();
      this.routeBBoxCache = new WeakMap();
    }

    // Base transform maps logical (CSS px) coords onto the HiDPI backing store.
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#10141c';
    g.fillRect(0, 0, W, H);
    // Parallax atmosphere fills the void the terrain cache leaves behind (map
    // margins + the whole frame when zoomed out). Screen-space, behind the map,
    // tinted by era/season/branch/weather/tension — a pure read of sim state.
    this.drawBackdrop(W, H);
    // Everything from the terrain to the expedition wagons is map-space: apply
    // the camera (zoom + pan) once here so individual draws stay in base coords.
    g.save();
    g.translate(this.camX, this.camY);
    g.scale(this.camScale, this.camScale);
    // Visible base-coord rect, for culling off-screen sprites this frame.
    this.vb = {
      l: -this.camX / this.camScale,
      t: -this.camY / this.camScale,
      r: (W - this.camX) / this.camScale,
      b: (H - this.camY) / this.camScale,
    };
    // Terrain + territory (the O(N²) layers) come from the static cache as one blit.
    this.drawMapTiles(g, W, H);
    this.drawBorderPulses(g, W, H);
    this.drawCapitalFlags(g, W, H);
    // (Memory-fog layer deleted 2026-07: fog of war is retired, so the old
    // per-frame full-screen blit composited only transparent pixels.)

    // Placed districts zone the worked ring underneath; then buildings, then overlays.
    this.drawPlacedDistricts();
    // Placed buildings dot the worked ring; placement highlights when arming a build.
    this.drawPlacedBuildings();
    this.drawFoundingOverlay();
    this.drawBuildingPlacementOverlay();
    this.drawDistrictPlacementOverlay();

    // Routes along their actual corridors (M6b/6c): dotted trails, solid
    // roads, cross-tied rail; line brightness is the route's condition.
    const ss = region.settlements;
    for (const r of region.routes) {
      if (!this.routeInView(r, 48)) continue;
      const alpha = 0.2 + 0.6 * (r.condition / 100);
      if (r.sea) {
        // A sea lane: a dashed teal wake across the water, with a small hull
        // tracing it — the maritime counterpart of the dotted land trail.
        this.drawSeaLane(r, alpha);
        continue;
      }
      if (r.kind === 'trail') {
        g.fillStyle = `rgba(220,210,170,${alpha})`;
        for (let i = 0; i < r.path.length; i += 2) {
          const c = region.map.cellToCoord(r.path[i].x, r.path[i].y);
          const p = this.toPx(c.rx, c.ry);
          g.fillRect(Math.round(p.px) - 1, Math.round(p.py) - 1, 2, 2);
        }
      } else {
        const pts = this.getRoutePts(r);
        g.strokeStyle = r.kind === 'rail' ? `rgba(150,156,168,${alpha})`
          : r.kind === 'highway' ? `rgba(62,66,74,${Math.min(1, alpha + 0.2)})`
          : r.kind === 'maglev' ? `rgba(110,200,214,${alpha})`
          : `rgba(216,180,106,${alpha})`;
        g.lineWidth = r.kind === 'rail' || r.kind === 'maglev' ? 3 : r.kind === 'highway' ? 4 : 2;
        g.beginPath();
        for (let i = 0; i < pts.length; i++) {
          if (i === 0) g.moveTo(pts[i].px, pts[i].py);
          else g.lineTo(pts[i].px, pts[i].py);
        }
        g.stroke();
        if (r.kind === 'highway') {
          // the dashed centerline is what makes asphalt read as asphalt
          g.fillStyle = `rgba(232,226,200,${alpha})`;
          for (let i = 0; i < pts.length; i += 2) {
            g.fillRect(Math.round(pts[i].px) - 1, Math.round(pts[i].py), 2, 1);
          }
          this.drawTruck(pts, r.condition);
        }
        if (r.kind === 'rail') {
          // cross-ties: short perpendicular ticks so steel reads as track
          g.strokeStyle = `rgba(40,36,32,${alpha})`;
          g.lineWidth = 1;
          for (let i = 1; i < pts.length - 1; i += 2) {
            const dx = pts[i + 1].px - pts[i - 1].px;
            const dy = pts[i + 1].py - pts[i - 1].py;
            const len = Math.hypot(dx, dy) || 1;
            const nx = (-dy / len) * 3;
            const ny = (dx / len) * 3;
            g.beginPath();
            g.moveTo(pts[i].px - nx, pts[i].py - ny);
            g.lineTo(pts[i].px + nx, pts[i].py + ny);
            g.stroke();
          }
          this.drawTrain(pts, r.condition);
        }
        if (r.kind === 'maglev') {
          // pylon dots beneath the line: the guideway floats above the land
          g.fillStyle = `rgba(70,120,130,${alpha})`;
          for (let i = 0; i < pts.length; i += 3) {
            g.fillRect(Math.round(pts[i].px) - 1, Math.round(pts[i].py) + 2, 2, 3);
          }
          this.drawPod(pts, r.condition);
        }
      }
    }

    // Phase 6: Cargo flow indicators — a small colored dot at each route midpoint
    for (const r of region.routes) {
      if (!r.cargoType || r.kind === 'trail' || r.path.length < 2) continue;
      const mid = r.path[Math.floor(r.path.length / 2)];
      const mc = region.map.cellToCoord(mid.x, mid.y);
      const mp = this.toPx(mc.rx, mc.ry);
      if (!this.inView(mp.px, mp.py, 8)) continue;
      const rgb = CARGO_RGB[r.cargoType];
      if (!rgb) continue;
      g.fillStyle = `rgba(${rgb},0.85)`;
      g.fillRect(Math.round(mp.px) - 3, Math.round(mp.py) - 3, 6, 6);
      g.fillStyle = `rgba(10,10,10,0.7)`;
      g.fillRect(Math.round(mp.px) - 2, Math.round(mp.py) - 2, 4, 4);
      g.fillStyle = `rgba(${rgb},1)`;
      g.fillRect(Math.round(mp.px) - 1, Math.round(mp.py) - 1, 2, 2);
    }

    // Phase 0: trade-flow direction arrows along busy corridors.
    this.drawTradeFlows();

    // Towns on the rail network get a depot by the tracks — precompute the set
    // once (was an O(routes) scan per settlement → O(towns×routes)).
    const railSet = new Set<number>();
    for (const r of region.routes) if (r.kind === 'rail') { railSet.add(r.a); railSet.add(r.b); }
    // Settlements — tiered sprites: shack → cottage → house → town → manor → castle
    for (const t of ss) {
      const { px, py } = this.toPx(t.x, t.y);
      if (!this.inView(px, py, 80)) continue; // off-screen: skip sprite + labels + icons
      const pop = Math.round(region.popOf(t));
      const onRail = railSet.has(t.id);
      // The whole settlement glyph — sprite, depot, labels, raid marker — is
      // scaled around its hex centre so it reads as ~1 hex when small and grows
      // into a couple of hexes as the town does (see glyphScale()).
      this.withGlyphScale(px, py, () => {
        if (onRail) {
          const sx = px + 22;
          g.fillStyle = '#7a3b2e';
          g.fillRect(sx, py - 4, 10, 10);
          g.fillStyle = '#3a2e26';
          g.fillRect(sx - 1, py - 7, 12, 4);
          g.fillStyle = '#969ca8';
          g.fillRect(sx - 2, py + 7, 14, 2);
          g.fillStyle = '#e8d27a';
          g.fillRect(sx + 4, py - 1, 2, 2);
        }
        this.drawTownTier(px, py, pop, this.selectedId === t.id);
        this.drawCityBanner(px, py + 20, t.name, pop, this.selectedId === t.id);
        if (region.day - t.lastRaidDay < 5) {
          g.fillStyle = '#e04444';
          g.font = '10px monospace';
          g.textAlign = 'center';
          g.fillText('⚔', px + 22, py - 6);
          g.textAlign = 'left';
        }
      });
    }

    // Phase 0: per-settlement food/wood/goods status icons.
    this.drawResourceIndicators();

    // AI faction settlements: diamond markers with vassal badge and selection ring.
    for (const faction of region.regionalFactions) {
      if (faction.id === region.playerFactionId) continue;
      const color = faction.color ?? '#aaa';
      const isVassal = faction.overlordId === region.playerFactionId;
      for (const settlementId of faction.settlementIds) {
        const s = region.settlement(settlementId);
        if (!s) continue;
        if (!this.revealedAt(s.x, s.y)) continue; // hidden until discovered
        if (!this.region.isVisibleToFaction(Math.round(s.x), Math.round(s.y), region.playerFactionId)) continue;
        const { px, py } = this.toPx(s.x, s.y);
        if (!this.inView(px, py, 40)) continue;
        const selected = this.selectedFactionId === faction.id;
        this.withGlyphScale(px, py, () => {
          // Ground shadow so the marker sits on the terrain.
          this.groundShadow(px, py + 9, 8);
          // Selection halo
          if (selected) {
            g.strokeStyle = '#fff';
            g.lineWidth = 2;
            g.beginPath();
            g.arc(px, py, 14, 0, Math.PI * 2);
            g.stroke();
          }
          // Diamond marker (slightly larger: 9px for clickability)
          g.fillStyle = isVassal ? '#8fc26a' : color;
          g.beginPath();
          g.moveTo(px, py - 9);
          g.lineTo(px + 7, py);
          g.lineTo(px, py + 9);
          g.lineTo(px - 7, py);
          g.closePath();
          g.fill();
          g.strokeStyle = 'rgba(0,0,0,0.6)';
          g.lineWidth = 1;
          g.stroke();
          if (isVassal) {
            g.fillStyle = '#fff';
            g.font = 'bold 8px monospace';
            g.textAlign = 'center';
            g.fillText('V', px, py + 3);
          }
          g.fillStyle = '#ddd';
          g.font = '9px monospace';
          g.textAlign = 'center';
          g.fillText(faction.name.slice(0, 3), px, py + 21);
        });
      }
    }

    // Scouts: clickable character sprites — player scouts have name + auto-explore indicator
    for (const scout of region.scouts) {
      const faction = region.faction(scout.factionId);
      if (!faction) continue;
      if (faction.id !== region.playerFactionId && !this.region.isVisibleToFaction(Math.round(scout.x), Math.round(scout.y), region.playerFactionId)) continue;
      const { px, py } = this.toPx(scout.x, scout.y);
      if (!this.inView(px, py, 24)) continue;
      const bob = Math.floor(this.frame / 25) % 2;
      const isPlayer = faction.id === region.playerFactionId;
      const isSelected = isPlayer && scout.id === this.selectedScoutId;
      const color = faction.color ?? (isPlayer ? '#6af' : '#aaa');

      // Ground shadow stays put while the sprite bobs above it.
      this.groundShadow(px, py + 6, 5);
      if (isSelected) {
        g.strokeStyle = 'rgba(255,255,255,0.9)';
        g.lineWidth = 1.5;
        g.setLineDash([3, 2]);
        g.beginPath(); g.arc(px, py - bob, 11, 0, Math.PI * 2); g.stroke();
        g.setLineDash([]);
      }
      // Body
      g.globalAlpha = isPlayer ? 0.95 : 0.65;
      g.fillStyle = color;
      g.beginPath(); g.arc(px, py + 2 - bob, 4, 0, Math.PI * 2); g.fill();
      // Head
      g.fillStyle = isPlayer ? '#f5deb3' : color;
      g.beginPath(); g.arc(px, py - 4 - bob, 3, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;

      if (isPlayer) {
        const scoutName = (scout as Scout & { name?: string }).name ?? 'Scout';
        g.fillStyle = '#e8f0ff';
        g.font = 'bold 9px monospace';
        g.textAlign = 'center';
        g.fillText(scoutName, px, py - 10 - bob);
        // Auto-explore indicator
        const isAuto = (scout as Scout & { autoExplore?: boolean }).autoExplore !== false;
        if (isAuto) {
          g.fillStyle = '#4af';
          g.font = '9px monospace';
          g.fillText('⟳', px + 9, py - 3 - bob);
        }
        // Target line if manual target set
        const mt = scout as Scout & { manualTargetX?: number; manualTargetY?: number };
        if (mt.manualTargetX !== undefined && mt.manualTargetY !== undefined) {
          const tp = this.toPx(mt.manualTargetX, mt.manualTargetY);
          g.strokeStyle = 'rgba(255,200,100,0.45)';
          g.lineWidth = 1;
          g.setLineDash([4, 3]);
          g.beginPath(); g.moveTo(px, py - bob); g.lineTo(tp.px, tp.py); g.stroke();
          g.setLineDash([]);
          g.fillStyle = 'rgba(255,200,100,0.8)';
          g.beginPath(); g.arc(tp.px, tp.py, 3, 0, Math.PI * 2); g.fill();
        }
      }
    }
    g.textAlign = 'left';

    // Expeditions: a wagon dot crawling to its site
    for (const e of region.expeditions) {
      // Non-player expeditions are hidden in memory fog (same guard as scouts)
      const fromS = region.settlement(e.fromId);
      if (fromS && fromS.factionId !== region.playerFactionId) {
        if (!this.region.isVisibleToFaction(Math.round(e.x), Math.round(e.y), region.playerFactionId)) continue;
      }
      const { px, py } = this.toPx(e.x, e.y);
      const target = this.toPx(e.targetX, e.targetY);
      if (!this.inView(px, py, 48) && !this.inView(target.px, target.py, 48)) continue;
      g.fillStyle = 'rgba(220,210,170,0.25)';
      g.fillRect(target.px - 4, target.py - 4, 8, 8);
      const bob = Math.floor(this.frame / 15) % 2;
      this.groundShadow(px, py + 4, 5); // wagon sits on the ground line
      g.fillStyle = '#c2a14d';
      g.fillRect(px - 4, py - 3 - bob, 8, 6);
      g.fillStyle = '#1a1410';
      g.fillRect(px - 4, py + 3 - bob, 2, 2);
      g.fillRect(px + 2, py + 3 - bob, 2, 2);
      g.fillStyle = '#dfe6ee';
      g.font = '11px monospace';
      g.textAlign = 'center';
      g.fillText(`→ ${e.name}`, px, py - 8);
    }
    g.textAlign = 'left';

    // Animated water shimmer (per-frame overlay, static map cache can't animate)
    this.drawWaterAnimation();

    // City lights pop on the map as dusk falls (still in map-space).
    const lit = this.atmosphere();

    // Province overlay: labels + stat bars + selection ring (Province View mode).
    if (this.provinceViewActive) this.drawProvinceOverlay();

    g.restore(); // end map-space; HUD below draws in screen space

    // Draw the minimap in the corner, showing camera frame.
    this.minimap.draw(this.camX, this.camY, this.camScale, W, H);

    // Seasonal wash + vignette (no night tint — day/night cycle disabled).
    this.drawAtmosphere(W, H, lit);

    // Scout info panel — shown in screen-space when a player scout is selected.
    if (this.selectedScoutId !== null) {
      const selScout = region.scouts.find((s) => s.id === this.selectedScoutId);
      if (selScout && selScout.factionId === region.playerFactionId) {
        this.drawScoutPanel(selScout as Scout & { name?: string; autoExplore?: boolean; manualTargetX?: number; manualTargetY?: number }, W, H);
      } else {
        this.selectedScoutId = null;
      }
    }

    this.drawRivalBanners(W, H);
    this.updateTopBar();
    this.updateEventLog();
    this.drawRivalPanel();
    this.drawProvincePanel();
    this.drawCeremony();
    this.drawConvention();
    this.drawCenturyReport();
    this.drawEraModal();
    this.drawWinModal();
    this.drawEpilogueModal();
    // Cinematics paint last, fullscreen, above every panel and modal.
    this.updateCinematicTriggers();
    this.drawCinematic(W, H);
  }

  /** Detect the first frame an era fork or victory lands and queue its
   *  cinematic. Latches are view-only so each plays at most once per session. */
  private updateCinematicTriggers(): void {
    if (this.cinematic) return;
    const branch = this.region.eraBranch;
    if (branch && !this.playedEraCinematic) {
      this.playedEraCinematic = true;
      this.cinematic = { kind: 'era', variant: branch, startFrame: this.frame };
      return;
    }
    const wc = this.region.winCondition;
    if (wc && !this.playedWinCinematic) {
      this.playedWinCinematic = true;
      this.cinematic = { kind: 'win', variant: wc.path, startFrame: this.frame };
    }
  }

  /** True while a cinematic is playing — used to hold back the DOM reveal and
   *  to let a click skip the animation. */
  isCinematicPlaying(): boolean {
    return this.cinematic !== null;
  }

  /** Skip the running cinematic (click / key). */
  skipCinematic(): void {
    this.cinematic = null;
  }

  /** How many frames a cinematic runs before the DOM modal takes over (~4s). */
  private static readonly CINEMATIC_FRAMES = 240;

  /** Cheap fingerprint of everything the cached terrain+territory layer depends
   *  on. Terrain is fixed after worldgen; territory shifts only when a settlement
   *  is founded/taken/relocated — so hash size + each town's id/owner/position. */
  private mapCacheSignature(): string {
    const r = this.region;
    let s = `${this.viewW}x${this.viewH}|${r.regionalFactions.length}`;
    for (const t of r.settlements) s += `;${t.id},${t.factionId},${Math.round(t.x)},${Math.round(t.y)}`;
    // Fog-of-war frontier: use the pre-tracked counter instead of scanning 10 000 tiles.
    s += `|fog${r.exploredCount}`;
    // Ghost waterline: rebuild when the sea-rise warning fires OR the year-2030
    // fallback in drawTerrain flips (a cool/landlocked run can reach 2030 with
    // seaRiseAnnounced still false — the overlay must not wait for an unrelated
    // rebuild to appear).
    s += `|rise${r.seaRiseAnnounced || r.year >= 2030 ? 1 : 0}`;
    // Override art registers asynchronously (Image.onload); ONLY terrain tiles
    // bake into this cache, so key on the terrain-slot registration version —
    // town/backdrop arrivals must not trigger 16k-hex rebuilds, and an in-place
    // slot replacement (regenerated art) must.
    s += `|a${this.assets.version('terrain-')}`;
    s += `|tv${r.territoryVersion}|h${this.historyView ? this.historyView.idx : -1}`;
    return s;
  }

  /** Centuria 2.0 tiled map cache: the world is cut into TILE_BASE-px tiles in
   *  base coords, each rendered (culled to its own hexes) at a detail level
   *  matched to the zoom, so the 256² world stays crisp close up and cheap far
   *  out. A signature change drops every tile; at most TILE_BUILDS_PER_FRAME new
   *  tiles are painted per frame, drawing a coarser cached tile meanwhile. */
  private static readonly TILE_BASE = 256;
  private static readonly TILE_BUILDS_PER_FRAME = 3;
  private static readonly TILE_CACHE_MAX = 64;
  private tiles = new Map<string, HTMLCanvasElement>();
  private tileSig = '';
  private lastTerritoryVersionSeen = -1;

  private drawMapTiles(g: CanvasRenderingContext2D, W: number, H: number): void {
    const sig = this.mapCacheSignature();
    if (sig !== this.tileSig) {
      this.tiles.clear();
      this.tileSig = sig;
    }
    if (this.region.territoryVersion !== this.lastTerritoryVersionSeen && !this.historyView) {
      this.lastTerritoryVersionSeen = this.region.territoryVersion;
      this.noteBorderChanges(this.region.computeTerritoryGrid().grid);
    }
    const T = RegionView.TILE_BASE;
    const want = Math.max(0, Math.min(3, Math.ceil(Math.log2(Math.max(1, this.camScale * displayScale())))));
    const vb = this.vb;
    const tx0 = Math.max(0, Math.floor(vb.l / T)), tx1 = Math.min(Math.ceil(W / T) - 1, Math.floor(vb.r / T));
    const ty0 = Math.max(0, Math.floor(vb.t / T)), ty1 = Math.min(Math.ceil(H / T) - 1, Math.floor(vb.b / T));
    let built = 0;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        let tile = this.tiles.get(`${want}:${tx}:${ty}`);
        if (!tile && built < RegionView.TILE_BUILDS_PER_FRAME) {
          tile = this.buildTile(tx, ty, want, W, H);
          built++;
        }
        for (let lod = want - 1; !tile && lod >= 0; lod--) tile = this.tiles.get(`${lod}:${tx}:${ty}`);
        if (!tile && built < RegionView.TILE_BUILDS_PER_FRAME + 2) { tile = this.buildTile(tx, ty, 0, W, H); built++; }
        if (tile) g.drawImage(tile, tx * T, ty * T, T, T);
      }
    }
  }

  private flagImages = new Map<string, HTMLImageElement>();

  /** Great-power and faction capitals fly their flag at a constant screen size,
   *  so the world map reads as nations when zoomed out. */
  private drawCapitalFlags(g: CanvasRenderingContext2D, W: number, H: number): void {
    const { size, ox, oy } = hexLayoutParams(W, H, REGION_N, 60);
    const px = 1 / this.camScale;
    const fw = 30 * px, fh = 20 * px;
    for (const f of this.region.regionalFactions) {
      if (f.id === this.region.playerFactionId || !f.identity) continue;
      const cap = this.region.settlement(f.capital);
      if (!cap) continue;
      const cell = this.region.map.coordToCell(cap.x, cap.y);
      const { x: cx, y: cy } = hexCenter(cell.x, cell.y, size, ox, oy);
      if (!this.inView(cx, cy, fw * 2)) continue;
      const key = JSON.stringify(f.identity.flag);
      let img = this.flagImages.get(key);
      if (!img) {
        img = new Image();
        img.src = flagDataUrl(f.identity.flag, 60, 40);
        this.flagImages.set(key, img);
      }
      if (!img.complete) continue;
      const x = cx - fw / 2, y = cy - size - fh - 6 * px;
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(x - px, y - px, fw + 2 * px, fh + 2 * px);
      g.drawImage(img, x, y, fw, fh);
      g.fillStyle = 'rgba(40,30,20,0.9)';
      g.fillRect(cx - px, y + fh, 2 * px, size + 6 * px);
      if (this.camScale < 4) {
        g.font = `${11 * px}px Georgia, serif`;
        g.textAlign = 'center';
        g.lineWidth = 3 * px;
        g.strokeStyle = 'rgba(0,0,0,0.75)';
        g.strokeText(f.name, cx, y - 4 * px);
        g.fillStyle = '#f2e9d4';
        g.fillText(f.name, cx, y - 4 * px);
        g.textAlign = 'left';
      }
    }
  }

  private buildTile(tx: number, ty: number, lod: number, W: number, H: number): HTMLCanvasElement {
    const T = RegionView.TILE_BASE;
    const s = 2 ** lod;
    const c = document.createElement('canvas');
    c.width = c.height = T * s;
    const cg = c.getContext('2d')!;
    cg.setTransform(s, 0, 0, s, -tx * T * s, -ty * T * s);
    this.cull = { l: tx * T, t: ty * T, r: (tx + 1) * T, b: (ty + 1) * T };
    try {
      this.drawTerrain(cg, W, H);
      this.drawTerritories(cg, W, H);
    } finally {
      this.cull = null;
    }
    if (this.tiles.size >= RegionView.TILE_CACHE_MAX) {
      const oldest = this.tiles.keys().next().value;
      if (oldest !== undefined) this.tiles.delete(oldest);
    }
    this.tiles.set(`${lod}:${tx}:${ty}`, c);
    return c;
  }

  /** Composite + blit the parallax atmosphere behind the map. Palette is rebuilt
   *  each frame (cheap, pure) but the gradient canvas only re-paints when the
   *  era/season/branch/weather/tension key changes. */
  private drawBackdrop(W: number, H: number): void {
    const r = this.region;
    const pal = buildBackdropPalette({
      year: r.year,
      seasonIndex: r.seasonIndex,
      branch: r.eraBranch as Branch,
      sky: r.weather.forDay(r.day).sky as Sky,
      tension: r.tensionScalar(),
    });
    this.backdrop.draw(this.g, W, H, pal, this.camX, this.camY, this.assets);
  }

  /** Lighting state for atmospheric rendering. Day/night cycle disabled — always daytime. */
  private atmosphere(): { night: number; golden: number; season: number } {
    return { night: 0, golden: 0, season: this.region.seasonIndex };
  }

  /** Return cached province list; recomputed at most once per frame. */
  private getCachedProvinces(): Province[] {
    if (this._provincesCacheFrame !== this.frame) {
      this._provincesCache = this.region.computeProvinces();
      this._provincesCacheFrame = this.frame;
    }
    return this._provincesCache;
  }

  /** Province overlay: rendered on top of city lights (still in map-space).
   *  Draws province name labels, compact stat bars, and a selection ring. */
  private drawProvinceOverlay(): void {
    const { g, region } = this;
    const provinces = this.getCachedProvinces();
    for (const prov of provinces) {
      const faction = region.faction(prov.factionId);
      const color = faction?.color ?? '#aaa';
      const { r: cr, g: cg, b: cb } = hexToRgb(color);
      const { px, py } = this.toPx(prov.centroidX, prov.centroidY);

      // Skip if off-screen
      if (!this.inView(px, py, 80)) continue;

      // Selection ring
      if (this.selectedProvinceId === prov.id) {
        g.strokeStyle = `rgba(${cr},${cg},${cb},0.9)`;
        g.lineWidth = 2.5;
        g.setLineDash([6, 3]);
        g.beginPath();
        g.arc(px, py, 30, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }

      // Province name label (shifted above the settlement sprite)
      const labelY = py - 46;
      g.font = 'bold 11px monospace';
      g.textAlign = 'center';
      // Dark shadow for contrast over terrain
      g.fillStyle = 'rgba(0,0,0,0.75)';
      g.fillText(prov.name, px + 1, labelY + 1);
      g.fillStyle = `rgba(${cr},${cg},${cb},1)`;
      g.fillText(prov.name, px, labelY);

      // Compact stat bar: [pop] [gdp] [sat] under the name
      const statY = labelY + 12;
      const barW = 36;
      const barH = 4;
      const gap = 3;
      const startX = px - (barW * 3 + gap * 2) / 2;

      // Population bar (gold) — capped at 2000 for display
      const popFrac = Math.min(1, prov.totalPop / 2000);
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(startX, statY, barW, barH);
      g.fillStyle = '#c2a14d';
      g.fillRect(startX, statY, Math.round(barW * popFrac), barH);

      // GDP bar (green) — capped at 500
      const gdpFrac = Math.min(1, prov.gdpContribution / 500);
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(startX + barW + gap, statY, barW, barH);
      g.fillStyle = '#6ec26a';
      g.fillRect(startX + barW + gap, statY, Math.round(barW * gdpFrac), barH);

      // Satisfaction bar (blue) — 0..100
      const satFrac = Math.min(1, Math.max(0, prov.satisfaction / 100));
      const satColor = prov.satisfaction >= 70 ? '#7ab4d4' : prov.satisfaction >= 40 ? '#c2a14d' : '#c26a6a';
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(startX + (barW + gap) * 2, statY, barW, barH);
      g.fillStyle = satColor;
      g.fillRect(startX + (barW + gap) * 2, statY, Math.round(barW * satFrac), barH);

      // Tiny legend labels below the bars
      g.font = '8px monospace';
      g.fillStyle = 'rgba(200,200,200,0.75)';
      g.fillText(`${prov.totalPop}`, startX + barW / 2, statY + barH + 8);
      g.fillText(`£${prov.gdpContribution}`, startX + barW + gap + barW / 2, statY + barH + 8);
      g.fillText(`${prov.satisfaction}%`, startX + (barW + gap) * 2 + barW / 2, statY + barH + 8);

      // Province policy indicator (player provinces with non-default tax)
      const polObj = region.provincePolicies[prov.id];
      if (polObj && prov.factionId === region.playerFactionId) {
        if (polObj.taxMultiplier !== 1.0) {
          g.font = '8px monospace';
          g.fillStyle = polObj.taxMultiplier > 1 ? '#c2a14d' : '#7ab4d4';
          g.textAlign = 'center';
          g.fillText(`tax×${polObj.taxMultiplier.toFixed(1)}`, px, statY + barH + 18);
        }
      }
    }
    g.textAlign = 'left';

    // Phase 7: draw provincial armies as shields on the map
    this.drawProvincialArmies();
  }

  /** Draw provincial army markers over province centroids. */
  private drawProvincialArmies(): void {
    const { g, region } = this;
    const armyGroups = new Map<number, { player: number; rival: number }>();
    for (const army of region.provincialArmies) {
      const key = army.provinceId;
      const slot = armyGroups.get(key) ?? { player: 0, rival: 0 };
      const count = army.units.reduce((s, u) => s + u.count, 0);
      if (army.ownerId === 0) slot.player += count;
      else slot.rival += count;
      armyGroups.set(key, slot);
    }
    const pawns = (this.pawns ??= buildPawnSprites());
    for (const [provId, counts] of armyGroups) {
      const s = region.settlement(provId);
      if (!s) continue;
      const { px, py } = this.toPx(s.x, s.y);
      if (!this.inView(px, py, 48)) continue;
      // Player armies: a squad of soldiers to the left; rival raiders to the right.
      if (counts.player > 0) {
        const frames = pawns.settlerArmed[provId % pawns.settlerArmed.length];
        this.drawSquad(px - 24, py - 12, counts.player, frames, '#7fb2ff');
      }
      if (counts.rival > 0) {
        this.drawSquad(px + 24, py - 12, counts.rival, pawns.raider, '#ff8a7a');
      }
    }
    g.textAlign = 'left';
  }

  /** Draw an army as a little animated formation of pawn sprites plus a strength
   *  chip, instead of a bare `⚔N` glyph. 1–3 figures scale with the count; the
   *  2-frame walk cycle ties to the global frame counter (so they shuffle in
   *  place). `frames` is a unit's [stand, step] sprite pair. */
  /** Soft elliptical ground shadow under a map token, mirroring the settlement
   *  shadow in drawTownTier — grounds scouts, wagons, armies and rival markers on
   *  the terrain instead of floating them. Screen-space; drawn under the token. */
  private groundShadow(px: number, py: number, rx: number, ry = rx * 0.42): void {
    const g = this.g;
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath();
    g.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  }

  private drawSquad(cx: number, cy: number, count: number, frames: HTMLCanvasElement[], color: string): void {
    if (frames.length === 0) return;
    const g = this.g;
    const n = count >= 6 ? 3 : count >= 3 ? 2 : 1;
    const fi = Math.floor(this.frame / 12) % frames.length;
    const sprite = frames[fi];
    const SP = 24; // on-map size of each 32×32 figure
    const prevSmoothing = g.imageSmoothingEnabled;
    g.imageSmoothingEnabled = false;
    // Ground shadow under the whole squad footprint.
    this.groundShadow(cx, cy, 9 + (n - 1) * 4);
    // Back-to-front so nearer figures overlap the farther ones.
    for (let i = n - 1; i >= 0; i--) {
      const dx = (i - (n - 1) / 2) * 8;
      const dy = -(i % 2) * 3; // alternate depth row
      g.drawImage(sprite, Math.round(cx + dx - SP / 2), Math.round(cy + dy - SP), SP, SP);
    }
    g.imageSmoothingEnabled = prevSmoothing;
    // Strength chip below the squad.
    const label = String(count);
    g.font = 'bold 10px ui-monospace, monospace';
    g.textAlign = 'center';
    const w = Math.ceil(g.measureText(label).width) + 8;
    g.fillStyle = 'rgba(18,16,14,0.82)';
    g.fillRect(cx - w / 2, cy + 1, w, 12);
    g.fillStyle = color;
    g.fillRect(cx - w / 2, cy + 1, w, 1); // top accent line
    g.fillText(label, cx, cy + 10);
    g.textAlign = 'left';
  }

  /** Enter (or cancel) click-to-found placement mode for a source town. On enter,
   *  precompute every valid target cell within reach so the highlight overlay is
   *  a cheap set lookup, not 16k validations per frame. */
  private toggleFoundingMode(fromId: number): void {
    if (this.foundingFromId === fromId) { this.cancelFoundingMode(); return; }
    this.foundingFromId = fromId;
    this.claimLandMode = false; // mutually exclusive map modes
    const r = this.region;
    const t = r.settlement(fromId);
    const valid = new Set<number>();
    if (t) {
      const N = REGION_N;
      const fromCell = r.map.coordToCell(t.x, t.y);
      const range = Math.round(N * 0.28);
      const lo = (v: number) => Math.max(0, v - range), hi = (v: number) => Math.min(N - 1, v + range);
      for (let col = lo(fromCell.x); col <= hi(fromCell.x); col++) {
        for (let row = lo(fromCell.y); row <= hi(fromCell.y); row++) {
          const rx = (col / N) * 100, ry = (row / N) * 100;
          if (r.canFoundAt(fromId, rx, ry).ok) valid.add(col * N + row);
        }
      }
    }
    this.foundingValidCells = valid;
  }

  private cancelFoundingMode(): void {
    this.foundingFromId = null;
    this.foundingValidCells = null;
  }

  /** Per-frame highlight of valid founding sites (map-space, under the camera).
   *  A soft pulsing green hex on each reachable, legal site. */
  private drawFoundingOverlay(): void {
    const cells = this.foundingValidCells;
    if (this.foundingFromId === null || !cells || cells.size === 0) return;
    const g = this.g;
    const N = REGION_N;
    const { size, ox, oy } = this.hexLayout();
    const pulse = 0.18 + 0.12 * Math.abs(Math.sin(this.frame / 18));
    g.lineWidth = 1.5;
    for (const key of cells) {
      const col = Math.floor(key / N), row = key % N;
      const { x: cx, y: cy } = hexCenter(col, row, size, ox, oy);
      if (cx < this.vb.l - size || cx > this.vb.r + size || cy < this.vb.t - size || cy > this.vb.b + size) continue;
      const corners = hexCorners(cx, cy, size);
      g.fillStyle = `rgba(120,210,110,${pulse.toFixed(3)})`;
      fillHexPath(g, corners);
      g.strokeStyle = 'rgba(150,230,140,0.7)';
      strokeHexPath(g, corners);
    }
  }

  /** Arm (or cancel) building-placement mode for a town + building def. Precomputes
   *  the legal worked-ring cells so the per-frame highlight is a set lookup. */
  private toggleBuildingPlacement(townId: number, defId: string): void {
    if (this.buildingPlacement && this.buildingPlacement.townId === townId && this.buildingPlacement.defId === defId) {
      this.cancelBuildingPlacement(); return;
    }
    this.foundingFromId = null; this.foundingValidCells = null; // mutually exclusive
    this.cancelDistrictPlacement();
    this.buildingPlacement = { townId, defId };
    this.buildingValidCells = new Set(this.region.buildablePlacementCells(townId));
  }

  private cancelBuildingPlacement(): void {
    this.buildingPlacement = null;
    this.buildingValidCells = null;
  }

  /** Arm (or cancel) DISTRICT-zoning placement mode for a town + district def. */
  private toggleDistrictPlacement(townId: number, defId: string): void {
    if (this.districtPlacement && this.districtPlacement.townId === townId && this.districtPlacement.defId === defId) {
      this.cancelDistrictPlacement(); return;
    }
    this.foundingFromId = null; this.foundingValidCells = null; // mutually exclusive
    this.cancelBuildingPlacement();
    this.districtPlacement = { townId, defId };
    this.districtValidCells = new Set(this.region.buildablePlacementCells(townId));
  }

  private cancelDistrictPlacement(): void {
    this.districtPlacement = null;
    this.districtValidCells = null;
  }

  /** Per-frame highlight of legal building sites. Amber for an ordinary building,
   *  gold for a one-per-empire Wonder (Phase D) — both distinct from the green
   *  town-founding highlight. */
  private drawBuildingPlacementOverlay(): void {
    const cells = this.buildingValidCells;
    if (!this.buildingPlacement || !cells || cells.size === 0) return;
    const g = this.g;
    const N = REGION_N;
    const { size, ox, oy } = this.hexLayout();
    const pulse = 0.16 + 0.12 * Math.abs(Math.sin(this.frame / 18));
    const { townId, defId } = this.buildingPlacement;
    const wonder = REGION_BUILDINGS.find((b) => b.id === defId)?.unique === true;
    const fill = wonder ? `rgba(245,205,70,${pulse.toFixed(3)})` : `rgba(228,178,90,${pulse.toFixed(3)})`;
    const stroke = wonder ? 'rgba(255,228,130,0.9)' : 'rgba(240,200,120,0.75)';
    for (const key of cells) {
      const col = Math.floor(key / N), row = key % N;
      const { x: cx, y: cy } = hexCenter(col, row, size, ox, oy);
      if (cx < this.vb.l - size || cx > this.vb.r + size || cy < this.vb.t - size || cy > this.vb.b + size) continue;
      const corners = hexCorners(cx, cy, size);
      // Base legal-site fill (amber for a building, gold for a Wonder).
      g.lineWidth = wonder ? 2 : 1.5;
      g.fillStyle = fill;
      fillHexPath(g, corners);
      g.strokeStyle = stroke;
      strokeHexPath(g, corners);
      // Spatial-4X Phase D — placement preview: tint the sites that pay off (terrain
      // match + district synergy) green and label the bonus, so the player can read
      // WHERE to build before committing. Render-only — placementPreview is pure.
      const pv = this.region.placementPreview(townId, key, defId);
      if (pv && pv.total > 0) {
        const intensity = Math.min(1, pv.total / 0.16);
        g.fillStyle = `rgba(110,210,120,${(0.18 + 0.32 * intensity).toFixed(3)})`;
        fillHexPath(g, corners);
        g.strokeStyle = `rgba(150,235,150,${(0.5 + 0.4 * intensity).toFixed(3)})`;
        strokeHexPath(g, corners);
        g.fillStyle = 'rgba(255,255,255,0.95)';
        g.font = 'bold 10px monospace';
        g.textAlign = 'center';
        g.fillText(`+${Math.round(pv.total * 100)}%`, cx, cy + 3);
        g.textAlign = 'left';
      }
    }
  }

  /** Highlight legal district-zoning sites while in district-placement mode, tinted
   *  by the themed sector and labelled with the zone bonus the site would earn (its
   *  flat bonus + adjacency reward from neighbouring same-sector buildings). Render-
   *  only — districtPlacementPreview is pure. */
  private drawDistrictPlacementOverlay(): void {
    const cells = this.districtValidCells;
    if (!this.districtPlacement || !cells || cells.size === 0) return;
    const g = this.g;
    const N = REGION_N;
    const { size, ox, oy } = this.hexLayout();
    const pulse = 0.18 + 0.12 * Math.abs(Math.sin(this.frame / 18));
    const { townId, defId } = this.districtPlacement;
    const sector = DISTRICT_DEF_BY_ID.get(defId)?.sector ?? 'agriculture';
    const rgb = SECTOR_RGB[sector] ?? '138,154,74';
    for (const key of cells) {
      const col = Math.floor(key / N), row = key % N;
      const { x: cx, y: cy } = hexCenter(col, row, size, ox, oy);
      if (cx < this.vb.l - size || cx > this.vb.r + size || cy < this.vb.t - size || cy > this.vb.b + size) continue;
      const corners = hexCorners(cx, cy, size);
      g.lineWidth = 2;
      g.fillStyle = `rgba(${rgb},${pulse.toFixed(3)})`;
      fillHexPath(g, corners);
      g.strokeStyle = `rgba(${rgb},0.9)`;
      strokeHexPath(g, corners);
      const pv = this.region.districtPlacementPreview(townId, key, defId);
      if (pv && pv.total > 0) {
        g.fillStyle = 'rgba(255,255,255,0.95)';
        g.font = 'bold 10px monospace';
        g.textAlign = 'center';
        g.fillText(`+${Math.round(pv.total * 100)}%`, cx, cy + 3);
        g.textAlign = 'left';
      }
    }
  }

  /** Render each town's placed DISTRICTS as a translucent themed hex zone with a
   *  sector-tinted border and a short label (spatial-4X Phase D — render-only). Drawn
   *  under the building icons so a building sited inside its zone reads on top. */
  private drawPlacedDistricts(): void {
    const g = this.g;
    const N = REGION_N;
    const { size, ox, oy } = this.hexLayout();
    for (const t of this.region.settlements) {
      if (!t.placedDistricts || t.placedDistricts.length === 0) continue;
      for (const p of t.placedDistricts) {
        const def = DISTRICT_DEF_BY_ID.get(p.id);
        const rgb = SECTOR_RGB[def?.sector ?? 'agriculture'] ?? '138,154,74';
        const col = Math.floor(p.cell / N), row = p.cell % N;
        const { x: cx, y: cy } = hexCenter(col, row, size, ox, oy);
        if (cx < this.vb.l - size || cx > this.vb.r + size || cy < this.vb.t - size || cy > this.vb.b + size) continue;
        const corners = hexCorners(cx, cy, size);
        g.save();
        g.fillStyle = `rgba(${rgb},0.28)`;
        fillHexPath(g, corners);
        g.lineWidth = 2;
        g.strokeStyle = `rgba(${rgb},0.85)`;
        strokeHexPath(g, corners);
        // short tag (first letter of the themed sector) centred in the zone
        g.fillStyle = 'rgba(255,255,255,0.92)';
        g.font = `bold ${Math.max(8, Math.round(size * 0.5))}px monospace`;
        g.textAlign = 'center';
        g.fillText((def?.sector ?? '?').charAt(0).toUpperCase(), cx, cy + size * 0.18);
        g.textAlign = 'left';
        g.restore();
      }
    }
  }

  /** Render each town's placed buildings as small shaded icons on their hexes,
   *  tinted by the building's economic sector (spatial-4X Phase B — render-only). */
  private drawPlacedBuildings(): void {
    const g = this.g;
    const N = REGION_N;
    const { size, ox, oy } = this.hexLayout();
    for (const t of this.region.settlements) {
      if (!t.placedBuildings || t.placedBuildings.length === 0) continue;
      // Spatial-4X Phase D slice 2: draw a faint connector glow between same-sector
      // buildings on adjacent hexes, so a DISTRICT (the clustering synergy) reads at
      // a glance. Render-only — mirrors the sim's districtAdjacencyBonus rule.
      const cellSector = new Map<number, string>();
      for (const p of t.placedBuildings) {
        const def = REGION_BUILDING_BY_ID.get(p.id);
        if (def && def.sector !== 'all') cellSector.set(p.cell, def.sector);
      }
      if (cellSector.size >= 2) {
        g.save();
        g.lineWidth = Math.max(2, size * 0.16);
        g.lineCap = 'round';
        for (const [cell, sec] of cellSector) {
          const col = Math.floor(cell / N), row = cell % N;
          for (const [ax, ay] of hexNeighbors(col, row)) {
            const nCell = ax * N + ay;
            if (nCell <= cell) continue; // draw each pair once
            if (cellSector.get(nCell) !== sec) continue;
            const a = hexCenter(col, row, size, ox, oy);
            const b = hexCenter(ax, ay, size, ox, oy);
            if (Math.max(a.x, b.x) < this.vb.l - size || Math.min(a.x, b.x) > this.vb.r + size) continue;
            if (Math.max(a.y, b.y) < this.vb.t - size || Math.min(a.y, b.y) > this.vb.b + size) continue;
            g.strokeStyle = SECTOR_HEX[sec] ?? '#9a8a5a';
            g.globalAlpha = 0.35;
            g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
          }
        }
        g.restore();
      }
      for (const p of t.placedBuildings) {
        const col = Math.floor(p.cell / N), row = p.cell % N;
        const { x: cx, y: cy } = hexCenter(col, row, size, ox, oy);
        if (cx < this.vb.l - size || cx > this.vb.r + size || cy < this.vb.t - size || cy > this.vb.b + size) continue;
        const def = REGION_BUILDING_BY_ID.get(p.id);
        const base = SECTOR_HEX[def?.sector ?? 'all'] ?? '#9a8a5a';
        const s = Math.max(6, size * 0.5);
        // little shaded building: body + lit roof + drop shadow
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.beginPath(); g.ellipse(cx, cy + s * 0.5, s * 0.55, s * 0.2, 0, 0, Math.PI * 2); g.fill();
        this.box(Math.round(cx - s / 2), Math.round(cy - s * 0.35), Math.round(s), Math.round(s * 0.8), base);
        this.roof(Math.round(cx - s / 2 - 1), Math.round(cy - s * 0.7), Math.round(s + 2), Math.round(s * 0.4), this.shade(base, -0.28));
      }
    }
  }

  /** Province inspector panel: shows detailed stats for the selected province. */
  private drawProvincePanel(): void {
    const show = this.provinceViewActive && this.selectedProvinceId !== null;
    if (!show) {
      this.provincePanel.classList.add('hidden');
      return;
    }
    this.provincePanel.classList.remove('hidden');

    const prov = this.getCachedProvinces().find((p) => p.id === this.selectedProvinceId);
    if (!prov) {
      this.provincePanel.classList.add('hidden');
      return;
    }

    // Throttle rebuild: 1 per 60 frames unless selection changed
    if (
      this.lastProvincePanelId === prov.id &&
      this.frame - this.lastProvincePanelBuildFrame < 60
    ) return;
    this.lastProvincePanelId = prov.id;
    this.lastProvincePanelBuildFrame = this.frame;

    const faction = this.region.faction(prov.factionId);
    const factionName = faction?.name ?? 'Unknown';
    const color = faction?.color ?? '#aaa';
    const isPlayer = prov.factionId === this.region.playerFactionId;

    const buildings = prov.keyBuildings.length > 0
      ? prov.keyBuildings.slice(0, 6).join(', ')
      : 'none';
    const satBar = `<div class="meter-line">${meterBar(
      prov.satisfaction,
      prov.satisfaction >= 70 ? 'info' : prov.satisfaction >= 40 ? 'warn' : 'bad',
    )}</div>`;

    // Province policy controls (player provinces only)
    const pol = isPlayer ? this.region.getProvincePolicy(prov.id) : null;
    const TAX_LABELS = ['×0.5 Low', '×1.0 Normal', '×1.5 High', '×2.0 Max'];
    const INV_LABELS = ['Low', 'Medium', 'High'];
    const AUTO_LABELS = ['Administered', 'Semi-auto', 'Self-govern'];
    const policyHtml = pol && this.region.stateProclaimed ? `
      <p class="insp-skills">PROVINCE POLICY</p>
      <p class="t-sm">Tax:
        <select id="pp-tax">
          ${[0.5, 1.0, 1.5, 2.0].map((v, i) => `<option value="${v}"${Math.abs(pol.taxMultiplier - v) < 0.01 ? ' selected' : ''}>${TAX_LABELS[i]}</option>`).join('')}
        </select>
      </p>
      <p class="t-sm">Investment:
        <select id="pp-inv">
          ${[0, 1, 2].map((v) => `<option value="${v}"${pol.investmentLevel === v ? ' selected' : ''}>${INV_LABELS[v]}</option>`).join('')}
        </select>
      </p>
      <p class="t-sm">Autonomy:
        <select id="pp-auto">
          ${[0, 1, 2].map((v) => `<option value="${v}"${pol.autonomyLevel === v ? ' selected' : ''}>${AUTO_LABELS[v]}</option>`).join('')}
        </select>
      </p>` : '';

    // Stationed armies
    const armies = this.region.armiesAt(prov.id);
    const armyHtml = armies.length > 0
      ? `<p class="insp-skills">STATIONED FORCES</p>` +
        armies.map((a) => {
          const total = a.units.reduce((s, u) => s + u.count, 0);
          const morale = Math.round(a.units.reduce((s, u) => s + u.morale * u.count, 0) / Math.max(1, total));
          return `<p class="t-sm">${total} units · morale ${morale}%
            <button class="mini ml-4" data-army="${a.id}" id="cancel-army-${a.id}">✕</button></p>`;
        }).join('')
      : '';

    this.setInnerHtml(
      this.provincePanel,
      `<h3 class="panel-title" style="color:${color}">${prov.name}</h3>` +
      `<p class="insp-skills">${isPlayer ? 'YOUR PROVINCE' : factionName.toUpperCase()}</p>` +
      `<p>Population: <b>${prov.totalPop.toLocaleString()}</b></p>` +
      `<p>GDP/mo: <b>${formatCurrency(prov.gdpContribution)}</b></p>` +
      `<p>Satisfaction: <b>${prov.satisfaction}%</b>${satBar}</p>` +
      `<p>Garrison: <b>${prov.militaryStrength}</b></p>` +
      `<p class="insp-skills">BUILDINGS</p>` +
      `<p class="t-sm c-muted">${buildings}</p>` +
      policyHtml +
      armyHtml +
      `<p><button class="mini" id="prov-panel-close">✕ close</button></p>`,
    );

    this.provincePanel.querySelector<HTMLButtonElement>('#prov-panel-close')?.addEventListener('click', () => {
      this.selectedProvinceId = null;
      this.provincePanel.classList.add('hidden');
    });

    // Province policy change handlers
    if (pol) {
      const taxSel = this.provincePanel.querySelector<HTMLSelectElement>('#pp-tax');
      const invSel = this.provincePanel.querySelector<HTMLSelectElement>('#pp-inv');
      const autoSel = this.provincePanel.querySelector<HTMLSelectElement>('#pp-auto');
      taxSel?.addEventListener('change', () => {
        issue(this.region, 'setProvincePolicy', prov.id, { taxMultiplier: parseFloat(taxSel.value) });
        this.lastProvincePanelBuildFrame = 0; // force rebuild
      });
      invSel?.addEventListener('change', () => {
        issue(this.region, 'setProvincePolicy', prov.id, { investmentLevel: parseInt(invSel.value) });
        this.lastProvincePanelBuildFrame = 0;
      });
      autoSel?.addEventListener('change', () => {
        issue(this.region, 'setProvincePolicy', prov.id, { autonomyLevel: parseInt(autoSel.value) });
        this.lastProvincePanelBuildFrame = 0;
      });
    }

    // Army cancel handlers
    for (const a of armies) {
      this.provincePanel.querySelector(`#cancel-army-${a.id}`)?.addEventListener('click', () => {
        issue(this.region, 'cancelArmyMovement', a.id);
        this.lastProvincePanelBuildFrame = 0;
      });
    }
  }

  /** Build the offscreen water-pixel mask once per canvas-resize; water tiles never change biome. */
  private ensureWaterMask(W: number, H: number): void {
    const dims = `${W}x${H}`;
    if (this.waterMaskCanvas && this.waterMaskDims === dims) return;
    if (!this.waterMaskCanvas) this.waterMaskCanvas = document.createElement('canvas');
    this.waterMaskCanvas.width = W;
    this.waterMaskCanvas.height = H;
    const mc = this.waterMaskCanvas.getContext('2d')!;
    mc.clearRect(0, 0, W, H);
    if (!this.waterGlintCanvas) this.waterGlintCanvas = document.createElement('canvas');
    this.waterGlintCanvas.width = W;
    this.waterGlintCanvas.height = H;
    const gc = this.waterGlintCanvas.getContext('2d')!;
    gc.clearRect(0, 0, W, H);
    // The glint carries a diagonal highlight — brightest upper-left, matching the
    // era key-light — so the additive sparkle concentrates where the sun hits.
    const glint = gc.createLinearGradient(0, 0, W, H);
    glint.addColorStop(0, 'rgba(255,250,235,0.85)');
    glint.addColorStop(0.45, 'rgba(255,250,235,0.14)');
    glint.addColorStop(1, 'rgba(255,250,235,0)');
    gc.fillStyle = glint;
    const map = this.region.map;
    const N = REGION_N;
    const m = 60;
    const { size, ox, oy } = hexLayoutParams(W, H, N, m);
    mc.fillStyle = 'rgb(200,220,240)';
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (!RegionView.WATER_BIOMES.has(map.at(x, y).biome)) continue;
        const { x: cx, y: cy } = hexCenter(x, y, size, ox, oy);
        const corners = hexCorners(cx, cy, size);
        fillHexPath(mc, corners);
        fillHexPath(gc, corners);
      }
    }
    this.waterMaskDims = dims;
  }

  /** Subtle per-frame water shimmer + a pulsing additive sun-glint — two
   *  drawImages instead of 65 536 fillRects. */
  private drawWaterAnimation(): void {
    const W = this.viewW;
    const H = this.viewH;
    this.ensureWaterMask(W, H);
    const g = this.g;
    const wave = Math.sin(this.frame * 0.05) * 0.5 + 0.5; // 0..1
    g.globalAlpha = wave * 0.04; // max 4% opacity — very subtle shimmer
    g.drawImage(this.waterMaskCanvas!, 0, 0);
    // Additive specular glint, pulsing with the same wave; save/restore so the
    // 'lighter' comp-op never leaks into later map layers.
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.06 + wave * 0.08;
    g.drawImage(this.waterGlintCanvas!, 0, 0);
    g.restore();
    g.globalAlpha = 1;
  }

  /** Full-screen atmospheric pass (screen-space): seasonal wash + vignette. */
  private drawAtmosphere(W: number, H: number, lit: { night: number; golden: number; season: number }): void {
    const { g } = this;
    // Seasonal wash — faint, so it colours the mood without fighting the map.
    const seasonTint = ['rgba(120,180,96,0.07)', 'rgba(255,206,120,0.06)', 'rgba(208,138,60,0.08)', 'rgba(150,182,224,0.09)'][lit.season] ?? '';
    if (seasonTint) { g.fillStyle = seasonTint; g.fillRect(0, 0, W, H); }
    // Era key-light: one directional wash (warm upper-left highlight → cool
    // lower-right shadow) so the map, tokens and parallax sky share a single
    // light. Era/season/branch-driven (day/night is disabled — atmosphere()
    // returns 0), low-alpha over the foreground, cached until any of those
    // change. Branch-aware via eraKeyLight: a dystopia future is lit sodium-
    // amber to match its repainted sky, not the neutral teal.
    const era = eraIdForYear(this.region.year);
    const branch = this.region.eraBranch as Branch;
    const season = ((lit.season % 4) + 4) % 4;
    const lightSig = `${W}x${H}|${era}|${branch ?? '-'}|${season}`;
    if (!this.lightGrad || this.lightSig !== lightSig) {
      this.lightSig = lightSig;
      const { warm, cool } = eraKeyLight(era, branch);
      const grad = g.createLinearGradient(W * 0.12, 0, W * 0.88, H);
      grad.addColorStop(0, `rgba(${warm},${SEASON_WARM_A[season]})`);
      grad.addColorStop(0.5, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(${cool},${SEASON_COOL_A[season]})`);
      this.lightGrad = grad;
    }
    g.fillStyle = this.lightGrad;
    g.fillRect(0, 0, W, H);
    // Vignette: a darkened frame that draws the eye inward. Gradient is cached per canvas size.
    const dims = `${W}x${H}`;
    if (!this.vignetteGrad || this.vignetteDims !== dims) {
      this.vignetteDims = dims;
      this.vignetteGrad = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.36, W / 2, H / 2, Math.max(W, H) * 0.72);
      this.vignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
      this.vignetteGrad.addColorStop(1, 'rgba(4,6,12,0.5)');
    }
    g.fillStyle = this.vignetteGrad;
    g.fillRect(0, 0, W, H);
  }

  /** HUD panel drawn in screen-space for a selected player scout. */
  private drawScoutPanel(
    scout: Scout & { name?: string; autoExplore?: boolean; manualTargetX?: number; manualTargetY?: number },
    W: number, H: number,
  ): void {
    const { g } = this;
    const pw = 210, ph = 96;
    const spx = W - pw - 14;
    const spy = H - ph - 58;
    g.fillStyle = 'rgba(10,14,24,0.92)';
    this.roundedPath(spx, spy, pw, ph, 8);
    g.fill();
    g.strokeStyle = 'rgba(80,140,220,0.55)';
    g.lineWidth = 1;
    this.roundedPath(spx, spy, pw, ph, 8);
    g.stroke();
    const sname = scout.name ?? 'Scout';
    const days = Math.max(0, scout.expireDay - this.region.day);
    g.fillStyle = '#a8c8ff';
    g.font = 'bold 11px monospace';
    g.textAlign = 'left';
    g.fillText(`SCOUT · ${sname}`, spx + 10, spy + 18);
    g.fillStyle = '#7a9ab8';
    g.font = '10px monospace';
    g.fillText(`${days}d remaining  HP ${scout.health}`, spx + 10, spy + 33);
    const autoOn = scout.autoExplore !== false;
    g.fillStyle = autoOn ? '#4af' : '#888';
    g.fillText(autoOn ? '⟳ Auto-Explore ON' : '○ Parked', spx + 10, spy + 48);
    if (scout.manualTargetX !== undefined) {
      g.fillStyle = '#fca';
      g.fillText('→ Moving to waypoint', spx + 10, spy + 63);
    } else {
      g.fillStyle = '#888';
      g.fillText(autoOn ? 'Click map to send to waypoint' : 'Auto-Explore is OFF', spx + 10, spy + 63);
    }
    g.fillStyle = '#556';
    g.font = '9px monospace';
    g.fillText('Click scout to deselect', spx + 10, spy + 82);
  }

  // (drawFog / drawMemoryFog removed 2026-07 — fog of war retired; the map renders clean.)

  /** Is a base-coord point within the current viewport (plus margin)? */
  private inView(px: number, py: number, margin: number): boolean {
    const vb = this.vb;
    return px >= vb.l - margin && px <= vb.r + margin && py >= vb.t - margin && py <= vb.b + margin;
  }

  /** Phase 0: territory borders — translucent control zones plus thick frontier
   *  lines, so the map reads as contested ground at a glance. Drawn under routes
   *  and settlements; faction-coloured (player blue, rivals their own hues). */
  private drawTerritories(g: CanvasRenderingContext2D, W: number, H: number): void {
    const { region } = this;
    const N = REGION_N;
    const live = region.computeTerritoryGrid();
    const hv = this.historyView;
    const grid = hv ? hv.owners[hv.idx] : live.grid;
    const contested = hv ? new Uint8Array(grid.length) : live.contested;
    const controlLevel = hv ? new Uint8Array(grid.length).fill(255) : live.controlLevel;

    const m = 60;
    const { size, ox, oy } = hexLayoutParams(W, H, N, m);
    const colorCache = new Map<number, { r: number; g: number; b: number } | null>();
    const rgbOf = (fid: number): { r: number; g: number; b: number } | null => {
      if (fid < 0) return null;
      if (colorCache.has(fid)) return colorCache.get(fid)!;
      const base = region.faction(fid)?.color ?? '#888888';
      const idx = region.regionalFactions.findIndex((f) => f.id === fid);
      const col = this.colorSettings ? factionColor(base, Math.max(0, idx), this.colorSettings) : base;
      const rgb = hexToRgb(col);
      colorCache.set(fid, rgb);
      return rgb;
    };
    // 1) translucent interior fills — a weak grip reads fainter, so eroding
    //    frontiers visibly thin before they flip (Centuria 2.0 §G)
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const idx = x * N + y;
        const rgb = rgbOf(grid[idx]);
        if (!rgb) continue;
        const { x: cx, y: cy } = hexCenter(x, y, size, ox, oy);
        if (this.culled(cx, cy, size)) continue;
        const alpha = 0.05 + 0.1 * (controlLevel[idx] / 255);
        g.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha.toFixed(3)})`;
        fillHexPath(g, hexCorners(cx, cy, size));
      }
    }
    // 2) contested ground: diagonal hatching in the holder's colour
    g.save();
    g.lineWidth = Math.max(0.6, size * 0.12);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const idx = x * N + y;
        if (!contested[idx]) continue;
        const rgb = rgbOf(grid[idx]);
        if (!rgb) continue;
        const { x: cx, y: cy } = hexCenter(x, y, size, ox, oy);
        if (this.culled(cx, cy, size)) continue;
        g.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.45)`;
        g.beginPath();
        for (let k = -1; k <= 1; k++) {
          const o = k * size * 0.6;
          g.moveTo(cx - size * 0.6 + o, cy + size * 0.6);
          g.lineTo(cx + size * 0.6 + o, cy - size * 0.6);
        }
        g.stroke();
      }
    }
    g.restore();
    // 3) frontier glow: each hex edge bordering a different faction gets a wide
    //    soft cultural halo under a crisp core line, so borders read as lit bands
    //    of influence rather than hard ink strokes. Three passes, widest first.
    const frontierPasses: [number, number][] = [[6, 0.09], [3.2, 0.2], [1.3, 0.9]];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const fid = grid[x * N + y];
        const rgb = rgbOf(fid);
        if (!rgb) continue;
        const { x: cx, y: cy } = hexCenter(x, y, size, ox, oy);
        if (this.culled(cx, cy, size)) continue;
        const corners = hexCorners(cx, cy, size);
        for (let d = 0; d < 6; d++) {
          const [nc, nr] = hexNeighborDir(x, y, d);
          const nb = nc >= 0 && nc < N && nr >= 0 && nr < N ? grid[nc * N + nr] : -9;
          if (nb === fid) continue;
          const a = corners[d];
          const b = corners[(d + 1) % 6];
          for (const [lw, alpha] of frontierPasses) {
            g.lineWidth = lw;
            g.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
            g.beginPath();
            g.moveTo(a.x, a.y);
            g.lineTo(b.x, b.y);
            g.stroke();
          }
        }
      }
    }
    g.lineWidth = 1;
  }

  /** Centuria 2.0 history scrubber: replaying yearly border snapshots. */
  private historyView: { years: number[]; owners: Int16Array[]; idx: number; bar: HTMLElement; timer: number | null } | null = null;

  get historyOpen(): boolean {
    return this.historyView !== null;
  }

  toggleHistory(): void {
    if (this.historyView) {
      if (this.historyView.timer !== null) window.clearInterval(this.historyView.timer);
      this.historyView.bar.remove();
      this.historyView = null;
      this.prevTerritoryGrid = null;
      return;
    }
    const snaps = expandHistory(this.region.territoryHistory, REGION_N * REGION_N);
    const years = snaps.map((x) => x.year);
    const owners = snaps.map((x) => x.owner);
    years.push(this.region.year);
    owners.push(this.region.computeTerritoryGrid().grid.slice());
    const bar = document.createElement('div');
    bar.className = 'history-bar';
    bar.innerHTML =
      `<button class="history-play" title="Play">▶</button>` +
      `<input class="history-range" type="range" min="0" max="${years.length - 1}" value="${years.length - 1}">` +
      `<span class="history-year">${years[years.length - 1]}</span>` +
      `<button class="history-close" title="Close (H)">×</button>`;
    this.root.appendChild(bar);
    const hv = { years, owners, idx: years.length - 1, bar, timer: null as number | null };
    this.historyView = hv;
    const range = bar.querySelector<HTMLInputElement>('.history-range')!;
    const label = bar.querySelector<HTMLElement>('.history-year')!;
    const play = bar.querySelector<HTMLButtonElement>('.history-play')!;
    const setIdx = (i: number) => {
      hv.idx = Math.max(0, Math.min(years.length - 1, i));
      range.value = String(hv.idx);
      label.textContent = String(years[hv.idx]);
    };
    range.oninput = () => setIdx(Number(range.value));
    play.onclick = () => {
      if (hv.timer !== null) { window.clearInterval(hv.timer); hv.timer = null; play.textContent = '▶'; return; }
      if (hv.idx >= years.length - 1) setIdx(0);
      play.textContent = '❚❚';
      hv.timer = window.setInterval(() => {
        if (hv.idx >= years.length - 1) { window.clearInterval(hv.timer!); hv.timer = null; play.textContent = '▶'; return; }
        setIdx(hv.idx + 1);
      }, 350);
    };
    bar.querySelector<HTMLButtonElement>('.history-close')!.onclick = () => this.toggleHistory();
  }

  private colorSettings: Settings | null = null;

  /** Base-coord rect the current tile render covers; hexes outside are skipped. */
  private cull: { l: number; t: number; r: number; b: number } | null = null;

  private culled(cx: number, cy: number, size: number): boolean {
    const c = this.cull;
    if (!c) return false;
    const m = size * 2;
    return cx < c.l - m || cx > c.r + m || cy < c.t - m || cy > c.b + m;
  }

  /** Colourblind palette for territory (Centuria 2.0 accessibility). */
  setColorSettings(s: Settings): void {
    this.colorSettings = s;
    this.tileSig = '';
  }

  private prevTerritoryGrid: Int16Array | null = null;
  private borderPulse: { cells: number[]; owners: number[]; start: number } | null = null;
  private static readonly BORDER_PULSE_MS = 2200;

  /** Diff the new ownership grid against the last one drawn; flipped cells pulse. */
  private noteBorderChanges(grid: Int16Array): void {
    const prev = this.prevTerritoryGrid;
    this.prevTerritoryGrid = grid.slice();
    if (!prev || prev.length !== grid.length) return;
    const cells: number[] = [];
    const owners: number[] = [];
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] !== prev[i] && grid[i] >= 0 && prev[i] >= 0) { cells.push(i); owners.push(grid[i]); }
    }
    if (cells.length) this.borderPulse = { cells, owners, start: performance.now() };
  }

  /** Per-frame: flipped hexes flare in their new owner's colour, then fade. */
  private drawBorderPulses(g: CanvasRenderingContext2D, W: number, H: number): void {
    const p = this.borderPulse;
    if (!p) return;
    const t = (performance.now() - p.start) / RegionView.BORDER_PULSE_MS;
    if (t >= 1) { this.borderPulse = null; return; }
    const N = REGION_N;
    const { size, ox, oy } = hexLayoutParams(W, H, N, 60);
    const alpha = 0.55 * (1 - t) * (0.6 + 0.4 * Math.sin(t * Math.PI * 6));
    for (let k = 0; k < p.cells.length; k++) {
      const idx = p.cells[k];
      const x = Math.floor(idx / N), y = idx % N;
      const { x: cx, y: cy } = hexCenter(x, y, size, ox, oy);
      if (!this.inView(cx, cy, size * 2)) continue;
      const rgb = hexToRgb(this.region.faction(p.owners[k])?.color ?? '#ffffff');
      g.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${Math.max(0, alpha).toFixed(3)})`;
      fillHexPath(g, hexCorners(cx, cy, size));
    }
  }

  /** Phase 0: at-a-glance resource health under each settlement — three small
   *  squares (Food, Wood, Goods) coloured green/yellow/red. */
  private drawResourceIndicators(): void {
    const { g, region } = this;
    const statusColor: Record<string, string> = {
      surplus: '#4caf50', balanced: '#c2a14d', deficit: '#e04444',
    };
    for (const t of region.settlements) {
      const { px, py } = this.toPx(t.x, t.y);
      if (!this.inView(px, py, 80)) continue;
      const rs = region.getSettlementResourceStatus(t);
      const cells: [string, string][] = [['F', rs.food], ['W', rs.wood], ['G', rs.goods]];
      // Scaled with the settlement glyph so the F/W/G chips tuck just beneath the
      // town instead of floating hexes away.
      this.withGlyphScale(px, py, () => {
        const bw = 7;
        const gap = 3;
        const total = cells.length * bw + (cells.length - 1) * gap;
        let bx = Math.round(px - total / 2);
        const by = Math.round(py + 46);
        for (const [label, st] of cells) {
          g.fillStyle = 'rgba(10,12,18,0.75)';
          g.fillRect(bx - 1, by - 1, bw + 2, bw + 2);
          g.fillStyle = statusColor[st] ?? '#888';
          g.fillRect(bx, by, bw, bw);
          g.fillStyle = '#0a0c12';
          g.font = '7px monospace';
          g.textAlign = 'center';
          g.fillText(label, bx + bw / 2, by + bw - 1);
          bx += bw + gap;
        }
      });
    }
    g.textAlign = 'left';
  }

  /** Phase 0: direction arrows on busy trade corridors, coloured by cargo and
   *  scaled by freight, so flow and its bearing read from the map. */
  private drawTradeFlows(): void {
    const { region } = this;
    for (const r of region.routes) {
      if (r.path.length < 3 || r.freight <= 0) continue;
      if (!this.routeInView(r, 16)) continue;
      const rgb = (r.cargoType && CARGO_RGB[r.cargoType]) || '200,200,200';
      const size = 4 + Math.min(4, Math.log10(1 + r.freight));
      for (const f of [0.4, 0.7]) {
        const i = Math.max(1, Math.min(r.path.length - 1, Math.floor(r.path.length * f)));
        const c0 = region.map.cellToCoord(r.path[i - 1].x, r.path[i - 1].y);
        const c1 = region.map.cellToCoord(r.path[i].x, r.path[i].y);
        const p0 = this.toPx(c0.rx, c0.ry);
        const p1 = this.toPx(c1.rx, c1.ry);
        const ang = Math.atan2(p1.py - p0.py, p1.px - p0.px);
        this.drawArrowHead(p1.px, p1.py, ang, size, `rgba(${rgb},0.9)`);
      }
    }
  }

  private drawArrowHead(x: number, y: number, ang: number, size: number, color: string): void {
    const { g } = this;
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(size, 0);
    g.lineTo(-size, -size * 0.7);
    g.lineTo(-size, size * 0.7);
    g.closePath();
    g.fill();
    g.restore();
  }

  /** Rival nations loom at the map's edge (GDD §6.4): a flag, a name, and
   *  the relations number — the world beyond the valley, read at a glance. */
  private drawRivalBanners(W: number, H: number): void {
    const { g, region } = this;
    const edgeIdx = { north: 0, east: 0, south: 0, west: 0 };
    for (const rv of region.rivals) {
      const rel = Math.round(rv.relations);
      const col = rel >= 25 ? '#8fc26a' : rel >= -25 ? '#c2a14d' : '#e04444';
      const i = edgeIdx[rv.compass]++;
      let x: number, y: number;
      switch (rv.compass) {
        case 'north': x = W / 2 + (i - 0.5) * 220; y = 18; break;
        case 'south': x = 150 + i * 220; y = H - 18; break;
        case 'east': x = W - 110; y = H / 2 + (i - 0.5) * 56; break;
        default: x = 110; y = H / 2 + (i - 0.5) * 56; break; // west
      }
      // a power at war flies a battle streamer
      const atWar = region.foreignWars.some((w) => w.a === rv.id || w.b === rv.id);
      const label = `${atWar ? '⚔ ' : ''}${rv.name} ${rel >= 0 ? '+' : ''}${rel}`;
      g.font = '11px monospace';
      const tw = g.measureText(label).width;
      g.fillStyle = 'rgba(16,14,10,0.8)';
      g.fillRect(x - tw / 2 - 16, y - 10, tw + 32, 20);
      // the flag: a chip of bunting in the relation's color
      g.fillStyle = col;
      g.fillRect(x - tw / 2 - 12, y - 6, 8, 6);
      g.fillStyle = '#5a4a36';
      g.fillRect(x - tw / 2 - 13, y - 6, 1, 12);
      g.fillStyle = '#dfe6ee';
      g.textAlign = 'left';
      g.fillText(label, x - tw / 2, y + 4);
    }
  }

  /** Rendering flavor only (transportation.md §7: links-not-vehicles) —
   *  a little engine shuttles each rail line, smoke trailing. */
  private drawTrain(pts: { px: number; py: number }[], condition: number): void {
    if (pts.length < 2 || condition <= 20) return; // a washed-out line falls silent
    const { g } = this;
    const span = (pts.length - 1) * 2;
    const t = Math.floor(this.frame / 4) % span;
    const i = t < pts.length - 1 ? t : span - t; // out and back
    const p = pts[Math.max(0, Math.min(pts.length - 1, i))];
    g.fillStyle = '#23262c';
    g.fillRect(Math.round(p.px) - 3, Math.round(p.py) - 3, 7, 5); // the engine
    g.fillStyle = '#c2a14d';
    g.fillRect(Math.round(p.px) - 2, Math.round(p.py) - 2, 2, 2); // brass boiler glint
    const puff = Math.floor(this.frame / 8) % 3;
    g.fillStyle = 'rgba(220,224,230,0.5)';
    g.fillRect(Math.round(p.px) + 1, Math.round(p.py) - 6 - puff, 2 + puff, 2); // smoke
  }

  /** Freight trucks shuttle the highways — same flavor-only rule as trains. */
  private drawTruck(pts: { px: number; py: number }[], condition: number): void {
    if (pts.length < 2 || condition <= 20) return;
    const { g } = this;
    const span = (pts.length - 1) * 2;
    const t = Math.floor(this.frame / 3) % span; // asphalt is quick
    const i = t < pts.length - 1 ? t : span - t;
    const p = pts[Math.max(0, Math.min(pts.length - 1, i))];
    g.fillStyle = '#8c2f24'; // a red hauler
    g.fillRect(Math.round(p.px) - 2, Math.round(p.py) - 3, 5, 4);
    g.fillStyle = '#dfe6ee';
    g.fillRect(Math.round(p.px) + 1, Math.round(p.py) - 2, 1, 1); // windscreen glint
  }

  /** A maglev pod glides the guideway — fastest of the flavor fleet. */
  private drawPod(pts: { px: number; py: number }[], condition: number): void {
    if (pts.length < 2 || condition <= 20) return; // a downed pylon stops the line
    const { g } = this;
    const span = (pts.length - 1) * 2;
    const t = Math.floor(this.frame / 2) % span; // nothing on the map moves quicker
    const i = t < pts.length - 1 ? t : span - t;
    const p = pts[Math.max(0, Math.min(pts.length - 1, i))];
    g.fillStyle = '#dfe9ee'; // a white bullet
    g.fillRect(Math.round(p.px) - 3, Math.round(p.py) - 3, 7, 3);
    g.fillStyle = '#6ec8d6';
    g.fillRect(Math.round(p.px) - 3, Math.round(p.py) - 1, 7, 1); // the field glow beneath
  }

  /** A sea lane: a dashed teal wake tracing the pathfound water route, with a
   *  small hull working along it. The dashes flow so the ocean reads as a live
   *  trade artery, not a border. */
  private drawSeaLane(r: { path: { x: number; y: number }[]; condition: number }, alpha: number): void {
    const pts = this.getRoutePts(r);
    if (pts.length < 2) return;
    const { g } = this;
    // Flowing dashes: offset the dash pattern by the frame so the wake drifts.
    g.save();
    g.strokeStyle = `rgba(96,196,214,${Math.min(1, alpha + 0.15)})`;
    g.lineWidth = 1.5;
    g.setLineDash([5, 4]);
    g.lineDashOffset = -(this.frame % 18);
    g.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) g.moveTo(pts[i].px, pts[i].py);
      else g.lineTo(pts[i].px, pts[i].py);
    }
    g.stroke();
    g.restore();
    // The hull, shuttling out and back like the land vehicles.
    if (r.condition <= 20) return; // a lane fallen out of use goes quiet
    const span = (pts.length - 1) * 2;
    const t = Math.floor(this.frame / 6) % span; // boats are the slowest of the fleet
    const i = t < pts.length - 1 ? t : span - t;
    const p = pts[Math.max(0, Math.min(pts.length - 1, i))];
    g.fillStyle = '#3a2c20'; // a dark hull
    g.fillRect(Math.round(p.px) - 3, Math.round(p.py) - 1, 6, 2);
    g.fillStyle = '#e8e2d0'; // a pale sail
    g.fillRect(Math.round(p.px) - 1, Math.round(p.py) - 4, 2, 3);
  }

  /** Pixel-art town sprite scaled by population tier:
   *  <30 shack, 30-80 cottage, 80-200 house, 200-500 town, 500-1k manor, 1k+ castle */
  /** Lighten (f>0) / darken (f<0) a #rrggbb colour for cheap edge-lighting. */
  private shade(hex: string, f: number): string {
    const n = parseInt(hex.slice(1), 16);
    const a = (c: number) => Math.max(0, Math.min(255, Math.round(c + 255 * f)));
    return `rgb(${a((n >> 16) & 255)},${a((n >> 8) & 255)},${a(n & 255)})`;
  }

  /** A wall/mass block with top-left highlight + bottom-right shadow — gives the
   *  flat tiers a sense of light and depth without per-pixel art. */
  private box(x: number, y: number, w: number, h: number, base: string): void {
    const g = this.g;
    g.fillStyle = base; g.fillRect(x, y, w, h);
    g.fillStyle = this.shade(base, 0.10); g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h);
    g.fillStyle = this.shade(base, -0.16); g.fillRect(x, y + h - 1, w, 1); g.fillRect(x + w - 1, y, 1, h);
  }

  /** A roof block — brighter ridge along the top, darker eave at the bottom. */
  private roof(x: number, y: number, w: number, h: number, base: string): void {
    const g = this.g;
    g.fillStyle = base; g.fillRect(x, y, w, h);
    g.fillStyle = this.shade(base, 0.16); g.fillRect(x, y, w, 1);
    g.fillStyle = this.shade(base, -0.22); g.fillRect(x, y + h - 1, w, 1);
  }

  /** A warm lit window: soft amber glow, bright pane, top glint. */
  private litWindow(x: number, y: number, w: number, h: number): void {
    const g = this.g;
    g.fillStyle = 'rgba(240,214,120,0.22)'; g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle = '#e8d27a'; g.fillRect(x, y, w, h);
    g.fillStyle = '#fff3c4'; g.fillRect(x, y, Math.max(1, w - 1), 1);
  }

  private door(x: number, y: number, w: number, h: number, color = '#8a6a3a'): void {
    const g = this.g;
    g.fillStyle = color; g.fillRect(x, y, w, h);
    g.fillStyle = this.shade(color, -0.22); g.fillRect(x, y, w, 1);
  }

  /** Animated chimney smoke — a couple of puffs rising and fading. */
  private smoke(cx: number, top: number): void {
    const g = this.g;
    for (let k = 0; k < 3; k++) {
      const rise = ((this.frame >> 2) + k * 4) % 12; // 0..11
      const a = 0.4 * (1 - rise / 12);
      if (a <= 0.03) continue;
      const sz = 1 + (rise > 6 ? 1 : 0);
      g.fillStyle = `rgba(208,210,214,${a.toFixed(3)})`;
      g.fillRect(Math.round(cx) - sz, top - rise, sz + 1, sz + 1);
    }
  }

  /** Begin a rounded-rect path, falling back to a plain rect where roundRect is
   *  unavailable. (Deliberately NOT the `roundRect?.() ?? rect()` idiom — that
   *  evaluates BOTH sides when roundRect exists, unioning a sharp rect into the
   *  path.) */
  private roundedPath(x: number, y: number, w: number, h: number, r: number): void {
    const g = this.g;
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, h, r);
    else g.rect(x, y, w, h);
  }

  /** Era/branch-keyed banner accent strings, rebuilt only when the era or
   *  branch turns over (once per decades) — not per settlement per frame. */
  private bannerAccent: { key: string; line: string; border: string } | null = null;

  /** Civ5-style city banner: a dark plate with an era-tinted accent line, a
   *  gold population chip, and the settlement name — replaces the floating
   *  name/pop text so settlements read as anchored cities, not map labels. */
  private drawCityBanner(px: number, py: number, name: string, pop: number, selected: boolean): void {
    const g = this.g;
    const era = eraIdForYear(this.region.year);
    const branch = this.region.eraBranch as Branch;
    const accentKey = `${era}|${branch ?? '-'}`;
    if (!this.bannerAccent || this.bannerAccent.key !== accentKey) {
      const { warm } = eraKeyLight(era, branch);
      this.bannerAccent = { key: accentKey, line: `rgba(${warm},0.85)`, border: `rgba(${warm},0.35)` };
    }
    // Layout: pad·[pop chip]·pad·[name]·2pad — every offset derives from these.
    const pad = 3;
    const h = 16;
    g.font = '10px monospace';
    const popText = String(pop);
    const popW = Math.ceil(this.textW(popText)) + 8; // measured — no per-platform glyph guess
    g.font = 'bold 11px monospace';
    const nameW = Math.ceil(this.textW(name));
    const w = pad + popW + pad + nameW + pad * 2;
    const x = Math.round(px - w / 2);
    const y = Math.round(py);
    // Plate + era accent + border
    g.fillStyle = selected ? 'rgba(24,28,40,0.92)' : 'rgba(10,14,22,0.78)';
    this.roundedPath(x, y, w, h, 4);
    g.fill();
    g.fillStyle = this.bannerAccent.line;
    g.fillRect(x + pad, y, w - pad * 2, 1);
    g.strokeStyle = selected ? 'rgba(232,210,122,0.9)' : this.bannerAccent.border;
    g.lineWidth = 1;
    this.roundedPath(x + 0.5, y + 0.5, w - 1, h - 1, 4);
    g.stroke();
    // Population chip
    g.fillStyle = 'rgba(232,210,122,0.16)';
    this.roundedPath(x + pad, y + pad, popW, h - pad * 2, 3);
    g.fill();
    g.fillStyle = '#e8d27a';
    g.font = '10px monospace';
    g.textAlign = 'center';
    g.fillText(popText, x + pad + popW / 2, y + h - 5);
    // Name — centred in its field between the chip and the right padding.
    g.fillStyle = '#e6ecf5';
    g.font = 'bold 11px monospace';
    g.fillText(name, x + pad + popW + pad + nameW / 2, y + h - 4);
    g.textAlign = 'left';
  }

  private drawTownTier(px: number, py: number, pop: number, selected: boolean): void {
    const g = this.g;
    const tier = townSpriteTier(pop);
    const sprite = this.assets.get(`town-${tier}`);

    // Soft elliptical ground shadow (replaces the flat plate).
    const sw = tier === 'castle' ? 19 : tier === 'manor' ? 17 : tier === 'town' ? 16 : 14;
    g.fillStyle = 'rgba(0,0,0,0.26)';
    g.beginPath();
    g.ellipse(px, py + 9, sw, 4.5, 0, 0, Math.PI * 2);
    g.fill();

    if (sprite) {
      // Real art override (curated PNG), centred on the ground line.
      const s = TOWN_TIER_PX[tier];
      g.imageSmoothingEnabled = false;
      g.drawImage(sprite, Math.round(px - s / 2), Math.round(py + 8 - s), s, s);
    } else if (pop < 30) {
      // Shack: one tiny rough-timber building
      this.box(px - 6, py - 4, 12, 12, '#5a4329');
      this.roof(px - 7, py - 8, 14, 5, '#33261a');
      this.door(px - 1, py - 2, 2, 4);
    } else if (pop < 80) {
      // Cottage: tidy house with a smoking chimney
      this.box(px - 8, py - 4, 16, 12, '#7a5436');
      this.roof(px - 9, py - 10, 18, 7, '#43342a');
      this.box(px + 3, py - 15, 4, 6, '#5a4030'); // chimney
      this.smoke(px + 5, py - 16);
      this.litWindow(px - 4, py - 1, 3, 3);
      this.litWindow(px + 2, py - 1, 3, 3);
    } else if (pop < 200) {
      // House: proper two-story with detail
      this.box(px - 10, py - 8, 20, 16, '#86603f');
      this.roof(px - 11, py - 14, 22, 7, '#43342a');
      this.box(px + 5, py - 19, 4, 6, '#5a4030'); // chimney
      this.smoke(px + 7, py - 20);
      this.door(px - 3, py - 3, 6, 8, '#241a12'); // arch
      this.litWindow(px - 8, py - 5, 3, 3);
      this.litWindow(px + 5, py - 5, 3, 3);
      this.litWindow(px - 8, py + 2, 3, 3);
      this.litWindow(px + 5, py + 2, 3, 3);
    } else if (pop < 500) {
      // Town: cluster of buildings around a central hall
      this.box(px - 14, py - 6, 28, 14, '#9a7450'); // base block
      this.box(px - 14, py - 4, 6, 10, '#7a5436'); // flanking cottages
      this.box(px + 8, py - 4, 6, 10, '#7a5436');
      this.roof(px - 15, py - 8, 8, 5, '#43342a');
      this.roof(px + 7, py - 8, 8, 5, '#43342a');
      this.box(px - 7, py - 12, 14, 18, '#86603f'); // central hall
      this.roof(px - 15, py - 10, 30, 5, '#33261a'); // wide roof
      this.roof(px - 8, py - 16, 16, 5, '#43342a'); // peak
      this.litWindow(px - 5, py - 9, 3, 4);
      this.litWindow(px + 2, py - 9, 3, 4);
      this.door(px - 1, py - 1, 2, 6, '#c2a14d');
    } else if (pop < 1000) {
      // Manor: grand estate with corner towers
      this.box(px - 16, py - 8, 32, 16, '#a9855f');
      this.box(px - 18, py - 14, 6, 18, '#6a4c38'); // towers
      this.box(px + 12, py - 14, 6, 18, '#6a4c38');
      this.roof(px - 19, py - 18, 8, 5, '#33261a');
      this.roof(px + 11, py - 18, 8, 5, '#33261a');
      this.box(px - 10, py - 14, 20, 22, '#86603f'); // central block
      this.roof(px - 17, py - 12, 34, 5, '#33261a');
      this.roof(px - 11, py - 18, 22, 5, '#43342a');
      this.litWindow(px - 7, py - 10, 3, 4);
      this.litWindow(px + 4, py - 10, 3, 4);
      this.litWindow(px - 7, py - 2, 3, 4);
      this.litWindow(px + 4, py - 2, 3, 4);
      this.door(px - 2, py - 4, 4, 8, '#c2a14d');
    } else {
      // Castle: fortified keep with battlements
      this.box(px - 18, py - 10, 36, 18, '#787064'); // curtain wall
      this.box(px - 12, py - 18, 24, 26, '#88806f'); // keep
      for (let bx = -16; bx <= 12; bx += 4) this.box(px + bx, py - 13, 3, 4, '#5f594c');
      for (let bx = -10; bx <= 8; bx += 4) this.box(px + bx, py - 21, 3, 4, '#5f594c');
      this.litWindow(px - 8, py - 14, 3, 4);
      this.litWindow(px + 5, py - 14, 3, 4);
      this.litWindow(px - 8, py - 5, 3, 4);
      this.litWindow(px + 5, py - 5, 3, 4);
      this.door(px - 2, py - 4, 4, 12, '#c2a14d'); // gate
      g.fillStyle = '#241a12'; g.fillRect(px - 1, py - 6, 2, 3); // portcullis
    }
    // Selection glow: a soft additive gold bloom under the settlement plus a
    // gentle ring — Civ5-style tile feedback rather than a hard box.
    if (selected) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      const bloom = g.createRadialGradient(px, py - 4, 4, px, py - 4, 30);
      bloom.addColorStop(0, 'rgba(232,210,122,0.32)');
      bloom.addColorStop(1, 'rgba(232,210,122,0)');
      g.fillStyle = bloom;
      g.beginPath();
      g.arc(px, py - 4, 30, 0, Math.PI * 2);
      g.fill();
      g.restore();
      g.strokeStyle = 'rgba(232,210,122,0.85)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(px, py + 9, 20, 8, 0, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 1;
    }
  }

  private static readonly WATER_BIOMES = new Set(['sea', 'lake', 'river']);

  /**
   * A reusable hex-shaped alpha mask drawn once and blitted per tile (there are
   * up to REGION_N² tiles, so a per-hex CanvasGradient is too costly). Its local
   * hex is centred at (hw, size) so blitting at (bx, by) — the tile's bounding-box
   * origin in drawTerrain — lands it exactly over the tile.
   *   'ao'    — transparent centre → soft dark rim: a lit dome, so flat polygon
   *             tiles gain depth and the grid stops reading as a wireframe.
   *   'coast' — transparent deep centre → bright turquoise foam rim: shallows that
   *             hug the coastline instead of a flat one-alpha wash.
   */
  private hexMask(kind: 'ao' | 'coast', size: number): HTMLCanvasElement {
    const key = `${kind}|${Math.round(size * 10)}`;
    const cached = this.hexMaskCache.get(key);
    if (cached) return cached;
    const hw = (Math.sqrt(3) * size) / 2;
    const w = Math.max(1, Math.ceil(hw * 2));
    const h = Math.max(1, Math.ceil(size * 2));
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d');
    if (c) {
      const cx = hw;
      const cy = size;
      const corners = hexCorners(cx, cy, size);
      traceHexPath(c, corners);
      c.clip();
      const grad = c.createRadialGradient(cx, cy, size * 0.2, cx, cy, size);
      if (kind === 'ao') {
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.72, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.14)');
      } else {
        grad.addColorStop(0, 'rgba(86,150,160,0)');
        grad.addColorStop(0.55, 'rgba(86,150,160,0.18)');
        grad.addColorStop(1, 'rgba(150,210,205,0.5)');
      }
      c.fillStyle = grad;
      c.fillRect(0, 0, w, h);
    }
    this.hexMaskCache.set(key, cv);
    return cv;
  }

  /** Base fill for a biome at an elevation — the single source of truth shared
   *  by the main tile fill and the biome edge blend. Sea uses a continuous
   *  depth ramp (bathymetry); every land biome returns a hex literal. */
  private biomeBaseColor(biome: string, elevation: number): string {
    switch (biome) {
      case 'sea': {
        // Open ocean sinks toward near-black blue, shelf water lifts to teal.
        const d = Math.max(0, Math.min(1, -elevation / 0.6));
        return `rgb(${Math.round(40 - 22 * d)},${Math.round(64 - 30 * d)},${Math.round(86 - 36 * d)})`;
      }
      case 'lake':      return '#2e4a5c';
      case 'river':     return '#36586e';
      case 'marsh':     return '#39503e';
      case 'plains':    return elevation > 0.35 ? '#4e5e40' : '#46563a';
      case 'forest':    return elevation > 0.4 ? '#2e4826' : '#33502c';
      case 'hills':     return elevation > 0.6 ? '#6a6450' : '#5a5742';
      case 'mountains': return elevation > 0.88 ? '#d0cec8' : elevation > 0.78 ? '#a8a49c' : '#7a7060';
      default:          return '#46563a';
    }
  }

  /** Two stepped bands (depth-toward-centre, alpha) for the biome edge blend —
   *  a dithered gradient in the GDD's tolerance, not smooth AA mush. */
  private static readonly BLEND_BANDS: readonly (readonly [number, number])[] = [
    [0.34, 0.10],
    [0.16, 0.13],
  ];

  /** The generated land itself, in hexagonal tiles: this map IS the world. */
  private drawTerrain(g: CanvasRenderingContext2D, W: number, H: number): void {
    const { region } = this;
    const map = region.map;
    const N = REGION_N;
    const m = 60;
    const { size, ox, oy } = hexLayoutParams(W, H, N, m);
    // Hex bounding box half-dimensions (for texture positioning)
    const hw = Math.sqrt(3) * size / 2; // half-width of hex
    const isWater = (x: number, y: number): boolean =>
      x >= 0 && y >= 0 && x < N && y < N && RegionView.WATER_BIOMES.has(map.at(x, y).biome);
    const touchesLand = (x: number, y: number): boolean =>
      hexNeighbors(x, y).some(([nc, nr]) => !isWater(nc, nr));
    const touchesWater = (x: number, y: number): boolean =>
      hexNeighbors(x, y).some(([nc, nr]) => isWater(nc, nr));
    // Per-biome painted-tile lookup, resolved once per rebuild instead of once
    // per hex; a degenerate 0-width decode normalizes to null HERE so the draw
    // and the procedural-detail suppression below can never disagree.
    const artCache = new Map<string, HTMLImageElement | null>();
    const artFor = (biome: string): HTMLImageElement | null => {
      let img = artCache.get(biome);
      if (img === undefined) {
        img = this.assets.get(`terrain-${biome}`);
        if (img && img.width <= 0) img = null;
        artCache.set(biome, img);
      }
      return img;
    };
    // Edge-blend fill styles per base colour (≤10 land literals × 2 bands),
    // so the blend pass never re-parses hex strings per edge.
    const blendStyles = new Map<string, string[]>();
    const blendStylesFor = (hex: string): string[] => {
      let s = blendStyles.get(hex);
      if (!s) {
        const { r, g: gg, b } = hexToRgb(hex);
        s = RegionView.BLEND_BANDS.map(([, a]) => `rgba(${r},${gg},${b},${a})`);
        blendStyles.set(hex, s);
      }
      return s;
    };
    // Layer policy for painted tiles: DATA-DRIVEN overlays (coast shallows,
    // beach lip, hillshade, snow caps, ambient occlusion, contours, ghost
    // waterline) draw OVER art — they visualize sim state the texture cannot
    // know. DECORATIVE noise (dither, edge blend, canopy, tufts, scree, peak
    // facet, reeds) is suppressed by art — the painting supplies its own detail.
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const c = map.at(x, y);
        const { x: cx, y: cy } = hexCenter(x, y, size, ox, oy);
        if (this.culled(cx, cy, size)) continue;
        const corners = hexCorners(cx, cy, size);
        // Bounding box for texture details (stays within the hex)
        const bx = cx - hw;
        const by = cy - size;
        const bw = hw * 2;
        const bh = size * 2;
        // Base biome colour
        g.fillStyle = this.biomeBaseColor(c.biome, c.elevation);
        fillHexPath(g, corners);

        const water = RegionView.WATER_BIOMES.has(c.biome);
        // Painted-terrain override seam (`terrain-<biome>`): when the registry
        // holds a tile texture, clip it into the hex over the base fill. A
        // deterministic per-hex source offset samples a different sub-rect of
        // the texture each tile, so one image never reads as wallpaper. Absent
        // art → null → every procedural detail below is untouched.
        const tileArt = water ? null : artFor(c.biome);
        if (tileArt) {
          const th = (x * 92837111 ^ y * 689287499) >>> 0;
          const sw = Math.max(1, tileArt.width >> 1);
          const sh = Math.max(1, tileArt.height >> 1);
          const sx = th % Math.max(1, tileArt.width - sw);
          const sy = (th >>> 8) % Math.max(1, tileArt.height - sh); // >>> : th ≥ 2^31 must not go negative
          g.save();
          traceHexPath(g, corners);
          g.clip();
          g.imageSmoothingEnabled = true; // painterly art wants smoothing (restore() reverts)
          g.drawImage(tileArt, sx, sy, sw, sh, bx, by, bw, bh);
          g.restore();
        }
        // Coastal shallows: water cells touching land get a turquoise foam rim
        // that fades to deep water at the tile centre — a real coastline, the
        // single biggest readability win. Reusable hex mask, not a per-hex fill.
        if (water && c.biome !== 'river' && touchesLand(x, y)) {
          g.drawImage(this.hexMask('coast', size), bx, by);
        }
        // Beach: land cells at the water's edge get a sandy lip.
        if (!water && c.biome !== 'mountains' && touchesWater(x, y)) {
          g.fillStyle = 'rgba(196,176,120,0.5)';
          fillHexPath(g, corners);
        }
        // Subtle per-cell dither so flat colour bands read as textured ground.
        // (Painted tile art carries its own variation — skip when overridden.)
        if (!water && !tileArt) {
          const hash = (x * 73856093 ^ y * 19349663) >>> 0;
          const n = (hash % 5) - 2; // -2..+2
          if (n !== 0) {
            g.fillStyle = n > 0 ? `rgba(255,250,235,${n * 0.018})` : `rgba(0,0,0,${-n * 0.022})`;
            fillHexPath(g, corners);
          }
        }

        // Biome edge blend: each differing LAND neighbour bleeds its base
        // colour across the shared edge in two stepped bands, melting the
        // hard polygon seam into a dithered transition. Water boundaries stay
        // crisp (the shallows/beach rims already own the coastline), and a
        // painted tile stays unmuddied — flat procedural wedges over artwork
        // would tint it with hues the painting may not contain.
        if (!water && !tileArt) {
          for (let d = 0; d < 6; d++) {
            const [bnc, bnr] = hexNeighborDir(x, y, d);
            if (bnc < 0 || bnr < 0 || bnc >= N || bnr >= N) continue;
            const nCell = map.at(bnc, bnr);
            if (nCell.biome === c.biome || RegionView.WATER_BIOMES.has(nCell.biome)) continue;
            const styles = blendStylesFor(this.biomeBaseColor(nCell.biome, nCell.elevation));
            const e0 = corners[d];
            const e1 = corners[(d + 1) % 6];
            for (let bi = 0; bi < RegionView.BLEND_BANDS.length; bi++) {
              const depth = RegionView.BLEND_BANDS[bi][0];
              g.fillStyle = styles[bi];
              g.beginPath();
              g.moveTo(e0.x, e0.y);
              g.lineTo(e1.x, e1.y);
              g.lineTo(e1.x + (cx - e1.x) * depth, e1.y + (cy - e1.y) * depth);
              g.lineTo(e0.x + (cx - e0.x) * depth, e0.y + (cy - e0.y) * depth);
              g.closePath();
              g.fill();
            }
          }
        }

        // Elevation-based lighting: NW-lit hillshade using hex-direction neighbors.
        const [nwCol, nwRow] = hexNeighborDir(x, y, 4); // dir 4 = NW
        const [wCol,  wRow]  = hexNeighborDir(x, y, 3); // dir 3 = W
        const north = (nwRow >= 0 && nwCol >= 0 && nwCol < N) ? map.at(nwCol, nwRow).elevation : c.elevation;
        const west  = (wCol  >= 0 && wRow  >= 0 && wCol  < N) ? map.at(wCol,  wRow).elevation  : c.elevation;
        const shade = (c.elevation - north + c.elevation - west) * 1.4;
        if (shade > 0.01) {
          g.fillStyle = `rgba(255,255,240,${Math.min(0.32, shade * 0.6)})`;
          fillHexPath(g, corners);
        } else if (shade < -0.01) {
          g.fillStyle = `rgba(0,0,0,${Math.min(0.30, -shade * 0.5)})`;
          fillHexPath(g, corners);
        }

        // Texture details whose fillRects could bleed past the hex bounding box
        // are drawn inside a hex clip region (save once per biome that needs it).
        const needsClip = c.biome === 'forest' || c.biome === 'plains' || c.biome === 'hills';
        if (needsClip) {
          g.save();
          traceHexPath(g, corners);
          g.clip();
        }
        // Forest canopy: layered round crowns — shadow disc, mid crown, lit
        // NW cap — so woodland reads as painted foliage, not square confetti.
        // Skipped when a painted tile texture already supplies the canopy.
        if (c.biome === 'forest' && !tileArt) {
          const r = Math.max(2, bw * 0.24);
          for (let k = 0; k < 4; k++) {
            const h = (x * 17 + y * 31 + k * 101) >>> 0;
            const tx = bx + r + (h % Math.max(1, Math.floor(bw - r * 2)));
            const ty = by + r + ((h >> 4) % Math.max(1, Math.floor(bh - r * 2)));
            g.fillStyle = 'rgba(14,30,12,0.5)';
            g.beginPath(); g.arc(tx + 1, ty + 2, r * 0.85, 0, Math.PI * 2); g.fill(); // ground shadow
            g.fillStyle = 'rgba(52,88,42,0.75)';
            g.beginPath(); g.arc(tx, ty, r * 0.8, 0, Math.PI * 2); g.fill(); // crown
            g.fillStyle = 'rgba(88,128,64,0.55)';
            g.beginPath(); g.arc(tx - r * 0.25, ty - r * 0.25, r * 0.45, 0, Math.PI * 2); g.fill(); // lit cap
          }
        }
        // Plains: sparse grass tufts for a meadow texture.
        if (c.biome === 'plains' && !tileArt && (x * 13 + y * 7) % 6 < 2) {
          g.fillStyle = 'rgba(120,134,78,0.4)';
          g.fillRect(bx + (x % 3) + 1, by + bh * 0.4, Math.max(1, bw * 0.18), Math.max(1, bh * 0.4));
        }
        // Hills: rounded scree stones with a lit edge instead of one flat square.
        if (c.biome === 'hills' && !tileArt && (x * 11 + y * 5) % 5 < 2) {
          const sx2 = bx + bw * 0.5;
          const sy2 = by + bh * 0.48;
          const sr = Math.max(1.5, bw * 0.12);
          g.fillStyle = 'rgba(40,36,28,0.4)';
          g.beginPath(); g.arc(sx2, sy2, sr, 0, Math.PI * 2); g.fill();
          g.beginPath(); g.arc(sx2 + sr * 1.4, sy2 + sr * 0.6, sr * 0.7, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(210,200,180,0.25)';
          g.beginPath(); g.arc(sx2 - sr * 0.3, sy2 - sr * 0.3, sr * 0.5, 0, Math.PI * 2); g.fill();
        }
        if (needsClip) g.restore();
        // Mountains: a faceted peak — lit NW face, shadowed SE face — over the
        // base grey, so ranges read as relief rather than flat stone plates.
        // One triangle per sign so the two faces always share the same ridge.
        if (c.biome === 'mountains' && !tileArt) {
          const pw2 = bw * 0.5;
          const ph2 = bh * 0.52;
          const apy = cy - ph2 * 0.5;
          const faces: readonly (readonly [number, string])[] = [
            [-1, 'rgba(235,232,225,0.3)'], // lit NW face
            [1, 'rgba(30,26,22,0.3)'],     // shadowed SE face
          ];
          for (const [sgn, fill] of faces) {
            g.fillStyle = fill;
            g.beginPath();
            g.moveTo(cx, apy);
            g.lineTo(cx + sgn * pw2 * 0.5, apy + ph2);
            g.lineTo(cx, apy + ph2 * 0.8);
            g.closePath();
            g.fill();
          }
        }
        // Mountain snow caps on highest peaks
        if (c.biome === 'mountains' && c.elevation > 0.82) {
          g.fillStyle = `rgba(230,230,240,${(c.elevation - 0.82) * 2.5})`;
          fillHexPath(g, corners);
        }
        // River glints: a static deterministic subset of river tiles carries a
        // bright wash. (This layer BAKES into the signature-gated mapCache, so
        // a frame term could never animate — it only re-rolled arbitrarily on
        // rebuild. Live water animation is drawWaterAnimation's job.)
        if (c.biome === 'river' && (x * 7 + y * 11) % 5 === 0) {
          g.fillStyle = 'rgba(180,220,240,0.22)';
          fillHexPath(g, corners);
        }
        // Marsh reeds texture (clipped separately to allow full-height strips)
        if (c.biome === 'marsh' && !tileArt && (x * 5 + y * 7) % 11 < 3) {
          g.save();
          traceHexPath(g, corners);
          g.clip();
          g.fillStyle = 'rgba(60,80,30,0.4)';
          g.fillRect(bx + bw * 0.3, by, Math.max(1, bw * 0.2), bh);
          g.restore();
        }
        // Ambient occlusion: a soft dark rim inside each land tile so the ground
        // reads as lit domes rather than flat polygons — the main de-diagram cue.
        if (!water) g.drawImage(this.hexMask('ao', size), bx, by);
      }
    }
    // Ghost waterline (GDD §8.2): a faint blue overlay on low-elevation coastal
    // land cells showing the projected 2100 flood zone.  Appears once the
    // sea-rise warning fires (warmingC ≥ 1.2°C) — "quiet dread as persistent UI."
    const showWaterline = this.region.seaRiseAnnounced || this.region.year >= 2030;
    if (showWaterline) {
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const c = map.at(x, y);
          if (RegionView.WATER_BIOMES.has(c.biome)) continue;
          if (c.elevation > 0.18) continue; // only low-lying coastal land
          if (!hexNeighbors(x, y).some(([nc, nr]) => nc >= 0 && nr >= 0 && nc < N && nr < N
              && RegionView.WATER_BIOMES.has(map.at(nc, nr).biome))) continue;
          const { x: cx, y: cy } = hexCenter(x, y, size, ox, oy);
          if (this.culled(cx, cy, size)) continue;
          const corners = hexCorners(cx, cy, size);
          g.fillStyle = 'rgba(30,110,220,0.22)';
          fillHexPath(g, corners);
          // Dashed blue border to mark the flood-zone edge
          g.strokeStyle = 'rgba(60,140,255,0.55)';
          g.lineWidth = 1;
          g.setLineDash([3, 3]);
          g.beginPath();
          g.moveTo(corners[5].x, corners[5].y);
          for (let i = 0; i < 6; i++) g.lineTo(corners[i].x, corners[i].y);
          g.closePath();
          g.stroke();
          g.setLineDash([]);
        }
      }
    }

    // Contour lines: draw shared hex edge when elevation crosses 0.2/0.4/0.6/0.8.
    // Check only directions 0/1/2 (E, SE, SW) so each edge is drawn once. Kept
    // faint — with per-tile ambient occlusion doing the depth work, these read as
    // gentle terracing rather than hard ink (less diagram, more terrain).
    g.strokeStyle = 'rgba(0,0,0,0.06)';
    g.lineWidth = 1;
    for (const level of [0.2, 0.4, 0.6, 0.8]) {
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const a = map.at(x, y).elevation;
          const { x: cx, y: cy } = hexCenter(x, y, size, ox, oy);
          if (this.culled(cx, cy, size)) continue;
          const corners = hexCorners(cx, cy, size);
          for (const d of [0, 1, 2] as const) {
            const [nc, nr] = hexNeighborDir(x, y, d);
            if (nc < 0 || nr < 0 || nc >= N || nr >= N) continue;
            const b2 = map.at(nc, nr).elevation;
            if ((a < level) !== (b2 < level)) {
              const p0 = corners[d];
              const p1 = corners[(d + 1) % 6];
              g.beginPath();
              g.moveTo(p0.x, p0.y);
              g.lineTo(p1.x, p1.y);
              g.stroke();
            }
          }
        }
      }
    }
    // border vignette so the map reads as a map
    g.strokeStyle = '#6e4a2f';
    g.lineWidth = 2;
    g.strokeRect(m - 4, m - 4, W - 2 * m + 8, H - 2 * m + 8);
  }

  /** The promotion-as-moment (GDD §2.2): name the State, choose its lean. */
  private drawCeremony(): void {
    const r = this.region;
    if (!r.ceremonyPending) {
      if (this.ceremonyOpen) {
        this.ceremonyOpen = false;
        this.ceremony.classList.add('hidden');
      }
      return;
    }
    if (this.ceremonyOpen) return; // already on screen
    this.ceremonyOpen = true;
    this.ceremony.classList.remove('hidden');
    const leans = (Object.keys(GOV_LEANS) as GovLean[])
      .map(
        (k) =>
          `<label class="lean-card"><input type="radio" name="lean" value="${k}" ${k === 'council' ? 'checked' : ''}>` +
          `<b>${GOV_LEANS[k].name}</b><br><span>${GOV_LEANS[k].desc}</span></label>`,
      )
      .join('');
    this.ceremony.innerHTML =
      `<div class="ceremony-box">` +
      `<h2>★ THE INCORPORATION ★</h2>` +
      `<p>${r.settlements.length} towns. ${r.totalPop()} citizens. The Regional Charter is drafted —<br>` +
      `all that remains is a name, and a way of ruling.</p>` +
      `<input id="state-name" type="text" maxlength="28" placeholder="Name your State…" value="The Valley State">` +
      `<div class="lean-row">${leans}</div>` +
      `<button id="proclaim-btn">Proclaim the State</button>` +
      `</div>`;
    this.ceremony.querySelector<HTMLButtonElement>('#proclaim-btn')!.onclick = () => {
      const name = this.ceremony.querySelector<HTMLInputElement>('#state-name')!.value;
      const lean = (this.ceremony.querySelector<HTMLInputElement>('input[name=lean]:checked')?.value ?? 'council') as GovLean;
      issue(r, 'completeIncorporation', name, lean);
      this.ceremonyOpen = false;
      this.ceremony.classList.add('hidden');
    };
  }

  private drawConvention(): void {
    if (!this.conventionOpen) return;
    if (this.conventionBuilt) return; // built once on open — never rebuild per-frame (would wipe the player's picks)
    this.conventionBuilt = true;
    const r = this.region;
    const notables = r.notables.filter((n) => n.alive);
    const notableOptions = (selected: number | null) =>
      `<option value="">— vacant —</option>` +
      notables.map((n) =>
        `<option value="${n.id}" ${n.id === selected ? 'selected' : ''}>${n.name} (${n.role})</option>`,
      ).join('');

    const govCards = GOV_TYPES.map((g) =>
      `<label class="lean-card"><input type="radio" name="gov-type" value="${g.id}" ${g.id === 'democracy' ? 'checked' : ''}>` +
      `<b>${g.name}</b><br><span>${g.legitimacySource}. Tax cap ${g.taxCap}%.` +
      (g.militiaBonus > 0 ? ` Militia +${g.militiaBonus}.` : '') + `</span></label>`,
    ).join('');

    const ministerRows = MINISTER_ROLES.map((mr) =>
      `<p><b>${mr.title}:</b> (${mr.bonus})<br>` +
      `<select class="minister-sel" data-role="${mr.id}">${notableOptions(r.ministers.find((m) => m.role === mr.id)?.notableId ?? null)}</select></p>`,
    ).join('');

    const suggestedName = r.stateName ? `Republic of ${r.stateName}` : 'New Republic';
    this.convention.classList.remove('hidden');
    const govFlavour: Record<string, string> = {
      democracy:  'The people\'s delegates take their seats. The ayes have it — sovereignty rests in the assembly.',
      republic:   'The republic assembles its citizens. Rome did not fall in a day; neither is it built in one.',
      junta:      'The generals enter the hall. Order before liberty — for now.',
      monarchy:   'The heir is presented to the gathered lords. Long may they reign.',
    };
    const flavourLine = govFlavour['democracy'] ?? 'The convention convenes.';
    this.convention.innerHTML =
      `<div class="ceremony-box">` +
      `<h2>★ THE CONSTITUTIONAL CONVENTION ★</h2>` +
      `<p class="conv-sub">` +
      `${Math.round(r.totalPop()).toLocaleString()} citizens · ${r.settlements.length} towns · ${r.researched.size} discoveries</p>` +
      `<p id="conv-flavour">${flavourLine}</p>` +
      `<p><b>Nation name:</b></p>` +
      `<input id="nation-name" type="text" maxlength="36" placeholder="Name the nation…" value="${suggestedName}">` +
      `<p><b>Form of government:</b></p>` +
      `<div class="lean-row">${govCards}</div>` +
      `<p><b>Appoint ministers:</b></p>` +
      ministerRows +
      `<button id="convention-proclaim-btn">Proclaim the Nation</button>` +
      `<button id="convention-cancel-btn" class="mini ml-8">Cancel</button>` +
      `</div>`;
    // Update the flavour line when the government pick changes — in place, without
    // rebuilding the modal (a rebuild would reset every field the player set).
    for (const radio of this.convention.querySelectorAll<HTMLInputElement>('input[name=gov-type]')) {
      radio.onchange = () => {
        const flavour = this.convention.querySelector<HTMLElement>('#conv-flavour');
        if (flavour) flavour.textContent = govFlavour[radio.value] ?? 'The convention convenes.';
      };
    }
    this.convention.querySelector<HTMLButtonElement>('#convention-proclaim-btn')!.onclick = () => {
      const name = (this.convention.querySelector<HTMLInputElement>('#nation-name')!.value || suggestedName).trim();
      const gov = (this.convention.querySelector<HTMLInputElement>('input[name=gov-type]:checked')?.value ?? 'democracy') as GovType;
      const assignments: Partial<Record<MinisterRoleId, number | null>> = {};
      for (const sel of this.convention.querySelectorAll<HTMLSelectElement>('.minister-sel')) {
        const role = sel.dataset.role as MinisterRoleId;
        assignments[role] = sel.value ? Number(sel.value) : null;
      }
      issue(r, 'proclaimNation', name, gov, assignments);
      this.conventionOpen = false;
      this.conventionBuilt = false;
      this.convention.classList.add('hidden');
      // The nation design screen follows the proclamation: economic system,
      // military doctrine, alliances — and the one sanctioned currency re-pick.
      if (r.nationProclaimed) {
        new DesignScreen().showNationDesign(r.currencySymbol, (design) => issue(r, 'applyNationDesign', design));
      }
    };
    this.convention.querySelector<HTMLButtonElement>('#convention-cancel-btn')!.onclick = () => {
      this.conventionOpen = false;
      this.conventionBuilt = false;
      this.convention.classList.add('hidden');
    };
  }

  /** 1 Jan 2100: the verdict on the modal, once (GDD §8.4). Dismissing it
   *  hands the country back — the sandbox runs on. */
  private drawCenturyReport(): void {
    const rep = this.region.centuryReport;
    if (!rep || this.centuryDismissed) {
      this.centuryModal.classList.add('hidden');
      return;
    }
    if (!this.centuryModal.classList.contains('hidden')) return; // already on screen
    this.centuryModal.classList.remove('hidden');
    const branchTitle =
      rep.branch === 'solarpunk' ? 'THE GARDEN CENTURY'
      : rep.branch === 'dystopia' ? 'THE NEON CENTURY'
      : rep.branch === 'drowned' ? 'THE DROWNED CENTURY' : 'THE CENTURY';
    const g = rep.grades;
    this.centuryModal.innerHTML =
      `<div class="ceremony-box">` +
      `<h2>1 JANUARY 2100 — THE CENTURY REPORT</h2>` +
      `<p class="insp-skills">${branchTitle}</p>` +
      `<p>${rep.verdict}</p>` +
      `<p>population <b>${rep.pop.toLocaleString()}</b> across <b>${rep.towns}</b> towns · ` +
      `GDP ` + formatCurrency(rep.gdp) + `/mo · treasury ` + formatCurrency(rep.treasury) + `</p>` +
      `<p>CO₂ <b>${rep.co2ppm} ppm</b> · warming <b>+${rep.warmingC}°C</b> · ` +
      `${rep.techs} discoveries · ${rep.laws} statutes · legitimacy ${rep.legitimacy}</p>` +
      `<p>stewardship <b>${g.stewardship}</b> · prosperity <b>${g.prosperity}</b> · ` +
      `liberty <b>${g.liberty}</b> · standing <b>${g.standing}</b></p>` +
      centuryGraphHtml(this.region.statsHistory) +
      `<p class="insp-skills">Endings are graded, not won. The country is still yours.</p>` +
      dynastyHtml(this.region) +
      `<button id="century-close-btn">Carry on</button>` +
      `</div>`;
    this.centuryModal.querySelector<HTMLButtonElement>('#century-close-btn')!.onclick = () => {
      this.centuryDismissed = true;
      this.centuryModal.classList.add('hidden');
    };
  }

  /** Win condition achieved: show once, "Play On" closes it (sandbox continues). */
  /** The century forks (GDD §3.2): when the era branch is first decided, give
   *  that pivotal moment a modal — the same weight as Incorporation, the
   *  Convention, and the win paths, instead of a single log line. */
  private drawEraModal(): void {
    const branch = this.region.eraBranch;
    if (!branch || this.eraDismissed) { this.eraModal.classList.add('hidden'); return; }
    // Hold the reveal back while the era cinematic is still playing.
    if (this.cinematic?.kind === 'era') { this.eraModal.classList.add('hidden'); return; }
    if (!this.eraModal.classList.contains('hidden')) return; // already showing — leave it until dismissed
    this.eraModal.classList.remove('hidden');
    const titles: Record<string, string> = {
      solarpunk: '☀ THE GARDEN CENTURY',
      dystopia:  '▮ THE NEON CENTURY',
      drowned:   '≈ THE DROWNED CENTURY',
    };
    const descs: Record<string, string> = {
      solarpunk: 'The grid hums clean, the squares are planted, and the waterline stays on the chart, not in the streets. Your people built a century worth living in.',
      dystopia:  'The economy roars behind checkpoints and billboards. The people queue in its light and grumble in its shadow — order bought at a price.',
      drowned:   'The projection is now a tide table. The sea is coming for the coastal streets — wall them, move them, or mourn them. The reckoning of a warmer world.',
    };
    const subtitle: Record<string, string> = {
      solarpunk: 'Democratic · content · the sky held clean',
      dystopia:  'Prosperous · unfree or unhappy · the lights never dim',
      drowned:   `Projected warming ≥ 2.3°C · the coast pays the bill`,
    };
    this.eraModal.innerHTML =
      `<div class="win-modal-box">` +
      `<h1>${titles[branch] ?? 'A NEW CENTURY'}</h1>` +
      `<p class="win-path">${BRANCH_YEAR} · ${subtitle[branch] ?? ''}</p>` +
      `<p class="win-details">${descs[branch] ?? ''}</p>` +
      `<button class="win-modal-btn" id="era-face-on">Face the Century</button>` +
      `</div>`;
    this.eraModal.querySelector<HTMLButtonElement>('#era-face-on')!.onclick = () => {
      this.eraDismissed = true;
      this.eraModal.classList.add('hidden');
    };
  }

  private drawWinModal(): void {
    const wc = this.region.winCondition;
    if (!wc || this.winDismissed) {
      this.winModal.classList.add('hidden');
      return;
    }
    // Hold the reveal back while the victory cinematic is still playing.
    if (this.cinematic?.kind === 'win') { this.winModal.classList.add('hidden'); return; }
    if (!this.winModal.classList.contains('hidden')) return;
    this.winModal.classList.remove('hidden');
    const pathLabels: Record<string, string> = {
      unification: '★ UNIFICATION ★',
      legacy:      '★ LEGACY ★',
      domination:  '★ DOMINATION ★',
      solarpunk:   '★ THE GARDEN PATH ★',
    };
    const pathDescs: Record<string, string> = {
      unification: 'One nation, one flag, one future. The region bends to your will.',
      legacy:      'History will speak your name. Three of four century grades are A — a dynasty built to last.',
      domination:  'The century closes and only your nation stands sovereign, unchallenged.',
      solarpunk:   'The grid hums clean. The gardens hold. A better century begins here.',
    };
    this.winModal.innerHTML =
      `<div class="win-modal-box">` +
      `<h1>${pathLabels[wc.path] ?? '★ VICTORY ★'}</h1>` +
      `<p class="win-path">${wc.path} · ${wc.year}</p>` +
      `<p class="win-details">${pathDescs[wc.path] ?? ''}<br><em>${wc.details}</em></p>` +
      `<button class="win-modal-btn" id="win-play-on">Play On</button>` +
      `</div>`;
    this.winModal.querySelector<HTMLButtonElement>('#win-play-on')!.onclick = () => {
      this.winDismissed = true;
      this.winModal.classList.add('hidden');
    };
  }

  /** Per-cinematic palette + title: a painterly sky and a headline that the
   *  animated scene is built around. Keyed by era branch or victory path. */
  private cinematicTheme(kind: 'era' | 'win', variant: string): {
    sky: [string, string]; accent: string; title: string; subtitle: string;
  } {
    const eraThemes: Record<string, { sky: [string, string]; accent: string; title: string; subtitle: string }> = {
      solarpunk: { sky: ['#0b3d2e', '#7fd6a8'], accent: '#ffe08a', title: 'THE GARDEN CENTURY', subtitle: 'The grid hums clean' },
      dystopia:  { sky: ['#1a0e2a', '#5a2a6a'], accent: '#ff3da6', title: 'THE NEON CENTURY',   subtitle: 'Order, bought at a price' },
      drowned:   { sky: ['#0a1c33', '#26618a'], accent: '#7fd3ff', title: 'THE DROWNED CENTURY', subtitle: 'The sea comes for the coast' },
    };
    const winThemes: Record<string, { sky: [string, string]; accent: string; title: string; subtitle: string }> = {
      unification: { sky: ['#241405', '#a9711f'], accent: '#ffd874', title: 'UNIFICATION', subtitle: 'One nation, one flag' },
      legacy:      { sky: ['#1a1733', '#4a3f8a'], accent: '#ffe08a', title: 'LEGACY',      subtitle: 'History speaks your name' },
      domination:  { sky: ['#2a0808', '#7a1f1f'], accent: '#ff6a4a', title: 'DOMINATION',  subtitle: 'Sovereign, unchallenged' },
      solarpunk:   { sky: ['#0b3d2e', '#7fd6a8'], accent: '#ffe08a', title: 'THE GARDEN PATH', subtitle: 'A better century begins' },
    };
    const table = kind === 'era' ? eraThemes : winThemes;
    return table[variant] ?? { sky: ['#10131a', '#2a3550'], accent: '#e8d27a', title: 'A NEW CENTURY', subtitle: '' };
  }

  /** The cinematic: a frame-driven fullscreen canvas sequence that plays once
   *  when the century forks or a victory lands, before the DOM modal reveals.
   *  Tasteful and screen-space; a click (handled in click()) skips it. */
  private drawCinematic(W: number, H: number): void {
    if (!this.cinematic) return;
    const { kind, variant, startFrame } = this.cinematic;
    const elapsed = this.frame - startFrame;
    const dur = RegionView.CINEMATIC_FRAMES;
    if (elapsed >= dur) { this.cinematic = null; return; }
    const t = elapsed / dur; // 0..1 progress
    const g = this.g;
    const theme = this.cinematicTheme(kind, variant);

    g.save();
    // Sky: a vertical gradient that lightens as the scene resolves.
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, theme.sky[0]);
    sky.addColorStop(1, theme.sky[1]);
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    const cx = W / 2;
    const horizon = H * 0.62;

    // ---- Per-variant foreground motif ----
    if (variant === 'solarpunk') {
      // A sun rising over the horizon, with drifting pollen motes.
      const sunY = horizon - (H * 0.28) * Math.min(1, t * 1.4);
      const glow = g.createRadialGradient(cx, sunY, 0, cx, sunY, H * 0.4);
      glow.addColorStop(0, 'rgba(255,224,138,0.9)');
      glow.addColorStop(1, 'rgba(255,224,138,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);
      g.fillStyle = theme.accent;
      g.beginPath(); g.arc(cx, sunY, H * 0.08, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 40; i++) {
        const px = (i * 97 + this.frame * 0.6) % W;
        const py = (i * 53 + this.frame * 0.4) % H;
        g.fillStyle = `rgba(180,240,200,${0.2 + 0.2 * Math.sin(this.frame * 0.05 + i)})`;
        g.fillRect(px, py, 2, 2);
      }
    } else if (variant === 'dystopia' || variant === 'domination') {
      // A skyline silhouette with sweeping searchlights.
      g.fillStyle = 'rgba(0,0,0,0.55)';
      for (let i = 0; i < 14; i++) {
        const bw = W / 14;
        const bx = i * bw;
        const bh = (H * 0.18) + ((i * 137) % Math.floor(H * 0.28));
        g.fillRect(bx + 2, horizon - bh, bw - 4, bh + (H - horizon));
        // window glints
        for (let wy = horizon - bh + 6; wy < horizon; wy += 10) {
          if ((i + wy) % 3 === 0) { g.fillStyle = `rgba(255,90,180,0.5)`; g.fillRect(bx + 6, wy, 3, 3); g.fillStyle = 'rgba(0,0,0,0.55)'; }
        }
      }
      const beam = (this.frame * 0.02);
      for (let b = 0; b < 2; b++) {
        const ang = -Math.PI / 2 + Math.sin(beam + b * 2) * 0.6;
        g.strokeStyle = `rgba(255,61,166,${0.18 + 0.1 * Math.sin(beam)})`;
        g.lineWidth = 28;
        g.beginPath(); g.moveTo(cx + (b ? 120 : -120), H); g.lineTo(cx + Math.cos(ang) * H, H + Math.sin(ang) * H); g.stroke();
      }
    } else if (variant === 'drowned') {
      // A rising waterline with rain streaks.
      const waterY = H - (H * 0.5) * Math.min(1, t * 1.2);
      g.fillStyle = 'rgba(20,70,110,0.7)';
      g.fillRect(0, waterY, W, H - waterY);
      for (let i = 0; i < 6; i++) {
        const ry = waterY + Math.sin(this.frame * 0.06 + i) * 4 + i * 3;
        g.strokeStyle = `rgba(180,220,255,${0.15 - i * 0.02})`;
        g.lineWidth = 1; g.beginPath(); g.moveTo(0, ry); g.lineTo(W, ry); g.stroke();
      }
      for (let i = 0; i < 80; i++) {
        const px = (i * 71 + this.frame * 6) % W;
        const py = (i * 113 + this.frame * 14) % H;
        g.strokeStyle = 'rgba(200,225,255,0.25)';
        g.beginPath(); g.moveTo(px, py); g.lineTo(px - 2, py + 8); g.stroke();
      }
    } else {
      // unification / legacy: expanding rings + golden motes around a banner.
      for (let r = 0; r < 4; r++) {
        const rad = ((this.frame * 2 + r * 60) % (H * 0.6));
        g.strokeStyle = `rgba(255,216,116,${0.25 * (1 - rad / (H * 0.6))})`;
        g.lineWidth = 2; g.beginPath(); g.arc(cx, horizon, rad, 0, Math.PI * 2); g.stroke();
      }
      // a simple rising banner
      const bannerY = horizon - (H * 0.2) * Math.min(1, t * 1.5);
      g.fillStyle = theme.accent;
      g.fillRect(cx - 30, bannerY, 60, 80);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(cx - 30, bannerY + 26, 60, 14);
      for (let i = 0; i < 30; i++) {
        const px = cx + Math.cos(i * 1.7 + this.frame * 0.03) * (60 + i * 6);
        const py = horizon - Math.abs(Math.sin(i * 1.1 + this.frame * 0.04)) * (i * 5);
        g.fillStyle = `rgba(255,224,138,${0.4})`;
        g.fillRect(px, py, 2, 2);
      }
    }

    // ---- Title: fade in over the first third, hold, then prompt ----
    const titleAlpha = Math.min(1, Math.max(0, (t - 0.15) / 0.25));
    g.textAlign = 'center';
    g.fillStyle = `rgba(255,255,255,${titleAlpha})`;
    g.font = `bold ${Math.round(H * 0.06)}px serif`;
    g.fillText(theme.title, cx, horizon + H * 0.16);
    g.fillStyle = `rgba(255,255,255,${titleAlpha * 0.75})`;
    g.font = `${Math.round(H * 0.025)}px serif`;
    g.fillText(theme.subtitle, cx, horizon + H * 0.16 + H * 0.05);

    // Letterbox bars for the cinematic feel.
    g.fillStyle = '#000';
    const bar = H * 0.08;
    g.fillRect(0, 0, W, bar);
    g.fillRect(0, H - bar, W, bar);

    // Opening fade-from-black and a closing "click to continue" hint.
    if (t < 0.12) { g.fillStyle = `rgba(0,0,0,${1 - t / 0.12})`; g.fillRect(0, 0, W, H); }
    if (t > 0.75) {
      g.fillStyle = `rgba(255,255,255,${0.4 + 0.3 * Math.sin(this.frame * 0.1)})`;
      g.font = `${Math.round(H * 0.02)}px monospace`;
      g.fillText('click to continue', cx, H - bar - 16);
    }
    g.restore();
    g.textAlign = 'left';
  }

  /** The post-2100 epilogue scroll (GDD §8.5): once a few legacy beats have
   *  accumulated after the Century Report, gather them into one narrative. */
  private drawEpilogueModal(): void {
    const r = this.region;
    const beats = r.year >= 2100 ? r.epilogueBeats() : [];
    if (r.epilogueShown || beats.length < 3) {
      this.epilogueModal.classList.add('hidden');
      return;
    }
    if (!this.epilogueModal.classList.contains('hidden')) return; // already on screen
    this.epilogueModal.classList.remove('hidden');
    const branchTitle =
      r.eraBranch === 'solarpunk' ? 'THE GARDEN ENDURES'
      : r.eraBranch === 'dystopia' ? 'THE NEON ENDURES'
      : r.eraBranch === 'drowned' ? 'THE WATERS RISE' : 'THE YEARS ROLL ON';
    const beatHtml = beats
      .map((b) => `<p class="ep-beat${b.kind === 'good' ? ' ep-beat-good' : b.kind === 'bad' ? ' ep-beat-bad' : ''}">${b.text}</p>`)
      .join('');
    this.epilogueModal.innerHTML =
      `<div class="ceremony-box">` +
      `<h2>EPILOGUE · ${r.year} — ${branchTitle}</h2>` +
      `<p class="insp-skills">The century closed, but the story did not. What your choices wrote into the decades after:</p>` +
      beatHtml +
      `<p class="insp-skills">The sandbox is yours for as long as you care to play.</p>` +
      `<button id="epilogue-close-btn">Close the chapter</button>` +
      `</div>`;
    this.epilogueModal.querySelector<HTMLButtonElement>('#epilogue-close-btn')!.onclick = () => {
      r.epilogueShown = true;
      this.epilogueModal.classList.add('hidden');
    };
  }

  /** Show recruitment modal for unit types (GDD §7.1). */
  private showRecruitmentModal(): void {
    const r = this.region;
    const w = r.playerWar;
    if (!w) return;
    const types: ArmyUnitType[] = ['militia', 'cavalry', 'artillery'];
    const rows = types.map((t) => {
      const def = UNIT_TYPES[t];
      return `<p><b>${t}</b> — £${def.recruitCost}/unit · power ${def.powerPerUnit} · ${def.trainingDays}d training · ${def.supplyCost}/day supply
        <input type="number" min="1" max="100" value="5" id="recruit-${t}-count" class="num-input-sm">
        <button class="mini" id="recruit-${t}-btn">recruit</button></p>`;
    }).join('');
    this.recruitmentModal.innerHTML = `<div class="ceremony-content"><h2>Recruit Army Units</h2><p>Treasury: <b>${formatCurrency(r.treasury)}</b></p>${rows}<button id="recruit-close-btn">Done</button></div>`;
    this.recruitmentModal.classList.remove('hidden');
    this.recruitmentModal.querySelector<HTMLButtonElement>('#recruit-close-btn')!.onclick = () => {
      this.recruitmentModal.classList.add('hidden');
    };
    for (const t of types) {
      this.recruitmentModal.querySelector<HTMLButtonElement>(`#recruit-${t}-btn`)!.onclick = () => {
        const count = parseInt(this.recruitmentModal.querySelector<HTMLInputElement>(`#recruit-${t}-count`)!.value) || 0;
        issue(r, 'recruitUnits', t, count);
        this.showRecruitmentModal(); // refresh modal
      };
    }
  }

  /** Media & Press sub-section within the Politics tab (GDD §8.3, Phase 12). */
  mediaPressSectionHtml(): string {
    const r = this.region;
    const reachLabel: Record<string, string> = {
      word_of_mouth: 'Word of Mouth',
      press: 'Press',
      radio: 'Radio',
      television: 'Television',
      internet: 'Internet',
      algorithmic: 'Algorithmic',
    };

    const bar = (val: number, max: number, cls: string) => {
      const pct = Math.round((val / max) * 100);
      const filled = Math.round(pct / 10);
      const empty = 10 - filled;
      return `<span class="${cls}">${'█'.repeat(filled)}${'░'.repeat(empty)}</span> ${Math.round(val)} ${toneGlyph(cls)}`;
    };

    const pfPct = Math.round(r.pressFreedom);
    const pfCol = r.pressFreedom >= 65 ? 'c-good' : r.pressFreedom <= 35 ? 'c-bad' : 'c-warn';
    const cgPct = Math.round(r.credibilityGap);
    const cgCol = cgPct >= 60 ? 'c-bad' : cgPct >= 30 ? 'c-warn' : 'c-good';
    const polPct = (r.polarization * 100).toFixed(0);

    const canCensor = r.stateProclaimed && r.politicalCapital >= 15;
    const canLiberalise = r.stateProclaimed && r.politicalCapital >= 15;
    const canPlatformReg = !r.platformRegulationEnacted && r.has('digital_economy') && r.politicalCapital >= 20;
    const canPublicMedia = !r.publicMediaFunded && r.stateProclaimed && r.politicalCapital >= 25;
    const canMediaLiteracy = !r.mediaLiteracyInvested && r.treasury >= r.gdpLastMonth * 0.05;

    const misEraLine = r.misinformationEra
      ? `<p class="t-10 c-warn">Algorithmic misinformation era active</p>`
      : '';
    const criticalGap = r.credibilityGap > 60
      ? `<p class="t-10 c-bad">&#9888; Credibility gap critical — legitimacy collapse risk</p>`
      : '';

    const countersHtml = r.misinformationEra ? (
      `<p class="insp-skills t-10">COUNTER-MEASURES</p>` +
      `<p>` +
      `<button class="mini" id="media-platform-reg" ${canPlatformReg ? '' : 'disabled'} title="Reduces polarization growth 0.005/month. Requires Digital Economy tech (20 PC).">` +
        `Platform Regulation${r.platformRegulationEnacted ? ' ✓' : ' [20 PC]'}` +
      `</button> ` +
      `<button class="mini" id="media-public-media" ${canPublicMedia ? '' : 'disabled'} title="Credibility gap decays 2x faster. 0.8% GDP/month upkeep (25 PC).">` +
        `Public Media${r.publicMediaFunded ? ' ✓' : ' [25 PC]'}` +
      `</button>` +
      `</p>` +
      `<p>` +
      `<button class="mini" id="media-literacy" ${canMediaLiteracy ? '' : 'disabled'} title="Polarization -0.15 after 15-year lag. Costs 5% GDP upfront.">` +
        `Media Literacy${r.mediaLiteracyInvested ? (r.mediaLiteracyApplied ? ' ✓' : ` (${r.mediaLiteracyYear + 15})`) : ' [5% GDP]'}` +
      `</button>` +
      `</p>`
    ) : '';

    return `<p class="insp-skills">MEDIA &amp; PRESS</p>` +
      `<p class="t-10">Media Reach: <b>${reachLabel[r.mediaReach] ?? r.mediaReach}</b> · Era: ${r.year}</p>` +
      misEraLine +
      `<div class="bar-row" title="Press Freedom: above 65 = free press, below 35 = controlled">` +
        `<span class="row-label-80 t-10">Press Freedom</span>` +
        `<span class="t-10">${bar(pfPct, 100, pfCol)}</span>` +
      `</div>` +
      `<p>` +
        `<button class="mini" id="media-censor" ${canCensor ? '' : 'disabled'} title="−20 press freedom (15 PC). Merchants −10, Landowners +10.">Censor −20</button> ` +
        `<button class="mini" id="media-liberalise" ${canLiberalise ? '' : 'disabled'} title="+20 press freedom (15 PC). Merchants +5.">Liberalise +20</button>` +
      `</p>` +
      `<div class="bar-row" title="Credibility Gap: high values risk a legitimacy collapse when a crisis hits">` +
        `<span class="row-label-80 t-10">Cred. Gap</span>` +
        `<span class="t-10">${bar(cgPct, 100, cgCol)}</span>` +
      `</div>` +
      criticalGap +
      `<p class="t-10">Polarization: <b>${polPct}%</b>${r.misinformationEra ? ` · Opinion vel: ×${r.opinionVelocity().toFixed(1)}` : ''}</p>` +
      countersHtml;
  }

  /** Phase 18: Render the advisor briefs panel (GDD §8.7). */
  advisorBriefsHtml(): string {
    const r = this.region;
    if (!r.nationProclaimed || r.advisorBriefs.length === 0) return '';
    const rows = r.advisorBriefs.map((brief) => {
      const date = `${Math.floor(brief.day / 365) + 1900}`;
      return `<p class="insp-skills my-2"><b>[${brief.portfolio}]</b> ${brief.message} <span class="c-dim">(${date})</span></p>`;
    }).join('');
    return `<p class="insp-skills">ADVISOR BRIEFS</p>` +
      `<div class="brief-box">` +
      rows +
      `</div>` +
      `<p><button class="mini" id="dismiss-briefs-btn">Dismiss all</button></p>`;
  }

  /** Force the panel to rebuild its HTML on the next frame (called after game actions). */
  private refreshPanel(): void {
    this.lastPanelBuildFrame = -999;
  }

  private updateTopBar(): void {
    if (this.frame - this.lastTopBarFrame < 8) return;
    this.lastTopBarFrame = this.frame;
    const r = this.region;
    // Calendar runs on the actual in-game era (1919→…), not a raw offset.
    const year = r.year;
    const month = r.monthName;
    const day = r.monthDay;

    const selected = r.settlements.find((s) => s.id === this.selectedId);
    const selPop = selected ? Math.floor(selected.cohorts.bands.reduce((a, b) => a + b, 0)) : 0;
    const nationPop = r.playerPop();

    const totalFood = r.totalFood;
    const totalWood = r.totalWood;

    // Overall happiness: pop-weighted satisfaction across the player's settlements.
    const happy = Math.round(r.avgSatisfaction());
    const happyCls = happy >= 60 ? 'c-good' : happy >= 40 ? 'c-warn' : 'c-bad';

    // U2: legitimacy at glance-altitude — same field the State→Politics nation
    // header reads (nationHtml(), ~line 3921). Meaningless pre-nation (stays 0).
    const legPct = Math.round(r.legitimacy);
    const legCls = legPct >= 60 ? 'c-good' : legPct >= 35 ? 'c-warn' : 'c-bad';
    const legItem = r.nationProclaimed
      ? `<div class="tb-item tb-legitimacy" title="Legitimacy — the regime's right to rule (GDD §5.3)"><span class="${legCls}">⚖ ${legPct}% ${toneGlyph(legCls)}</span></div>`
      : '';

    // U2: compact crisis badge, driven by the exact same condition that gates
    // the crisis-banner (depressionResponseHtml()) — no new sim state.
    const inCrisis = r.depressionDepth > 0.01 || r.crashRecoveryChoice === 'pending';
    const crisisItem = inCrisis
      ? `<div class="tb-item tb-crisis" title="A crisis is active — see the Nation panel for details"><span class="c-bad">⚠ CRISIS</span></div>`
      : '';

    const treasury = formatCurrency(r.treasury);
    const speed = window.gameSpeed || 1;
    const isPaused = !!window.gamePaused;
    const paused = isPaused ? '⏸ PAUSED' : '';
    const speedLabel = speed === 1 ? '1×' : speed === 3 ? '3×' : speed === 8 ? '8×' : `${speed}×`;
    // Speed cell: collapsed = a single clickable readout; expanded = pause + speed
    // buttons. The active option is highlighted. Purely a display toggle here —
    // the clicks route through onSetSpeed/onTogglePause (owned by main.ts).
    const speedCell = this.speedExpanded
      ? `<div class="tb-item tb-speed push-right tb-speed-expanded">
          <button class="tb-speed-btn ${isPaused ? 'tb-speed-active' : ''}" data-speed="pause" title="Pause (Space)">⏸</button>
          <button class="tb-speed-btn ${!isPaused && speed === 1 ? 'tb-speed-active' : ''}" data-speed="1" title="Normal (1)">1×</button>
          <button class="tb-speed-btn ${!isPaused && speed === 3 ? 'tb-speed-active' : ''}" data-speed="3" title="Fast (2)">3×</button>
          <button class="tb-speed-btn ${!isPaused && speed === 8 ? 'tb-speed-active' : ''}" data-speed="8" title="Fastest (3)">8×</button>
        </div>`
      : `<button class="tb-item tb-speed push-right tb-speed-toggle" id="tb-speed-btn" title="Game speed — click for options">${paused || speedLabel}</button>`;
    // Population cell shows the whole nation; if a settlement is selected, its
    // share is appended in parentheses so both numbers are visible at a glance.
    const popLabel = selected ? `${nationPop} (${selPop})` : `${nationPop}`;
    this.topBar.innerHTML = `
      <div class="tb-item tb-date">${month} ${day}, ${year}</div>
      <div class="tb-item tb-treasury" title="Treasury balance">${treasury}</div>
      <div class="tb-item tb-resources" title="Food ${Math.floor(totalFood)} · Timber ${Math.floor(totalWood)}">🌾 ${Math.floor(totalFood)} | 🪵 ${Math.floor(totalWood)}</div>
      <div class="tb-item tb-population" title="Total population of your settlements${selected ? ' (selected settlement in parentheses)' : ''}">👥 ${popLabel}</div>
      <div class="tb-item tb-happiness" title="Overall happiness — population-weighted satisfaction across your settlements"><span class="${happyCls}">☺ ${happy}% ${toneGlyph(happyCls)}</span></div>
      ${legItem}
      ${crisisItem}
      ${speedCell}
      <button class="mini tb-item" id="tb-help-btn" title="Help & Wiki (? or H)">❓ Help</button>
      <button class="mini tb-item tb-menu-btn" id="tb-menu-btn" title="Game menu (Esc)" aria-label="Game menu">☰</button>
    `;
    // U3: '?' Help entry point — rebind each rebuild since innerHTML replaces the node.
    this.topBar.querySelector<HTMLButtonElement>('#tb-help-btn')!.onclick = () => this.toggleWikiPanel();
    // Hamburger → the game (pause) menu, via the main.ts-owned hook.
    this.topBar.querySelector<HTMLButtonElement>('#tb-menu-btn')!.onclick = () => this.onOpenGameMenu?.();
    // Speed control — collapsed toggle expands it; expanded buttons set speed /
    // pause and collapse again. Handlers rebound each rebuild (innerHTML swap).
    if (this.speedExpanded) {
      this.topBar.querySelectorAll<HTMLButtonElement>('.tb-speed-btn').forEach((btn) => {
        btn.onclick = () => {
          const val = btn.dataset.speed;
          if (val === 'pause') this.onTogglePause?.();
          else this.onSetSpeed?.(Number(val));
          this.speedExpanded = false;
          this.lastTopBarFrame = -999; // force an immediate rebuild
          this.updateTopBar();
        };
      });
    } else {
      this.topBar.querySelector<HTMLButtonElement>('#tb-speed-btn')!.onclick = () => {
        this.speedExpanded = true;
        this.lastTopBarFrame = -999;
        this.updateTopBar();
      };
    }
  }

  private newsTick = 0;

  private updateEventLog(): void {
    if (this.newsTick++ % 15 !== 0) return;
    this.dispatch.update(this.region);
    if (this.newsTick % 60 === 1) {
      this.diplomacyScreen.refresh(this.region);
      this.economyScreen.refresh(this.region);
      this.researchScreen.refresh(this.region);
      this.townDrawer.refresh(this.region);
      this.nationScreen.refresh(this.region);
    }
    this.rail.setActive([
      ...(this.nationScreen.isOpen ? ['nation' as const] : []),
      ...(this.economyScreen.isOpen ? ['economy' as const] : []),
      ...(this.researchScreen.isOpen ? ['research' as const] : []),
      ...(this.diplomacyScreen.isOpen ? ['foreign' as const] : []),
      ...(this.historyOpen ? ['history' as const] : []),
      ...(this.claimLandMode ? ['claim' as const] : []),
    ]);
    this.agendaBar.update(this.region, this.awaitingTurn);
  }

  /** Open the State panel on its Diplomacy tab (news and agenda click-through). */
  private focusDiplomacy(): void {
    this.diplomacyScreen.open(this.region);
  }

  /** D key: the full diplomacy screen. */
  toggleDiplomacy(): void {
    if (this.diplomacyScreen.isOpen) this.diplomacyScreen.close();
    else this.diplomacyScreen.open(this.region);
  }

  /** Phase C: rival faction detail panel — shown when the player clicks a rival
   *  settlement. Displays faction stats and conquest/diplomacy action buttons. */
  private drawRivalPanel(): void {
    const r = this.region;
    if (this.selectedFactionId === null) {
      this.rivalPanel.classList.add('hidden');
      this.lastRivalPanelFactionId = null;
      return;
    }
    this.rivalPanel.classList.remove('hidden');
    const fid = this.selectedFactionId;
    if (this.lastRivalPanelFactionId === fid && this.frame - this.lastPanelBuildFrame < 60) return;
    this.lastRivalPanelFactionId = fid;

    const faction = r.faction(fid);
    if (!faction) { this.rivalPanel.classList.add('hidden'); return; }
    const stats = r.getFactionStats(fid);
    if (!stats) { this.rivalPanel.classList.add('hidden'); return; }

    const playerFaction = r.faction(r.playerFactionId);
    const isVassal = faction.overlordId === r.playerFactionId;
    const territory = (r.territoryControlOf(fid) * 100).toFixed(1);
    const regimeDef = RIVAL_REGIMES.find((x) => x.id === faction.regime);
    const regimeName = regimeDef?.name ?? faction.regime;

    const canVassalize = !isVassal && faction.settlementIds.length > 0 && r.stateProclaimed;
    const canBuyLand = faction.treasury < 150 && faction.settlementIds.length > 1 && (playerFaction?.treasury ?? 0) >= 500;
    const atWar = r.playerRegionalWars.has(fid);

    // While at war, every enemy town is a target: list each with its assault odds.
    const assaultHtml = atWar
      ? `<hr><p class="insp-skills">CAMPAIGN — your field army <b>${Math.round(r.playerFieldArmy())}</b></p>` +
        faction.settlementIds.map((sid) => {
          const s = r.settlement(sid);
          if (!s) return '';
          const od = r.assaultOdds(sid);
          const pct = Math.round(od.odds * 100);
          return `<button class="mini danger assault-btn" data-sid="${sid}" ${od.ok ? '' : 'disabled'} ` +
            `title="${od.ok ? `your ${od.attack} vs garrison ${od.defense}` : od.reason}">` +
            `⚔ Assault ${s.name} (${pct}%)</button><br>`;
        }).join('')
      : '';

    this.setInnerHtml(
      this.rivalPanel,
      `<h3 class="panel-title">${faction.identity
        ? `<img class="flag-img" src="${flagDataUrl(faction.identity.flag, 36, 24)}" alt="">`
        : `<span style="color:${faction.color}">■</span>`} ${faction.name}</h3>` +
      `<p class="insp-skills">${regimeName}${faction.identity ? ` · ${faction.identity.adjective} people` : ''}</p>` +
      (faction.identity
        ? `<p class="insp-skills">${faction.identity.quirks.map((id) => QUIRKS.find((q) => q.id === id))
            .filter((q): q is NonNullable<typeof q> => !!q)
            .map((q) => `<span class="quirk-tag" title="${q.desc}">${q.label}</span>`).join(' ')}</p>`
        : '') +
      (faction.opinion?.length
        ? `<details class="memory"><summary class="t-10">They remember (${faction.opinion.length})</summary>` +
          faction.opinion.slice(0, 5).map((o) =>
            `<p class="t-10 ${o.delta < 0 ? 'c-bad' : o.delta > 0 ? 'c-good' : 'c-muted'}">${o.text}</p>`).join('') +
          `</details>`
        : '') +
      (isVassal ? `<p class="c-good">★ Vassal of your state</p>` : '') +
      (atWar ? `<p class="c-bad">⚔ AT WAR</p>` : '') +
      `<p>settlements <b>${stats.settlements}</b> · pop <b>${stats.population}</b></p>` +
      `<p>treasury <b>${formatCurrency(stats.treasury)}</b> · military <b>${stats.militaryStrength}</b></p>` +
      `<p>territory <b>${territory}%</b> of region</p>` +
      (stats.currentGoal ? `<p>goal <i>${stats.currentGoal}</i></p>` : '') +
      `<hr>` +
      (canVassalize
        ? `<button id="rival-vassalize-btn">Propose Vassalization</button><br>`
        : isVassal ? '' : `<button disabled title="Need 2× military edge or rival treasury &lt;100">Propose Vassalization</button><br>`) +
      (canBuyLand
        ? `<button id="rival-buy-land-btn">Buy Land (£500)</button><br>`
        : `<button disabled title="Rival treasury must be &lt;£150 and you need £500">Buy Land</button><br>`) +
      (!isVassal
        ? (atWar
          ? `<button id="rival-war-btn" class="mini">✦ Offer Ceasefire</button><br>`
          : `<button id="rival-war-btn" class="mini danger">⚔ Declare War</button><br>`)
        : '') +
      assaultHtml +
      `<button id="rival-close-btn" class="mini mt-6">Close</button>`,
    );

    this.rivalPanel.querySelector<HTMLButtonElement>('#rival-close-btn')!.onclick = () => {
      this.selectedFactionId = null;
    };
    const vassalBtn = this.rivalPanel.querySelector<HTMLButtonElement>('#rival-vassalize-btn');
    if (vassalBtn) {
      vassalBtn.onclick = () => {
        const result = issue(r, 'offerVassalage', fid);
        if (result === 'accepted') {
          this.selectedFactionId = null;
        }
        this.lastRivalPanelFactionId = null;
      };
    }
    const buyBtn = this.rivalPanel.querySelector<HTMLButtonElement>('#rival-buy-land-btn');
    if (buyBtn) {
      buyBtn.onclick = () => {
        issue(r, 'buyLand', fid);
        this.lastRivalPanelFactionId = null;
      };
    }
    const warBtn = this.rivalPanel.querySelector<HTMLButtonElement>('#rival-war-btn');
    if (warBtn) {
      warBtn.onclick = () => {
        if (r.playerRegionalWars.has(fid)) {
          issue(r, 'makeRegionalPeace', fid);
        } else {
          issue(r, 'declareWarOnFaction', fid);
        }
        this.lastRivalPanelFactionId = null;
      };
    }
    this.rivalPanel.querySelectorAll<HTMLButtonElement>('.assault-btn').forEach((btn) => {
      btn.onclick = () => {
        const sid = Number(btn.dataset.sid);
        issue(r, 'assaultSettlement', sid);
        this.lastRivalPanelFactionId = null; // rebuild to refresh odds & ownership
      };
    });
  }
}

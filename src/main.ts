import './style.css';
import { RegionSim, SAVE_SCHEMA_VERSION, IncompatibleSaveError, applyDifficultyPreset } from './sim/region';

declare global {
  interface Window {
    /** Current tick speed multiplier; exposed for debug overlays and the top-bar readout. */
    gameSpeed?: number;
    /** Whether the sim loop is paused; exposed for debug overlays and the top-bar readout. */
    gamePaused?: boolean;
    /** The live region sim instance; exposed for debugging from the browser console. */
    region?: RegionSim;
  }
}
import { RegionView } from './ui/regionview';
import { WindowManager } from './ui/WindowManager';
import { Sfx } from './ui/audio';
import { Music } from './ui/music';
import { Soundscape } from './ui/soundscape';
import { AudioRegistry } from './ui/audio/audioRegistry';
import { DesignScreen } from './ui/designscreen';
import { TitleScreen } from './ui/titlescreen';
import { PauseMenu } from './ui/pausemenu';
import { TICKS_PER_SECOND, DAYS_PER_MONTH } from './sim/defs';
import { agenda } from './sim/agenda';
import { runCatchUp } from './ui/simLoop';
import { FramePacer } from './ui/framePacer';
import { displayScale } from './ui/dpr';
import type { ScenarioSelection } from './ui/titlescreen';

const root = document.getElementById('app')!;
const canvas = document.createElement('canvas');
canvas.id = 'game';
root.appendChild(canvas);

const SAVE_KEY = 'centuria-save';
// Quicksave/autosave wrapper version. Bumped 4→5 at the schema cutover so stale
// wrappers are ignored on boot rather than half-loading into a mismatched sim.
// Distinct from the region blob's own SAVE_SCHEMA_VERSION (nested in `region`).
const SAVE_WRAPPER_VERSION = 5;

function bootSim(): RegionSim | null {
  try {
    const pending = sessionStorage.getItem('centuria-load-on-boot');
    if (pending) {
      sessionStorage.removeItem('centuria-load-on-boot');
      const data = localStorage.getItem(SAVE_KEY);
      if (data) {
        const d = JSON.parse(data);
        if (d.v === SAVE_WRAPPER_VERSION && d.region) {
          return RegionSim.deserialize(d.region);
        }
      }
    }
  } catch (err) {
    // IncompatibleSaveError (or any parse failure) must not crash boot — the
    // stale autosave stays in storage and surfaces as a delete-only Load entry.
    if (err instanceof IncompatibleSaveError) {
      console.warn('autosave is from an older schema; starting fresh:', err.message);
    } else {
      console.error('load failed, starting fresh:', err);
    }
  }
  return null;
}

// Backing store at device resolution (capped 2×) for crisp HiDPI rendering;
// game logic stays in CSS pixels — RegionView applies the base DPR transform.
// `alpha: false`: the scene fully repaints every frame, so an opaque canvas
// skips per-frame alpha compositing against the page background.
function resize(): void {
  const dpr = displayScale();
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  const g = canvas.getContext('2d', { alpha: false })!;
  g.imageSmoothingEnabled = false;
}
resize();
window.addEventListener('resize', resize);

const sfx = new Sfx();
const music = new Music();
const soundscape = new Soundscape();
// Manifest-driven recorded stems / ambience beds (procedural fallback when none
// are present). Music and soundscape each own a registry bound to their own
// AudioContext — decoded AudioBuffers cannot cross contexts.
music.setStems(new AudioRegistry());
soundscape.setAmbience(new AudioRegistry());
window.addEventListener('mousedown', () => { sfx.unlock(); music.unlock(); soundscape.unlock(); }, { once: true });
window.addEventListener('keydown', () => { sfx.unlock(); music.unlock(); soundscape.unlock(); }, { once: true });

let region: RegionSim | null = bootSim();
let regionView: RegionView | null = null;
// Tracks the in-game year of the last autosave, so the tick loop writes the
// quicksave exactly once per YEAR rollover (not every tick). Seeded on entry so
// loading a save doesn't immediately re-autosave.
let lastAutosaveYear = region?.year ?? 0;
let paused = false;
let speed = 1;
let pauseMenuOpen = false;

// Centuria 2.0 monthly turns: "End month" runs to the next month and holds;
// a month that brings a NEW urgent matter also stops the clock on its own.
let turnHoldMonth = -1;
let lastMonthIdx = -1;
let seenAgendaIds = new Set<string>();
const monthIdx = (r: RegionSim): number => Math.floor(r.day / DAYS_PER_MONTH);

function advanceMonth(): void {
  if (!region || !regionView || pauseMenuOpen) return;
  turnHoldMonth = monthIdx(region) + 1;
  regionView.awaitingTurn = false;
  if (speed < 3) speed = 8;
  paused = false;
  updateUIState();
}

function checkTurnBoundary(r: RegionSim, rv: RegionView): void {
  const mi = monthIdx(r);
  if (mi === lastMonthIdx) return;
  const first = lastMonthIdx < 0;
  lastMonthIdx = mi;
  if (first) return;
  const items = agenda(r);
  const fresh = items.filter((i) => i.urgency >= 2 && !seenAgendaIds.has(i.id));
  seenAgendaIds = new Set(items.map((i) => i.id));
  const held = turnHoldMonth >= 0 && mi >= turnHoldMonth;
  if (held || fresh.length > 0) {
    turnHoldMonth = -1;
    paused = true;
    rv.awaitingTurn = true;
    rv.openPendingDecision();
    updateUIState();
  }
}

function updateUIState(): void {
  window.gameSpeed = speed;
  window.gamePaused = paused;
}
updateUIState();

const titleScreen = new TitleScreen(root, { sfx, music, soundscape });
const pauseMenu = new PauseMenu(root);
const fpsDiv = document.createElement('div');
fpsDiv.id = 'fps';
fpsDiv.style.cssText = 'position:fixed;bottom:4px;left:4px;font:10px monospace;color:#888;pointer-events:none;';
root.appendChild(fpsDiv);

// `slot` routes the save into one of the pause menu's named save slots (clicked
// from the Save Game panel). Omitted for the Ctrl+S quicksave hotkey, which only
// refreshes the autosave key — it has no slot of its own to pick without
// silently clobbering one of the three named slots.
function save(slot?: number): boolean {
  if (!region) return false;
  try {
    const regionJson = region.serialize();
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_WRAPPER_VERSION, region: regionJson }));
    if (slot !== undefined) {
      const year = region.minute / (60 * 24 * 365);
      const description = `Year ${Math.floor(year)}, ${region.settlements.length} settlements`;
      pauseMenu.saveGame(slot, regionJson, description);
    }
    return true;
  } catch (err) {
    console.error('save failed:', err);
    return false;
  }
}

function enterRegionMode(r: RegionSim): void {
  region = r;
  lastAutosaveYear = r.year;
  window.region = r;
  regionView = new RegionView(canvas, r, root);
  // Top-bar controls (speed cell, hamburger) route back into the loop's
  // authoritative speed/pause/menu state, kept in sync with the keyboard.
  regionView.onSetSpeed = (s: number) => { speed = s; paused = false; updateUIState(); };
  regionView.onTogglePause = () => { if (!pauseMenuOpen) { paused = !paused; updateUIState(); } };
  regionView.onAdvanceMonth = advanceMonth;
  turnHoldMonth = -1;
  lastMonthIdx = -1;
  seenAgendaIds = new Set(agenda(r).map((i) => i.id));
  regionView.onOpenGameMenu = () => {
    if (!pauseMenuOpen && regionView && !regionView.ceremonyOpen) {
      pauseMenuOpen = true;
      paused = true;
      updateUIState();
      openPauseMenu();
    }
  };
  new WindowManager(regionView.draggablePanels);
  paused = false;
  updateUIState();
  titleScreen.hide();
}

function showTitleScreen(): void {
  paused = true;
  const hasSave = localStorage.getItem(SAVE_KEY) !== null;
  titleScreen.show(hasSave);
}

// World Dynamism campaign options: chosen on the scenario screen and applied to
// every fresh sim. onNewColony has no scenario selection, so quick-start colonies
// default both flags OFF (call with no `sel`) — the toggles live on the scenario
// screen only. Once applied, the flags persist in the save (region serialize).
function applyDynamism(r: RegionSim, sel?: ScenarioSelection): void {
  r.consumerDemand = sel?.dynamism?.consumerDemand ?? false;
  r.rivalClimateResponse = sel?.dynamism?.rivalClimateResponse ?? false;
}

titleScreen.onNewColony = () => {
  new DesignScreen().showRegionDesign((design) => {
    const r = RegionSim.create(Date.now() % 100000, design);
    // §DIFF adversarial finding e: this path silently kept the 1.0 (easy) defaults,
    // making 'standard' not actually the default experience. Standard is the game.
    applyDifficultyPreset(r, 'standard');
    applyDynamism(r);
    enterRegionMode(r);
  });
};
titleScreen.onBeginScenario = (sel: ScenarioSelection) => {
  const seed = Date.now() % 100000;
  if (sel.eraStart === '1919' && !sel.scenarioId) {
    // Sandbox 1919: standard new colony flow. §DIFF: the U11 difficulty pick now
    // actually reaches the sim (it used to be dropped on this path).
    const r = RegionSim.create(seed, {});
    applyDifficultyPreset(r, sel.difficulty);
    applyDynamism(r, sel);
    enterRegionMode(r);
  } else if (sel.eraStart === '1919') {
    // 1919 scenario: standard colony but with scenario wired. §DIFF: 1919 scenarios
    // never passed through fromEraStart's difficulty block — apply the preset here.
    const r = RegionSim.create(seed, {});
    r.activeScenario = sel.scenarioId;
    applyDifficultyPreset(r, sel.difficulty);
    applyDynamism(r, sel);
    enterRegionMode(r);
  } else {
    // Era start: 1950 or 2000
    const r = RegionSim.fromEraStart(sel.eraStart as '1950' | '2000', {
      seed,
      scenarioId: sel.scenarioId ?? undefined,
    });
    // §DIFF adversarial finding e: a sandbox era start (no scenario) has no
    // scenario tag inside fromEraStart, so the picker's tier was dropped here too.
    if (!sel.scenarioId) applyDifficultyPreset(r, sel.difficulty);
    applyDynamism(r, sel);
    enterRegionMode(r);
  }
};
titleScreen.onContinue = () => {
  sessionStorage.setItem('centuria-load-on-boot', '1');
  location.reload();
};
titleScreen.onQuit = () => window.close();

pauseMenu.onResume = () => {
  pauseMenuOpen = false;
  paused = false;
  updateUIState();
};
pauseMenu.onSave = (slot: number) => { save(slot); };
pauseMenu.onQuit = () => {
  pauseMenuOpen = false;
  showTitleScreen();
};
pauseMenu.onLoadGame = (regionJson: string) => {
  try {
    const loaded = RegionSim.deserialize(regionJson);
    pauseMenuOpen = false;
    enterRegionMode(loaded);
  } catch (err) {
    // Incompatible slots are disabled in the UI, but guard the load path anyway
    // so a stale blob can never crash the game — leave the menu open.
    if (err instanceof IncompatibleSaveError) {
      console.warn('slot is from an older schema and cannot be loaded:', err.message);
    } else {
      console.error('failed to load game:', err);
    }
  }
};
pauseMenu.onLoadAutosave = () => {
  const data = localStorage.getItem(SAVE_KEY);
  if (!data) return;
  try {
    const d = JSON.parse(data);
    if (d.v !== SAVE_WRAPPER_VERSION || !d.region) return;
    const loaded = RegionSim.deserialize(d.region);
    pauseMenuOpen = false;
    enterRegionMode(loaded);
  } catch (err) {
    if (err instanceof IncompatibleSaveError) {
      console.warn('autosave is from an older schema and cannot be loaded:', err.message);
    } else {
      console.error('failed to load autosave:', err);
    }
  }
};
pauseMenu.onDeleteAutosave = () => {
  localStorage.removeItem(SAVE_KEY);
};

// Summarize the quicksave/autosave for the Load menu without deserializing it:
// read the wrapper, then compare the region blob's own schema version to detect
// an incompatible (delete-only) autosave.
function readAutosaveInfo(): { description: string; timestamp: number; incompatible: boolean } | null {
  const data = localStorage.getItem(SAVE_KEY);
  if (!data) return null;
  try {
    const d = JSON.parse(data);
    if (d.v !== SAVE_WRAPPER_VERSION || typeof d.region !== 'string') {
      return { description: 'Autosave', timestamp: 0, incompatible: true };
    }
    const inner = JSON.parse(d.region);
    const incompatible = (inner.v ?? 0) !== SAVE_SCHEMA_VERSION;
    const year = typeof inner.minute === 'number' ? Math.floor(inner.minute / (60 * 24 * 365)) : 0;
    return { description: `Year ${year}`, timestamp: 0, incompatible };
  } catch {
    return { description: 'Autosave', timestamp: 0, incompatible: true };
  }
}

function openPauseMenu(): void {
  pauseMenu.autosaveInfo = readAutosaveInfo();
  pauseMenu.show();
}

if (region) {
  enterRegionMode(region);
} else {
  showTitleScreen();
}

// ---- input ----
const keys = new Set<string>();

window.addEventListener('keydown', (e) => {
  keys.add(e.key);
  // A cinematic is playing: any key skips it and consumes the event.
  if (regionView?.isCinematicPlaying()) { regionView.skipCinematic(); e.preventDefault(); return; }
  if (e.key === ' ') {
    if (!pauseMenuOpen) {
      paused = !paused;
      updateUIState();
    }
    e.preventDefault();
    return;
  }
  if (e.key === '1') { speed = 1; updateUIState(); }
  if (e.key === '2') { speed = 3; updateUIState(); }
  if (e.key === '3') { speed = 8; updateUIState(); }
  if (e.key === 'Enter' && regionView && !pauseMenuOpen && !(e.target instanceof HTMLInputElement)) { advanceMonth(); e.preventDefault(); return; }
  if ((e.key === '+' || e.key === '=') && regionView) { regionView.zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1); e.preventDefault(); return; }
  if (e.key === '-' && regionView) { regionView.zoomAt(window.innerWidth / 2, window.innerHeight / 2, -1); e.preventDefault(); return; }
  if (e.key === 's' && e.ctrlKey) { save(); e.preventDefault(); return; }
  if (e.key === 'Escape') {
    if (pauseMenuOpen) {
      pauseMenuOpen = false;
      pauseMenu.hide();
      paused = false;
      updateUIState();
    } else if (regionView && !regionView.ceremonyOpen) {
      pauseMenuOpen = true;
      paused = true;
      updateUIState();
      openPauseMenu();
    }
    e.preventDefault();
    return;
  }
  if (regionView && !pauseMenuOpen) {
    if (e.key === 't' || e.key === 'T') { regionView.researchOpen = !regionView.researchOpen; e.preventDefault(); return; }
    if (e.key === 'p' || e.key === 'P') { regionView.toggleProvinceView(); e.preventDefault(); return; }
    if ((e.key === 'b' || e.key === 'B') && region?.hasCentralBank()) {
      regionView.centralBankOpen = !regionView.centralBankOpen; e.preventDefault(); return;
    }
    // U6: gameplay-panel shortcuts (docs/specs/09-audit-nine.md §U6). Skipped
    // while focus is in a text field (town rename, tax slider, loan prompts)
    // so single letters never hijack typing.
    const target = document.activeElement;
    const typing = target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
    if (!typing) {
      if (e.key === 'e' || e.key === 'E') { regionView.toggleEconomyPanel(); e.preventDefault(); return; }
      if (e.key === 'g' || e.key === 'G') { regionView.toggleStatePanel(); e.preventDefault(); return; }
      if (e.key === 'o' || e.key === 'O') { regionView.toggleOverviewPanel(); e.preventDefault(); return; }
      if (e.key === 'c' || e.key === 'C') { regionView.openCenturyGraph(); e.preventDefault(); return; }
      if (e.key === '?' || e.key === 'h' || e.key === 'H') { regionView.toggleWikiPanel(); e.preventDefault(); return; }
    }
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.key));


const regionDrag = { active: false, lastX: 0, lastY: 0, moved: 0 };

canvas.addEventListener('mousemove', (e) => {
  if (regionDrag.active && e.buttons === 1 && regionView) {
    const dx = e.clientX - regionDrag.lastX;
    const dy = e.clientY - regionDrag.lastY;
    regionDrag.lastX = e.clientX;
    regionDrag.lastY = e.clientY;
    regionDrag.moved += Math.abs(dx) + Math.abs(dy);
    regionView.panBy(dx, dy);
  } else if (regionView) {
    regionView.updateTooltip(e.clientX, e.clientY);
  }
});

canvas.addEventListener('mouseleave', () => { regionView?.hideTooltip(); });

canvas.addEventListener('mousedown', (e) => {
  if (regionView) {
    regionDrag.active = true;
    regionDrag.lastX = e.clientX;
    regionDrag.lastY = e.clientY;
    regionDrag.moved = 0;
  }
});

window.addEventListener('mouseup', () => { regionDrag.active = false; });

canvas.addEventListener('click', (e) => {
  if (regionDrag.moved < 5) regionView?.click(e.clientX, e.clientY);
});

canvas.addEventListener('wheel', (e) => {
  if (regionView) {
    const dir = e.deltaY < 0 ? 1 : -1;
    regionView.zoomAt(e.clientX, e.clientY, dir);
    e.preventDefault();
  }
});

// ---- main loop ----
let acc = 0;
let lastCallback = performance.now();
let lastRender = lastCallback;
let frameMsEma = 16.7;
let fpsShown = '';
let fpsNextUpdate = 0;
const pacer = new FramePacer();

function loop(now: number): void {
  // Render every Nth vsync (N locked to the display's refresh rate) instead of
  // the old `<14ms → skip` timestamp gate: even cadence on 120/144 Hz panels
  // and immune to timer jitter turning one 60 Hz frame into a 33 ms hitch.
  const cbMs = now - lastCallback;
  lastCallback = now;
  if (!pacer.step(cbMs)) { requestAnimationFrame(loop); return; }
  const rawMs = now - lastRender;
  lastRender = now;
  const dt = Math.min(0.25, Math.max(0, rawMs / 1000));
  if (rawMs > 0 && rawMs < 1000) frameMsEma += (rawMs - frameMsEma) * 0.1;

  // Arrow/WASD pan
  void dt; // pan not yet implemented in RegionView

  if (!paused && region && regionView) {
    regionView.awaitingTurn = false;
    acc += dt * TICKS_PER_SECOND * speed;
    // Budget the sim catch-up by wall-clock, not a fixed iteration count: a heavy
    // late-game tick (the monthly/yearly spike) can't blow the 16.7 ms frame — we
    // tick until ~8 ms is spent, then let the calendar lag a frame instead of
    // stuttering. The hard tick ceiling backstops a cheap-tick flood.
    const r = region;
    const rv = regionView;
    const res = runCatchUp(
      acc,
      () => { if (!rv.ceremonyOpen) r.tick(); },
      () => performance.now(),
      { budgetMs: 8, maxTicks: 240, maxBacklog: 240 },
    );
    acc = res.acc;
    checkTurnBoundary(r, rv);

    // Autosave once per in-game year. `region.year` is a monotonic integer, so a
    // strict inequality fires exactly once on each new year — never per tick.
    if (region.year !== lastAutosaveYear) {
      lastAutosaveYear = region.year;
      save();
    }
  }

  if (region && regionView) {
    regionView.draw();
    // Era skin: mirror eraBranch onto #app[data-era] so CSS can theme per
    // branch. Write-guarded — an unconditional set forces a style recalc
    // against every [data-era] selector each frame.
    const era = region.eraBranch ?? '';
    if (root.dataset.era !== era) root.dataset.era = era;
  }

  const year = region?.year ?? 1900;
  // Dynamic mixing: feed real war/unrest/crisis tension to music + soundscape
  // (was hardcoded 0). null region (title screen) is calm.
  const tension = region ? region.tensionScalar() : 0;
  music.update({ year, paused, tension });

  soundscape.update({
    mode: 'region',
    paused,
    year,
    activeBuildWorkers: 0,
    activeRailRoutes: region ? region.activeRailRoutes : 0,
    maxGrievance: region ? region.maxGrievance : 0,
    tension,
  });

  if (now >= fpsNextUpdate) {
    fpsNextUpdate = now + 250;
    const fps = `${Math.round(1000 / frameMsEma)} fps`;
    if (fps !== fpsShown) {
      fpsShown = fps;
      fpsDiv.textContent = fps;
    }
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/**
 * Sprite contact sheet — human review surface for the procedural sprites.
 * Calls buildSprites([]) and renders EVERY entry of the SpriteSet, scaled up
 * ~6× with nearest-neighbour, captioned with its key. Animation/variant arrays
 * are laid out in a row. Reachable at /sprites-preview.html via the vite dev
 * server. This is the only way to eyeball the art (the build can't self-verify).
 */
import { buildSprites, type SpriteSet } from './ui/sprites';
import { listSlots } from './ui/spriteOverrides';

const SCALE = 6;
const sprites: SpriteSet = buildSprites([]);

const root = document.getElementById('sheet')!;

function scaled(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width * SCALE;
  c.height = src.height * SCALE;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, c.width, c.height);
  c.className = 'spr';
  c.title = `${src.width}×${src.height}`;
  return c;
}

/** A labeled group containing one or more sprite canvases laid out in a row. */
function group(label: string, canvases: HTMLCanvasElement[], sublabels?: string[]) {
  const wrap = document.createElement('div');
  wrap.className = 'group';
  const cap = document.createElement('div');
  cap.className = 'cap';
  cap.textContent = label;
  wrap.appendChild(cap);
  const row = document.createElement('div');
  row.className = 'row';
  canvases.forEach((cv, i) => {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.appendChild(scaled(cv));
    if (sublabels && sublabels[i] != null) {
      const sub = document.createElement('div');
      sub.className = 'sub';
      sub.textContent = sublabels[i];
      cell.appendChild(sub);
    }
    row.appendChild(cell);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}

function section(title: string) {
  const h = document.createElement('h2');
  h.textContent = title;
  root.appendChild(h);
}

// --- 1. SETTLERS -----------------------------------------------------------
section('1 · Settlers (most-looked-at sprite)');
sprites.settler.forEach((frames, v) =>
  group(`settler[${v}]`, frames, frames.map((_, f) => `frame ${f}`)),
);
sprites.settlerArmed.forEach((frames, v) =>
  group(`settlerArmed[${v}]`, frames, frames.map((_, f) => `frame ${f}`)),
);

// --- 2. TERRAIN ------------------------------------------------------------
section('2 · Terrain');
group('grass[variant]', sprites.grass, sprites.grass.map((_, i) => `v${i}`));
group('tree / treeMarked', [sprites.tree, sprites.treeMarked], ['tree', 'marked']);
group('water[frame]', sprites.water, sprites.water.map((_, i) => `f${i}`));
group('rock / rockMarked', [sprites.rock, sprites.rockMarked], ['rock', 'marked']);
group('soil stages', [sprites.soil, sprites.soilSown, sprites.soilGrown, sprites.soilRipe],
  ['bare', 'sown', 'grown', 'ripe']);
group('dirtPatch / sapling', [sprites.dirtPatch, sprites.sapling], ['dirtPatch', 'sapling']);

// --- 3. BUILD SYSTEM -------------------------------------------------------
section('3 · Build system');
group('interiorFloor / interiorWall', [sprites.interiorFloor, sprites.interiorWall],
  ['floor', 'wall']);
group('palisade / gate', [sprites.palisade, sprites.gate], ['palisade', 'gate']);
group('palisadeVariants[mask]', sprites.palisadeVariants,
  sprites.palisadeVariants.map((_, i) => String(i)));
group('gateVariants[mask]', sprites.gateVariants,
  sprites.gateVariants.map((_, i) => String(i)));
{
  const ids = Object.keys(sprites.stations);
  group('stations', ids.map((k) => sprites.stations[k]), ids);
}

// --- 4. OTHERS -------------------------------------------------------------
section('4 · Creatures, items, misc');
group('raider[frame]', sprites.raider, sprites.raider.map((_, i) => `f${i}`));
group('deer[frame]', sprites.deer, sprites.deer.map((_, i) => `f${i}`));
group('wolf[frame]', sprites.wolf, sprites.wolf.map((_, i) => `f${i}`));
group('grave / corpse', [sprites.grave, sprites.corpse], ['grave', 'corpse']);
{
  const ids = Object.keys(sprites.items);
  group('items', ids.map((k) => (sprites.items as Record<string, HTMLCanvasElement>)[k]), ids);
}

// --- 5. ZONES / PLANS / ROADS (full coverage) ------------------------------
section('5 · Zones, plans, roads');
group('stockpileZone / trapZone / wallPlan / gatePlan',
  [sprites.stockpileZone, sprites.trapZone, sprites.wallPlan, sprites.gatePlan],
  ['stockpile', 'trap', 'wallPlan', 'gatePlan']);
{
  const ids = Object.keys(sprites.roads);
  group('roads', ids.map((k) => sprites.roads[k]), ids);
  const pids = Object.keys(sprites.roadPlans);
  group('roadPlans', pids.map((k) => sprites.roadPlans[k]), pids);
}

// --- 6. BUILDINGS / BLUEPRINTS (empty when buildSprites([]); shown if any) --
section('6 · Buildings / blueprints');
{
  const bids = Object.keys(sprites.buildings);
  if (bids.length) group('buildings', bids.map((k) => sprites.buildings[k]), bids);
  else {
    const note = document.createElement('div');
    note.className = 'cap';
    note.textContent = 'buildings / blueprints: empty (buildSprites([]) passes no building defs)';
    root.appendChild(note);
  }
}

// --- 7. OVERRIDE MANIFEST --------------------------------------------------
// Every overridable slot: drop public/sprites/<name>.png at the given size and
// list <name> in public/sprites/index.json to replace the procedural sprite.
section('7 · Override manifest — public/sprites/<name>.png');
{
  const list = document.createElement('div');
  list.className = 'manifest';
  list.style.cssText = 'font:12px monospace;columns:4;gap:1rem;padding:.5rem';
  for (const s of listSlots(sprites)) {
    const row = document.createElement('div');
    row.textContent = `${s.name}.png — ${s.canvas.width}×${s.canvas.height}`;
    list.appendChild(row);
  }
  root.appendChild(list);
}

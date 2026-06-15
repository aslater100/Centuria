/**
 * CoreView — a non-destructive GUI play-test harness for the SoA `TownCore`
 * (build-system B-6). The live game (`main.ts`) is untouched; this is a separate
 * entry (`core.html`) so the new core can be watched running in a real browser —
 * the gate that blocks the destructive swap — without ripping anything out.
 *
 * Builds a working starter town, runs the core on a fixed timestep, and draws
 * the BuildGrid + agents + raiders with a stats overlay. Controls:
 *   space pause · 1/2/3 speed · R raid now · N add settler ·
 *   left-drag paint wall · right-drag erase
 *
 * Renders with the game's real procedural sprites (`buildSprites`) so TownCore
 * looks like the live game — reachable in the real app via `?core` (see main.ts)
 * or the standalone `core.html`. ponytail: reuses the sprite generator + BuildGrid
 * render path; no fork of the 800-line fat-sim Renderer.
 */
import './style.css';
import { TownCore } from './sim/towncore';
import { AState } from './sim/agents';
import { TERRAIN, ZONE } from './sim/build';
import { ROOM_TYPE_ID, STATION_DEF_BY_NUM, TICKS_PER_SECOND } from './sim/defs';
import { buildSprites } from './ui/sprites';

// Real game art, generated procedurally (no asset files). [] skips building
// sprites — TownCore renders from the BuildGrid (floor/wall/stations) + terrain.
const sprites = buildSprites([]);

const MAP = 64;
// B-6 PART 3: boot WITH terrain so the play-test shows the Songs-of-Syx world
// (forests/water/rock/ore) the colony is painted onto, not a featureless plane.
const core = new TownCore({ width: MAP, height: MAP, seed: Date.now() % 100000, terrain: true });
(window as unknown as { core: TownCore }).core = core; // debug/automation hook

// ── starter town: doored kitchen + home + tavern, sized so a real colony lives ──
// Each room is fully walled with a single gate cut into the south side: a gate is
// passable (settlers path through) yet still seals the room for the enclosure
// (warmth) bonus, so the colony stays both reachable and warm.
{
  const g = core.grid;
  const cx = MAP >> 1, cy = MAP >> 1;
  // Clear the starter-town footprint back to grass so generated water/rock can't
  // land under the demo rooms (the heart clearing already handles trees/rock, but
  // not water). The wider world keeps its forests/lakes/outcrops.
  for (let y = cy - 12; y <= cy + 12; y++) for (let x = cx - 12; x <= cx + 16; x++) g.setTerrain(x, y, TERRAIN.GRASS);
  // Floor [x0..x1, y0..y1], wall the perimeter just outside it, then cut a south door.
  const room = (x0: number, y0: number, x1: number, y1: number, type: string): void => {
    g.designateRect(x0, y0, x1, y1, ROOM_TYPE_ID.get(type)!);
    for (let x = x0 - 1; x <= x1 + 1; x++) { g.setWall(x, y0 - 1); g.setWall(x, y1 + 1); }
    for (let y = y0 - 1; y <= y1 + 1; y++) { g.setWall(x0 - 1, y); g.setWall(x1 + 1, y); }
    g.setGate((x0 + x1) >> 1, y1 + 1); // gate: passable, but keeps the room enclosed (warmth + services)
  };
  const fill = (id: string, x0: number, y0: number, x1: number, y1: number, dx: number, dy: number): void => {
    for (let y = y0; y <= y1; y += dy) for (let x = x0; x <= x1; x += dx) g.placeStation(id, x, y);
  };

  room(cx - 4, cy - 9, cx + 3, cy - 6, 'kitchen');   // 8×4 kitchen
  fill('oven', cx - 4, cy - 9, cx + 3, cy - 9, 2, 1); // 4 ovens

  room(cx - 5, cy + 4, cx + 4, cy + 9, 'home');       // 10×6 home
  fill('bunk', cx - 5, cy + 4, cx + 4, cy + 8, 2, 3); // bunks (sleep 3 each) → ~36 beds

  room(cx + 8, cy - 2, cx + 14, cy + 2, 'tavern');    // 7×5 tavern
  fill('table', cx + 8, cy - 2, cx + 13, cy + 2, 3, 2); // tables (recreation 2 each)

  g.rebuildRooms();
  core.stock.add('grain', 5000);
  core.stock.add('wood', 200); // seed lumber so painted wall blueprints can be built
  core.seedColony(cx, cy, 8); // spawn on open ground at the centre — reachable via the doors

  // Auto-designate the nearest patches of each resource so the harvest loop runs
  // out of the box (the player can paint more with F/C/Q/B). ponytail: just grab
  // the first matching tiles by scan order; no nearest-search.
  const autoZone = (type: number, cap: number): void => {
    for (let i = 0, n = 0; i < g.size && n < cap; i++) {
      if (g.setZone(i % MAP, (i / MAP) | 0, type)) n++;
    }
  };
  autoZone(ZONE.FIELD, 16);
  autoZone(ZONE.WOODCUTTER, 12);
  autoZone(ZONE.QUARRY, 8);
  autoZone(ZONE.FISHERY, 6);
}

// ── canvas ──
const app = document.getElementById('app')!;
const canvas = document.createElement('canvas');
app.appendChild(canvas);
const ctx = canvas.getContext('2d')!;
function resize(): void { canvas.width = innerWidth; canvas.height = innerHeight; ctx.imageSmoothingEnabled = false; }
resize();
addEventListener('resize', resize);

const tilePx = () => Math.floor(Math.min(canvas.width, canvas.height) / MAP);
const tileAt = (mx: number, my: number) => ({ x: Math.floor(mx / tilePx()), y: Math.floor(my / tilePx()) });

// ── input ──
let paused = false;
let speed = 3;
let painting: 0 | 1 | 2 = 0; // 0 none, 1 apply tool, 2 erase
// Current paint tool: 'wall' or a harvest-zone type (designate matching terrain).
type Tool = 'wall' | 'field' | 'woodcutter' | 'quarry' | 'fishery';
let tool: Tool = 'wall';
const TOOL_KEYS: Record<string, Tool> = { w: 'wall', f: 'field', c: 'woodcutter', q: 'quarry', b: 'fishery' };
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (e.key === ' ') { paused = !paused; e.preventDefault(); }
  else if (e.key === '1') speed = 1;
  else if (e.key === '2') speed = 3;
  else if (e.key === '3') speed = 8;
  else if (k === 'r') core.musterRaid();
  else if (k === 'n') core.seedColony(core.homeX, core.homeY, 1);
  else if (TOOL_KEYS[k]) tool = TOOL_KEYS[k];
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => { painting = e.button === 2 ? 2 : 1; paintAt(e); });
addEventListener('mouseup', () => { painting = 0; core.grid.rebuildRooms(); });
canvas.addEventListener('mousemove', (e) => { if (painting) paintAt(e); });
function paintAt(e: MouseEvent): void {
  const r = canvas.getBoundingClientRect();
  const t = tileAt(e.clientX - r.left, e.clientY - r.top);
  const g = core.grid;
  if (!g.inBounds(t.x, t.y)) return;
  if (painting === 2) { g.clearWall(t.x, t.y); g.clearZone(t.x, t.y); core.cancelBlueprint(t.x, t.y); return; }
  if (tool === 'wall') core.blueprintWall(t.x, t.y); // Songs-of-Syx: a ghost the colony builds
  else g.setZone(t.x, t.y, ZONE[tool.toUpperCase() as keyof typeof ZONE]); // succeeds only on matching terrain
}

// ── render (real game sprites, scaled to the fit-to-screen tile size) ──
function draw(): void {
  const px = tilePx();
  const g = core.grid;
  const blit = (img: CanvasImageSource, x: number, y: number) => ctx.drawImage(img, x * px, y * px, px, px);
  ctx.fillStyle = '#15151a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const anim = (performance.now() / 350 | 0) % sprites.water.length;
  // Zone outline colours, index-aligned with ZONE (none/field/woodcutter/quarry/fishery).
  const ZONE_COLORS = ['', '#d4d46a', '#6ad48a', '#c8c8d8', '#6ad4d4'];
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
    const i = y * MAP + x;
    const t = g.terrain[i];
    // Ground: water/soil/rock get their own tile; grass also backs trees.
    if (t === TERRAIN.WATER) blit(sprites.water[anim], x, y);
    else if (t === TERRAIN.SOIL) blit(sprites.soil, x, y);
    else if (t === TERRAIN.ROCK) blit(g.ore[i] ? sprites.rockMarked : sprites.rock, x, y);
    else blit(sprites.grass[(x * 3 + y) % 4], x, y);
    if (t === TERRAIN.TREE) blit(sprites.tree, x, y);
    if (g.zone[i]) { ctx.strokeStyle = ZONE_COLORS[g.zone[i]]; ctx.strokeRect(x * px + 0.5, y * px + 0.5, px - 1, px - 1); }
    if (g.gate[i]) blit(sprites.gate, x, y);
    else if (g.wall[i]) blit(sprites.interiorWall, x, y);
    else if (g.floor[i]) blit(sprites.interiorFloor, x, y);
  }
  for (const s of g.stations) {
    const def = STATION_DEF_BY_NUM[s.typeId];
    const img = def && sprites.stations[def.id];
    if (img) blit(img, s.x, s.y);
  }

  const a = core.agents;
  for (let i = 0; i < a.count; i++) {
    const variant = i % sprites.settler.length;
    blit(sprites.settler[variant][0], a.posX[i], a.posY[i]);
    if (a.woundUntreated[i]) { ctx.strokeStyle = '#ff4040'; ctx.strokeRect(a.posX[i] * px, a.posY[i] * px, px, px); }
    if (a.state[i] === AState.Sleeping) { ctx.fillStyle = '#5aa0ff'; ctx.fillText('z', a.posX[i] * px + px, a.posY[i] * px); }
  }
  for (const r of core.raids.raiders) blit(sprites.raider[r.fleeing ? 0 : (performance.now() / 200 | 0) % sprites.raider.length], r.x, r.y);
  // Pending blueprints: dashed ghosts the colony hasn't built yet.
  ctx.strokeStyle = '#88aaff'; ctx.setLineDash([2, 2]);
  for (const o of core.builds) ctx.strokeRect(o.x * px + 1, o.y * px + 1, px - 2, px - 2);
  ctx.setLineDash([]);

  ctx.fillStyle = '#000a'; ctx.fillRect(0, 0, 320, 168);
  ctx.fillStyle = '#fff'; ctx.font = '13px monospace';
  const line = (n: number, s: string) => ctx.fillText(s, 8, 20 + n * 18);
  line(0, `day ${core.day}  pop ${core.population}  mood ${core.averageMood().toFixed(0)}`);
  line(1, `meal ${core.stock.count('meal')} grain ${core.stock.count('grain')} wood ${core.stock.count('wood')} stone ${core.stock.count('stone')}`);
  line(2, `births ${core.births}  deaths ${core.deaths}  ore ${core.stock.count('iron_ore')}`);
  line(3, core.raidActive ? `RAID — ${core.raids.raiders.length} raiders (slain ${core.raids.slain})` : `next raid day ${core.nextRaidDay}`);
  line(4, `${paused ? 'PAUSED' : 'speed ' + speed + '×'}  ·  tool: ${tool}`);
  line(5, `space pause · 1/2/3 speed · R raid · N settler`);
  line(6, `tools: W wall · F field · C chop · Q quarry · B fishery · drag to paint, right-erase`);

  // Event log: last few entries, bottom-left, colour-coded like the live HUD.
  const recent = core.log.slice(-6);
  const logColor = { good: '#7fe07f', bad: '#ff6b6b', info: '#d8d8d8' };
  ctx.font = '12px monospace';
  for (let k = 0; k < recent.length; k++) {
    const e = recent[recent.length - 1 - k];
    ctx.fillStyle = logColor[e.kind];
    ctx.fillText(`d${e.day} ${e.text}`, 8, canvas.height - 10 - k * 16);
  }
}

// ── loop: fixed-timestep sim, rAF render ──
let acc = 0, last = performance.now();
function loop(now: number): void {
  acc += Math.min(0.25, (now - last) / 1000) * TICKS_PER_SECOND * speed;
  last = now;
  if (!paused) { let guard = 0; while (acc >= 1 && guard++ < 64) { core.tick(); acc -= 1; } }
  else acc = 0;
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

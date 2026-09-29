/**
 * Living borders (Centuria 2.0 §G). Hex ownership is persistent state: each
 * land cell has an owner and a control level that the monthly tick pushes
 * around according to the influence every settlement projects. Unclaimed land
 * is taken at once and a town's core ground is always its owner's, but a
 * contested frontier erodes over months and only flips past a hysteresis
 * margin — so borders drift, bulge and give way rather than snapping.
 */

export const WATER = -2;
export const UNCLAIMED = -1;
export const CONTROL_MAX = 255;
/** Share of a settlement's reach that is its uncontestable core. */
export const CORE_FRACTION = 0.35;
/** Challenger must out-press the holder by this fraction before control erodes. */
export const FLIP_MARGIN = 0.15;
export const CONTROL_GAIN = 20;
export const CONTROL_DECAY_UNREACHED = 26;
export const CONTROL_AFTER_FLIP = 64;
/** A frontier cell below this control with a live challenger is "contested". */
export const CONTESTED_BELOW = 160;
/** Minimum cells in one month for a shift to be announced. */
export const SHIFT_REPORT_MIN = 6;

export interface InfluenceSource {
  x: number; // cell coords
  y: number;
  radius: number; // in cells
  fid: number;
  /** 0..1 — loyalty/cohesion scaling of the projected pressure. */
  strength: number;
}

export interface TerritoryState {
  n: number;
  owner: Int16Array;
  control: Uint8Array;
  /** Cells claimed by decree: they don't decay while unchallenged. */
  anchored: Uint8Array;
}

export interface BorderShift {
  from: number;
  to: number;
  cells: number;
}

/** Yearly ownership snapshot: the first is a full RLE, later ones store only
 *  the cells that changed since the previous snapshot ("idx:fid,…"). */
export interface TerritorySnapshot {
  year: number;
  rle?: string;
  delta?: string;
}

export function makeSnapshot(year: number, owner: Int16Array, prev: Int16Array | null): TerritorySnapshot {
  if (!prev) return { year, rle: encodeRle(owner) };
  const parts: string[] = [];
  for (let i = 0; i < owner.length; i++) if (owner[i] !== prev[i]) parts.push(`${i}:${owner[i]}`);
  return { year, delta: parts.join(',') };
}

/** Rebuild every snapshot's full ownership grid, oldest first. */
export function expandHistory(hist: readonly TerritorySnapshot[], size: number): { year: number; owner: Int16Array }[] {
  const out: { year: number; owner: Int16Array }[] = [];
  let cur: Int16Array | null = null;
  for (const h of hist) {
    if (h.rle !== undefined) cur = decodeRle(h.rle, size);
    else if (cur) {
      const next: Int16Array = cur.slice();
      if (h.delta) for (const p of h.delta.split(',')) {
        const [i, v] = p.split(':').map(Number);
        next[i] = v;
      }
      cur = next;
    } else continue;
    out.push({ year: h.year, owner: cur });
  }
  return out;
}

export function createTerritory(n: number, isWater: (x: number, y: number) => boolean): TerritoryState {
  const owner = new Int16Array(n * n).fill(UNCLAIMED);
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) if (isWater(x, y)) owner[x * n + y] = WATER;
  return { n, owner, control: new Uint8Array(n * n), anchored: new Uint8Array(n * n) };
}

interface CellPressure {
  best: Int16Array;
  bestP: Float32Array;
  second: Float32Array;
  core: Int16Array;
  /** Pressure of the current owner at each cell (filled lazily per pass). */
  byFid: Map<number, Float32Array>;
}

function computePressure(t: TerritoryState, sources: readonly InfluenceSource[]): CellPressure {
  const { n } = t;
  const size = n * n;
  const byFid = new Map<number, Float32Array>();
  const core = new Int16Array(size).fill(UNCLAIMED);
  const coreDist = new Float32Array(size).fill(Infinity);
  for (const s of sources) {
    let arr = byFid.get(s.fid);
    if (!arr) { arr = new Float32Array(size); byFid.set(s.fid, arr); }
    const r = s.radius;
    const coreR = r * CORE_FRACTION;
    const x0 = Math.max(0, Math.floor(s.x - r)), x1 = Math.min(n - 1, Math.ceil(s.x + r));
    const y0 = Math.max(0, Math.floor(s.y - r)), y1 = Math.min(n - 1, Math.ceil(s.y + r));
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const idx = x * n + y;
        if (t.owner[idx] === WATER) continue;
        const d = Math.hypot(x - s.x, y - s.y);
        if (d > r) continue;
        arr[idx] += (r - d) * s.strength;
        if (d <= coreR && d < coreDist[idx]) { coreDist[idx] = d; core[idx] = s.fid; }
      }
    }
  }
  const best = new Int16Array(size).fill(UNCLAIMED);
  const bestP = new Float32Array(size);
  const second = new Float32Array(size);
  for (const [fid, arr] of byFid) {
    for (let i = 0; i < size; i++) {
      const p = arr[i];
      if (p <= 0) continue;
      if (p > bestP[i]) { second[i] = bestP[i]; bestP[i] = p; best[i] = fid; }
      else if (p > second[i]) second[i] = p;
    }
  }
  return { best, bestP, second, core, byFid };
}

/** Instant pass: settle unclaimed land and town cores. Safe to run any time. */
export function settleTerritory(t: TerritoryState, sources: readonly InfluenceSource[]): void {
  const P = computePressure(t, sources);
  const size = t.n * t.n;
  for (let i = 0; i < size; i++) {
    const o = t.owner[i];
    if (o === WATER) continue;
    if (P.core[i] >= 0 && o !== P.core[i]) {
      t.owner[i] = P.core[i];
      t.control[i] = CONTROL_MAX;
      t.anchored[i] = 0;
    } else if (o === UNCLAIMED && P.best[i] >= 0) {
      t.owner[i] = P.best[i];
      t.control[i] = 128;
    }
  }
}

/** Monthly pass: frontiers erode, consolidate and flip. Returns the shifts. */
export function advanceTerritory(t: TerritoryState, sources: readonly InfluenceSource[]): BorderShift[] {
  const P = computePressure(t, sources);
  const size = t.n * t.n;
  const shifts = new Map<string, BorderShift>();
  for (let i = 0; i < size; i++) {
    const o = t.owner[i];
    if (o === WATER) continue;
    if (P.core[i] >= 0) {
      if (o !== P.core[i]) {
        if (o >= 0) noteShift(shifts, o, P.core[i]);
        t.owner[i] = P.core[i];
      }
      t.control[i] = CONTROL_MAX;
      continue;
    }
    if (o === UNCLAIMED) {
      if (P.best[i] >= 0) { t.owner[i] = P.best[i]; t.control[i] = 128; }
      continue;
    }
    const po = P.byFid.get(o)?.[i] ?? 0;
    const b = P.best[i];
    const pb = P.bestP[i];
    if (b < 0 || b === o) {
      if (po > 0) t.control[i] = Math.min(CONTROL_MAX, t.control[i] + CONTROL_GAIN);
      else if (!t.anchored[i]) {
        const c = t.control[i] - CONTROL_DECAY_UNREACHED;
        if (c <= 0) { t.owner[i] = UNCLAIMED; t.control[i] = 0; }
        else t.control[i] = c;
      }
      continue;
    }
    const margin = (pb - po) / pb;
    if (margin <= FLIP_MARGIN) {
      t.control[i] = Math.min(CONTROL_MAX, t.control[i] + 5);
      continue;
    }
    const c = t.control[i] - Math.round(60 * margin + 10);
    if (c <= 0) {
      noteShift(shifts, o, b);
      t.owner[i] = b;
      t.control[i] = CONTROL_AFTER_FLIP;
      t.anchored[i] = 0;
    } else {
      t.control[i] = c;
    }
  }
  return [...shifts.values()];
}

function noteShift(m: Map<string, BorderShift>, from: number, to: number): void {
  const k = `${from}>${to}`;
  const s = m.get(k);
  if (s) s.cells++;
  else m.set(k, { from, to, cells: 1 });
}

/** Cells whose holder is under live pressure from a rival claimant. */
export function contestedMask(t: TerritoryState, sources: readonly InfluenceSource[]): Uint8Array {
  const P = computePressure(t, sources);
  const out = new Uint8Array(t.n * t.n);
  for (let i = 0; i < out.length; i++) {
    const o = t.owner[i];
    if (o < 0) continue;
    const po = P.byFid.get(o)?.[i] ?? 0;
    const rival = P.best[i] === o ? P.second[i] : P.bestP[i];
    if (rival > 0 && (t.control[i] < CONTESTED_BELOW || rival > po * (1 - FLIP_MARGIN))) out[i] = 1;
  }
  return out;
}

export function areaByFid(t: TerritoryState): { area: Map<number, number>; land: number } {
  const area = new Map<number, number>();
  let land = 0;
  for (let i = 0; i < t.owner.length; i++) {
    const o = t.owner[i];
    if (o === WATER) continue;
    land++;
    if (o >= 0) area.set(o, (area.get(o) ?? 0) + 1);
  }
  return { area, land };
}

// ---- compact encodings for the save file ----

export function encodeRle(a: Int16Array): string {
  const out: string[] = [];
  let i = 0;
  while (i < a.length) {
    const v = a[i];
    let j = i + 1;
    while (j < a.length && a[j] === v) j++;
    out.push(`${v}*${j - i}`);
    i = j;
  }
  return out.join(',');
}

export function decodeRle(s: string, size: number): Int16Array {
  const a = new Int16Array(size);
  let i = 0;
  for (const run of s.split(',')) {
    const [v, len] = run.split('*').map(Number);
    a.fill(v, i, i + len);
    i += len;
  }
  return a;
}

export interface SerializedTerritory {
  n: number;
  owner: string;
  control: string;
  anchored: string;
}

export function serializeTerritory(t: TerritoryState): SerializedTerritory {
  return {
    n: t.n,
    owner: encodeRle(t.owner),
    control: encodeRle(Int16Array.from(t.control)),
    anchored: encodeRle(Int16Array.from(t.anchored)),
  };
}

export function deserializeTerritory(d: SerializedTerritory): TerritoryState {
  const size = d.n * d.n;
  return {
    n: d.n,
    owner: decodeRle(d.owner, size),
    control: Uint8Array.from(decodeRle(d.control, size)),
    anchored: Uint8Array.from(decodeRle(d.anchored, size)),
  };
}

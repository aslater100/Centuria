import { Rng } from './rng';
import { fbm } from './worldgen';
import type { TownSite } from './worldgen';

export type TileKind = 'grass' | 'tree' | 'water' | 'soil' | 'rock';

export interface Tile {
  kind: TileKind;
  /** farm soil growth 0..100; for trees, regrowth marker (unused in slice) */
  growth: number;
  /** soil tiles: sown this season */
  sown: boolean;
  /** tree marked for chopping by the player */
  marked: boolean;
  /** a built palisade stands here (blocks movement) */
  wall: boolean;
  /** soil productivity multiplier from the land itself (0.3–1.5) */
  fertility: number;
  buildingId: number | null;
}

export interface Vec {
  x: number;
  y: number;
}

export const MAP_W = 64;
export const MAP_H = 64;

const DEFAULT_SITE: TownSite = {
  cellX: 32, cellY: 32, fertility: 1, forest: 0.4, roughness: 0.2, river: true, coastal: false,
};

export class World {
  tiles: Tile[] = [];
  site: TownSite;

  constructor(rng: Rng, site: TownSite = DEFAULT_SITE) {
    this.site = site;
    for (let i = 0; i < MAP_W * MAP_H; i++) {
      this.tiles.push({ kind: 'grass', growth: 0, sown: false, marked: false, wall: false, fertility: 1, buildingId: null });
    }
    this.generate(rng);
  }

  at(x: number, y: number): Tile {
    return this.tiles[y * MAP_W + x];
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
  }

  passable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const t = this.at(x, y);
    return t.kind !== 'water' && t.kind !== 'rock' && t.kind !== 'tree' && !t.wall;
  }

  /**
   * The town map derives from its region cell (GDD-by-way-of-worldgen):
   * fertility paints the soil, forest density places the timber, roughness
   * places the stone, and a river or coast brings water — with everything
   * that implies (irrigation, fishing, floods) downstream in the sim.
   */
  private generate(rng: Rng): void {
    const s = this.site;
    const seed = rng.int(1 << 30);

    // Per-tile fertility: the site's base modulated by smooth noise; river
    // and coast proximity irrigate (filled in after water placement).
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const n = fbm(x / 18, y / 18, seed + 5, 3);
        this.at(x, y).fertility = Math.max(0.3, Math.min(1.5, s.fertility * (0.75 + n * 0.5)));
      }
    }

    // Water: a meandering river east of the start clearing, and/or a western sea.
    if (s.river) {
      for (let y = 0; y < MAP_H; y++) {
        const center = 51 + Math.round((fbm(y / 14, 0.3, seed + 11, 3) - 0.5) * 10);
        const width = 2 + Math.round(fbm(y / 9, 4.2, seed + 13, 2) * 2);
        for (let x = center - Math.floor(width / 2); x <= center + Math.floor(width / 2); x++) {
          if (this.inBounds(x, y)) this.at(x, y).kind = 'water';
        }
      }
    } else {
      const pondX = 8 + rng.int(10);
      const pondY = 40 + rng.int(12);
      this.blob(pondX, pondY, 5 + rng.int(3), 'water', rng);
    }
    if (s.coastal) {
      for (let y = 0; y < MAP_H; y++) {
        const edge = 3 + Math.round(fbm(y / 11, 9.1, seed + 17, 3) * 4);
        for (let x = 0; x < edge; x++) this.at(x, y).kind = 'water';
      }
    }

    // Irrigation: fertility rises near water
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (this.at(x, y).kind !== 'water') continue;
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            if (!this.inBounds(x + dx, y + dy)) continue;
            const d = Math.abs(dx) + Math.abs(dy);
            if (d > 0 && d <= 3) {
              const t = this.at(x + dx, y + dy);
              t.fertility = Math.min(1.5, t.fertility + 0.06 * (4 - d) * 0.5);
            }
          }
        }
      }
    }

    // Timber by forest density; stone by roughness
    const treeBlobs = Math.round(6 + s.forest * 22);
    for (let i = 0; i < treeBlobs; i++) {
      const cx = rng.int(MAP_W);
      const cy = rng.int(MAP_H);
      this.blob(cx, cy, 2 + rng.int(4), 'tree', rng);
    }
    const rockBlobs = Math.round(1 + s.roughness * 7);
    for (let i = 0; i < rockBlobs; i++) {
      this.blob(rng.int(MAP_W), rng.int(MAP_H), 1 + rng.int(2), 'rock', rng);
    }

    // The wagon clearing: a guaranteed buildable heart so no start is unwinnable.
    for (let y = 24; y <= 44; y++) {
      for (let x = 20; x <= 44; x++) {
        const t = this.at(x, y);
        if (t.kind === 'tree' || t.kind === 'rock') t.kind = 'grass';
      }
    }
  }

  private blob(cx: number, cy: number, r: number, kind: TileKind, rng: Rng): void {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (!this.inBounds(x, y)) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r * (0.7 + rng.next() * 0.5) && this.at(x, y).kind === 'grass') {
          this.at(x, y).kind = kind;
        }
      }
    }
  }

  /** BFS path on the tile grid (water/rock/trees block). Returns waypoints excluding start. */
  findPath(from: Vec, to: Vec): Vec[] | null {
    const key = (x: number, y: number) => y * MAP_W + x;
    if (from.x === to.x && from.y === to.y) return [];
    const target = this.passable(to.x, to.y) ? to : this.nearestPassable(to);
    if (!target) return null;
    const prev = new Int32Array(MAP_W * MAP_H).fill(-1);
    const queue: Vec[] = [from];
    prev[key(from.x, from.y)] = key(from.x, from.y);
    const dirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
    ];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur.x === target.x && cur.y === target.y) {
        const path: Vec[] = [];
        let k = key(cur.x, cur.y);
        const startK = key(from.x, from.y);
        while (k !== startK) {
          path.push({ x: k % MAP_W, y: Math.floor(k / MAP_W) });
          k = prev[k];
        }
        return path.reverse();
      }
      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (!this.passable(nx, ny) || prev[key(nx, ny)] !== -1) continue;
        prev[key(nx, ny)] = key(cur.x, cur.y);
        queue.push({ x: nx, y: ny });
      }
    }
    return null;
  }

  nearestPassable(p: Vec): Vec | null {
    for (let r = 1; r < 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (this.passable(p.x + dx, p.y + dy)) return { x: p.x + dx, y: p.y + dy };
        }
      }
    }
    return null;
  }
}

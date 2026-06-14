/**
 * Relationships — Stage 4 behavior port (the social graph) for the scale engine.
 *
 * The fat sim keeps pairwise opinions in a `Map<"loId:hiId", number>` and bonds
 * settlers who recreate together; friends grieve harder when one dies. A social
 * graph is inherently sparse and pairwise, so — unlike the per-agent need/skill
 * columns — a flat N×N matrix would waste O(agents²) memory. The right
 * data-oriented choice here is a sparse map keyed by a packed integer pair key
 * (cheaper than string keys: no per-bond allocation), which is what `Relations`
 * is. Thoughts, by contrast, are hot per-agent state and live as bounded slot
 * columns on `AgentStore`.
 *
 * `socialize()` is the bonding pass: agents sharing a recreation room (a tavern
 * with table capacity) grow their mutual opinion — the SoA analogue of the fat
 * sim's "friendships form around the fire". Pure, DOM-free, additive.
 *
 * Run the self-check:  npx tsx src/sim/social.ts
 */
import type { BuildGrid } from './build';
import type { AgentStore } from './agents';
import { TUNING } from './defs';
// Runtime imports used only by the self-check (guarded — won't fire on import).
import { BuildGrid as BuildGridImpl } from './build';
import { AgentStore as AgentStoreImpl } from './agents';
import { ROOM_TYPE_ID, MINUTES_PER_TICK } from './defs';

export const FRIEND_THRESHOLD = TUNING.friendThreshold;       // opinion ≥ this = friends
const BOND_PER_HOUR = TUNING.bondPerHourTogether;             // opinion gained co-recreating
const OPINION_MAX = 100;
// Packed pair key: lo occupies the high bits, hi the low. Agent ids stay well
// below 2^21 (≈2.1M) for any town, so this is collision-free and allocation-free.
const KEY_MUL = 1 << 21;

/** Sparse pairwise opinion store (0..100), keyed by unordered agent-id pairs. */
export class Relations {
  private op = new Map<number, number>();

  private static key(a: number, b: number): number {
    return a < b ? a * KEY_MUL + b : b * KEY_MUL + a;
  }

  /** Raise the mutual opinion of a and b by `amount` (clamped to 100). */
  bond(a: number, b: number, amount: number): void {
    if (a === b) return;
    const k = Relations.key(a, b);
    this.op.set(k, Math.min(OPINION_MAX, (this.op.get(k) ?? 0) + amount));
  }

  opinion(a: number, b: number): number {
    return this.op.get(Relations.key(a, b)) ?? 0;
  }

  areFriends(a: number, b: number): boolean {
    return this.opinion(a, b) >= FRIEND_THRESHOLD;
  }

  /** Drop every pair touching `id` — call when an agent dies/leaves. */
  forget(id: number): void {
    for (const k of this.op.keys()) {
      if (Math.floor(k / KEY_MUL) === id || k % KEY_MUL === id) this.op.delete(k);
    }
  }

  get size(): number {
    return this.op.size;
  }

  /** Stable round-trip: entries in insertion order (so a reload replays identically). */
  serialize(): [number, number][] {
    return [...this.op.entries()];
  }

  static deserialize(data: [number, number][] | undefined): Relations {
    const r = new Relations();
    for (const [k, v] of data ?? []) r.op.set(k, v);
    return r;
  }
}

/**
 * One tick of bonding: every pair of agents standing in the same recreation room
 * (a room with table/recreation capacity) grows its mutual opinion. Cost is
 * O(Σ occupants_per_rec_room²) — bounded by table capacity, so cheap.
 */
export function socialize(grid: BuildGrid, agents: AgentStore, rel: Relations, minutesPerTick: number): void {
  const gain = BOND_PER_HOUR * (minutesPerTick / 60);
  // Which rooms offer recreation? (cache once — rooms ≪ agents)
  const recRooms = new Set<number>();
  for (const room of grid.rooms) {
    if (grid.roomOutput(room).recreation > 0) recRooms.add(room.id);
  }
  if (recRooms.size === 0) return;

  // Bucket agent indices by recreation room.
  const byRoom = new Map<number, number[]>();
  for (let i = 0; i < agents.count; i++) {
    const x = Math.floor(agents.posX[i]);
    const y = Math.floor(agents.posY[i]);
    if (!grid.inBounds(x, y)) continue;
    const rid = grid.roomId[grid.index(x, y)];
    if (rid < 0 || !recRooms.has(rid)) continue;
    let list = byRoom.get(rid);
    if (!list) byRoom.set(rid, (list = []));
    list.push(i);
  }

  for (const list of byRoom.values()) {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        rel.bond(agents.id[list[a]], agents.id[list[b]], gain);
      }
    }
  }
}

// --- self-check: npx tsx src/sim/social.ts ---
if (typeof process !== 'undefined' && process.argv[1]?.endsWith('/social.ts')) {
  const rel = new Relations();
  rel.bond(1, 2, 10);
  rel.bond(2, 1, 8); // same pair, order-independent
  console.assert(rel.opinion(1, 2) === 18 && rel.opinion(2, 1) === 18, 'symmetric bond accrues');
  console.assert(!rel.areFriends(1, 2) === (18 < FRIEND_THRESHOLD), 'friend threshold');
  rel.bond(1, 2, 200);
  console.assert(rel.opinion(1, 2) === 100, 'opinion clamps at 100');
  rel.forget(1);
  console.assert(rel.opinion(1, 2) === 0, 'forget drops pairs touching the id');

  // Round-trip.
  rel.bond(3, 4, 20);
  const r2 = Relations.deserialize(rel.serialize());
  console.assert(r2.opinion(3, 4) === 20, 'relations round-trip');

  // socialize: two agents in a tavern bond; one outside does not.
  const TAVERN = ROOM_TYPE_ID.get('tavern')!;
  const g = new BuildGridImpl(16, 16);
  g.designateRect(2, 2, 6, 6, TAVERN);
  for (let x = 1; x <= 7; x++) { g.setWall(x, 1); g.setWall(x, 7); }
  for (let y = 1; y <= 7; y++) { g.setWall(1, y); g.setWall(7, y); }
  g.placeStation('table', 3, 3);
  g.rebuildRooms();
  const agents = new AgentStoreImpl(4);
  const a = agents.spawn(3, 3);
  const b = agents.spawn(4, 4);
  agents.spawn(12, 12); // outsider
  const rel2 = new Relations();
  for (let t = 0; t < 50; t++) socialize(g, agents, rel2, MINUTES_PER_TICK);
  console.assert(rel2.opinion(agents.id[a], agents.id[b]) > 0, 'co-tavern agents bonded');
  console.assert(rel2.size === 1, 'only the in-tavern pair bonded');

  console.log('social.ts self-check OK — opinion(3,4)', r2.opinion(3, 4), 'pairs', rel2.size);
}

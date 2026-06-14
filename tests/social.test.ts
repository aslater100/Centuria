import { describe, expect, it } from 'vitest';
import { AgentStore, AState, ThoughtKey, THOUGHT_SLOTS } from '../src/sim/agents';
import { Relations, socialize, FRIEND_THRESHOLD } from '../src/sim/social';
import { BuildGrid } from '../src/sim/build';
import { TownCore } from '../src/sim/towncore';
import { ROOM_TYPE_ID, MINUTES_PER_TICK, MINUTES_PER_DAY } from '../src/sim/defs';

// Stage 4 behavior port: the social graph (pairwise opinions + bonding) and
// per-agent thoughts feeding mood, plus grief on death. Mirrors the fat sim's
// "friendships form around the fire" + "the dead grieve the living".

const TAVERN = ROOM_TYPE_ID.get('tavern')!;
const KITCHEN = ROOM_TYPE_ID.get('kitchen')!;
const HOME = ROOM_TYPE_ID.get('home')!;
const noop = () => 0;
const TICKS_PER_DAY = MINUTES_PER_DAY / MINUTES_PER_TICK;

describe('Relations', () => {
  it('bonds are symmetric and clamp at 100', () => {
    const r = new Relations();
    r.bond(2, 5, 30);
    expect(r.opinion(2, 5)).toBe(30);
    expect(r.opinion(5, 2)).toBe(30); // order-independent
    r.bond(5, 2, 200);
    expect(r.opinion(2, 5)).toBe(100);
  });

  it('areFriends respects the threshold', () => {
    const r = new Relations();
    r.bond(1, 2, FRIEND_THRESHOLD - 1);
    expect(r.areFriends(1, 2)).toBe(false);
    r.bond(1, 2, 1);
    expect(r.areFriends(1, 2)).toBe(true);
  });

  it('forget drops every pair touching an id', () => {
    const r = new Relations();
    r.bond(1, 2, 20); r.bond(1, 3, 20); r.bond(2, 3, 20);
    r.forget(1);
    expect(r.opinion(1, 2)).toBe(0);
    expect(r.opinion(1, 3)).toBe(0);
    expect(r.opinion(2, 3)).toBe(20); // untouched
  });

  it('round-trips through serialize/deserialize', () => {
    const r = new Relations();
    r.bond(7, 9, 42);
    const r2 = Relations.deserialize(r.serialize());
    expect(r2.opinion(7, 9)).toBe(42);
  });
});

describe('socialize — bonding around the tavern', () => {
  function tavern(): BuildGrid {
    const g = new BuildGrid(16, 16);
    g.designateRect(2, 2, 6, 6, TAVERN);
    for (let x = 1; x <= 7; x++) { g.setWall(x, 1); g.setWall(x, 7); }
    for (let y = 1; y <= 7; y++) { g.setWall(1, y); g.setWall(7, y); }
    g.placeStation('table', 3, 3);
    g.rebuildRooms();
    return g;
  }

  it('co-tavern agents bond; an outsider does not', () => {
    const g = tavern();
    const a = new AgentStore(4);
    const x = a.spawn(3, 3);
    const y = a.spawn(4, 4);
    const z = a.spawn(12, 12);
    const rel = new Relations();
    for (let t = 0; t < 100; t++) socialize(g, a, rel, MINUTES_PER_TICK);
    expect(rel.opinion(a.id[x], a.id[y])).toBeGreaterThan(0);
    expect(rel.opinion(a.id[x], a.id[z])).toBe(0);
  });

  it('no bonding without a recreation room', () => {
    const g = new BuildGrid(10, 10);
    g.designateRect(1, 1, 4, 4, KITCHEN); // no recreation capacity
    g.rebuildRooms();
    const a = new AgentStore(4);
    a.spawn(2, 2); a.spawn(3, 3);
    const rel = new Relations();
    for (let t = 0; t < 50; t++) socialize(g, a, rel, MINUTES_PER_TICK);
    expect(rel.size).toBe(0);
  });
});

describe('thoughts — mood modifiers', () => {
  it('a negative thought drags mood below the needs-only baseline', () => {
    const a = new AgentStore(2);
    const plain = a.spawn(0, 0);
    const sad = a.spawn(0, 0);
    a.addThought(sad, 0, -20, 100 * TICKS_PER_DAY); // long-lived gloom
    for (let t = 0; t < 200; t++) {
      // hold needs equal so only the thought differs
      for (const i of [plain, sad]) { a.food[i] = a.rest[i] = a.warmth[i] = a.recreation[i] = a.social[i] = 60; }
      a.tick(t, noop);
    }
    expect(a.mood[sad]).toBeLessThan(a.mood[plain]);
  });

  it('a thought stops affecting mood after it expires', () => {
    const a = new AgentStore(2);
    const i = a.spawn(0, 0);
    a.addThought(i, 0, -30, 5); // expires after tick 5
    a.tick(0, noop);
    const low = a.mood[i];
    for (let t = 1; t < 60; t++) { a.food[i] = a.rest[i] = a.warmth[i] = a.recreation[i] = a.social[i] = 70; a.tick(t, noop); }
    expect(a.mood[i]).toBeGreaterThan(low); // recovered once the gloom lifted
  });

  it('a keyed thought refreshes in place instead of stacking', () => {
    const a = new AgentStore(2);
    const i = a.spawn(0, 0);
    for (let k = 0; k < THOUGHT_SLOTS + 4; k++) a.addThought(i, 0, -5, 100, ThoughtKey.Breakdown);
    // Only one Breakdown slot is live → mood target reflects a single -5, not many.
    a.food[i] = a.rest[i] = a.warmth[i] = a.recreation[i] = a.social[i] = 60;
    a.tick(0, noop);
    // Baseline target would be 60 (+0). With one -5 thought it eases toward 55, not lower.
    // Compare to an agent carrying six distinct one-off -5 thoughts.
    const b = a.spawn(0, 0);
    for (let k = 0; k < THOUGHT_SLOTS; k++) a.addThought(b, 0, -5, 100, ThoughtKey.Anon);
    b && (a.food[b] = a.rest[b] = a.warmth[b] = a.recreation[b] = a.social[b] = 60);
    a.tick(1, noop);
    expect(a.mood[b]).toBeLessThan(a.mood[i]); // stacked one-offs hurt more than one refreshed key
  });

  it('thought slots survive a serialize round-trip', () => {
    const a = new AgentStore(2);
    const i = a.spawn(0, 0);
    a.addThought(i, 0, -12, 500, ThoughtKey.Breakdown);
    const r = AgentStore.deserialize(a.serialize());
    // The restored agent carries the same live thought (mood drags the same way).
    r.food[0] = r.rest[0] = r.warmth[0] = r.recreation[0] = r.social[0] = 60;
    a.food[i] = a.rest[i] = a.warmth[i] = a.recreation[i] = a.social[i] = 60;
    r.tick(1, noop); a.tick(1, noop);
    expect(r.mood[0]).toBeCloseTo(a.mood[i]);
  });
});

describe('grief on death (TownCore)', () => {
  function colony(): TownCore {
    const core = new TownCore({ width: 24, height: 24, seed: 3 });
    const g = core.grid;
    g.designateRect(2, 2, 9, 5, KITCHEN);
    for (let x = 1; x <= 10; x++) { g.setWall(x, 1); g.setWall(x, 6); }
    for (let y = 1; y <= 6; y++) { g.setWall(1, y); g.setWall(10, y); }
    for (let k = 0; k < 3; k++) g.placeStation('oven', 2 + k * 2, 2);
    g.designateRect(2, 9, 9, 12, HOME);
    for (let x = 1; x <= 10; x++) { g.setWall(x, 8); g.setWall(x, 13); }
    for (let y = 8; y <= 13; y++) { g.setWall(1, y); g.setWall(10, y); }
    for (let k = 0; k < 6; k++) g.placeStation('bed', 2 + k * 2, 9);
    g.rebuildRooms();
    core.stock.add('grain', 5000);
    core.seedColony(3, 3, 4);
    return core;
  }

  it('a death leaves grief thoughts that sour the survivors’ mood', () => {
    const core = colony();
    core.run(20); // let moods settle high (well fed)
    const a = core.agents;
    const survivors = a.count - 1;
    const moodBefore = core.averageMood();
    // Kill one settler outright this tick.
    a.health[0] = 0; a.food[0] = 0;
    core.tick();
    expect(a.count).toBe(survivors);
    expect(core.deaths).toBe(1);
    // Survivors now carry grief → average mood eases down over the next days.
    core.run(40);
    expect(core.averageMood()).toBeLessThan(moodBefore);
  });

  it('friends grieve harder than acquaintances', () => {
    const core = colony();
    const a = core.agents;
    // Make agent 1 a close friend of the about-to-die agent 0; agent 2 a stranger.
    core.relations.bond(a.id[0], a.id[1], 80);
    const friendIdx = 1, strangerIdx = 2;
    const friendId = a.id[friendIdx], strangerId = a.id[strangerIdx];
    a.health[0] = 0; a.food[0] = 0;
    core.tick(); // agent 0 dies → grief dealt to survivors (indices shift via swap-remove)
    const find = (id: number) => { for (let i = 0; i < a.count; i++) if (a.id[i] === id) return i; return -1; };
    const fi = find(friendId), si = find(strangerId);
    // Freeze needs equal and let the grief thoughts act; the friend ends up sadder.
    for (let t = 0; t < 30; t++) {
      for (const i of [fi, si]) { a.food[i] = a.rest[i] = a.warmth[i] = a.recreation[i] = a.social[i] = 70; }
      a.tick(100 + t, noop);
    }
    expect(a.mood[fi]).toBeLessThan(a.mood[si]);
  });
});

describe('TownCore relations serialization', () => {
  it('round-trips bonds with the rest of the core state', () => {
    const core = new TownCore({ width: 16, height: 16, seed: 1 });
    core.seedColony(8, 8, 3);
    core.relations.bond(core.agents.id[0], core.agents.id[1], 25);
    const restored = TownCore.deserialize(JSON.parse(JSON.stringify(core.serialize())));
    expect(restored.relations.opinion(core.agents.id[0], core.agents.id[1])).toBe(25);
  });

  it('a restored core with bonds + thoughts continues deterministically', () => {
    const core = new TownCore({ width: 20, height: 20, seed: 8 });
    core.grid.designateRect(2, 2, 6, 6, TAVERN);
    for (let x = 1; x <= 7; x++) { core.grid.setWall(x, 1); core.grid.setWall(x, 7); }
    for (let y = 1; y <= 7; y++) { core.grid.setWall(1, y); core.grid.setWall(7, y); }
    core.grid.placeStation('table', 3, 3);
    core.grid.rebuildRooms();
    core.seedColony(4, 4, 3);
    core.run(60); // bonds accrue in the tavern
    const twin = TownCore.deserialize(JSON.parse(JSON.stringify(core.serialize())));
    core.run(80); twin.run(80);
    expect(JSON.stringify(twin.serialize())).toBe(JSON.stringify(core.serialize()));
  });
});

import { describe, expect, it } from 'vitest';
import { RegionSim, INTERMEDIATE_GOODS, type Settlement } from '../src/sim/region';
import { tickPriceArbitrage } from '../src/sim/systems/arbitrage';
import { localGoodDemand } from '../src/sim/systems/goods';

/**
 * Demand-aware GLOBAL shipping (PR-3 follow-on). Slice 3 priced each good per town
 * from local stock vs. demand and shipped cheap→dear, but the matcher walked each
 * town PAIR in isolation and shipped that pair's single biggest local gap — so a
 * scarce surplus was split by settlement-array order and a lane could carry only one
 * good. `tickPriceArbitrage` now gathers EVERY profitable (good, cheap source → dear
 * market) opportunity network-wide and dispatches them largest-gap-first: the most
 * acute shortage anywhere pulls from its cheapest reachable supplier first (so a
 * limited surplus reaches the neediest town, not the earliest-indexed one), and a
 * pair can carry a different good in each direction.
 *
 * The fixtures mirror goods-prices.test.ts: hand-built player towns with pinned
 * sector outputs and an explicit `goodStocks` ledger, plus cheap road links so the
 * congestion tariff (0.1 here) is below the per-unit price gaps. No ticking → no
 * AI-founded towns to contaminate the ledger.
 */

/** base £-value of a good = 1 + its intermediate-input count (mirror of goods.ts). */
function basePrice(id: string): number {
  const inter = new Set(INTERMEDIATE_GOODS.map((g) => g.id));
  const g = INTERMEDIATE_GOODS.find((x) => x.id === id)!;
  return 1 + g.inputs.filter((i) => inter.has(i)).length;
}

/** Build a sim with `layout.length` player towns, pinned sector outputs and an empty
 *  ledger, the reported year pinned so every good is unlocked. */
function townsSim(layout: Array<{ ind: number; agri: number }>, year = 2000): RegionSim {
  const r = RegionSim.create(7);
  const base = r.settlements[0];
  while (r.settlements.length < layout.length) {
    const clone = structuredClone(base) as Settlement;
    clone.id = base.id + r.settlements.length;
    clone.name = `Town ${r.settlements.length}`;
    r.settlements.push(clone);
  }
  layout.forEach((l, i) => {
    const s = r.settlements[i];
    s.sectors.industry.output = l.ind;
    s.sectors.agriculture.output = l.agri;
    s.goodStocks = {};
  });
  Object.defineProperty(r, 'year', { get: () => year, configurable: true });
  return r;
}

/** A cheap road link (10-cell path, condition 100) → congestion tariff 0.1, below the
 *  ~£0.5–2 per-unit gaps the fixtures open, so a real gap always clears the friction. */
function link(r: RegionSim, a: Settlement, b: Settlement): void {
  r.routes.push({
    a: a.id, b: b.id, kind: 'road', condition: 100,
    path: Array.from({ length: 10 }, () => ({ x: 0, y: 0 })),
    terrainCost: 10, freight: 0, cargoType: null, cargoPriority: null,
  });
}

/** Saturate a town on EVERY unlocked good so it prices them all at base (no false
 *  gap on a good the test isn't probing). The probed good is then set explicitly. */
function stockFull(r: RegionSim, t: Settlement): void {
  t.goodStocks ??= {};
  for (const g of INTERMEDIATE_GOODS) if (r.year >= g.eraUnlock) t.goodStocks[g.id] = 9999;
}

// ============================================================
// 1. Inert in balanced play — the byte-identical guarantee
// ============================================================
describe('demand-aware arbitrage is inert in self-sufficient play', () => {
  it('dispatches no shipments when every town holds at least its demand of every good', () => {
    const r = townsSim([
      { ind: 100, agri: 100 },
      { ind: 100, agri: 100 },
      { ind: 100, agri: 100 },
    ]);
    for (const t of r.settlements) stockFull(r, t);
    link(r, r.settlements[0], r.settlements[1]);
    link(r, r.settlements[1], r.settlements[2]);
    link(r, r.settlements[0], r.settlements[2]);
    tickPriceArbitrage(r);
    expect(r.tradeFlows).toHaveLength(0);
  });

  it('dispatches nothing when towns have a gap but no route connects them', () => {
    const r = townsSim([
      { ind: 0, agri: 100 }, // agri source, flush textiles
      { ind: 100, agri: 0 }, // industry market, starved of textiles
    ]);
    stockFull(r, r.settlements[0]);
    stockFull(r, r.settlements[1]);
    r.settlements[1].goodStocks!['textiles'] = 0; // a real gap exists…
    tickPriceArbitrage(r); // …but no link() → no route → no shipment
    expect(r.tradeFlows).toHaveLength(0);
  });
});

// ============================================================
// 2. Demand priority — a scarce surplus reaches the NEEDIEST market first,
//    regardless of settlement-array order (the global-matcher win).
// ============================================================
describe('demand priority over settlement order', () => {
  it('routes a limited surplus to the dearest market first, even when it is later in the array', () => {
    // 0 = agri source (demands no textiles → prices at base, holds a LIMITED 5 units).
    // 1 = the LESS needy market (half-stocked → smaller gap), earlier in the array.
    // 2 = the MOST needy market (empty → biggest gap), later in the array.
    const r = townsSim([
      { ind: 0, agri: 100 },
      { ind: 100, agri: 0 },
      { ind: 100, agri: 0 },
    ]);
    for (const t of r.settlements) stockFull(r, t);
    const src = r.settlements[0], lessNeedy = r.settlements[1], mostNeedy = r.settlements[2];
    src.goodStocks!['textiles'] = 5; // the only surplus to allocate
    const demand = localGoodDemand(r, lessNeedy, 'textiles');
    expect(demand).toBeGreaterThan(0);
    lessNeedy.goodStocks!['textiles'] = demand * 0.5; // scarcity 0.5 → price 1.5×base
    mostNeedy.goodStocks!['textiles'] = 0;            // scarcity 1.0 → price 2.0×base
    link(r, src, lessNeedy);
    link(r, src, mostNeedy);

    tickPriceArbitrage(r);

    // The full 5-unit surplus goes to the neediest town; the less-needy one — earlier
    // in the array — gets nothing because the supply is already committed.
    expect(r.tradeFlows).toHaveLength(1);
    const flow = r.tradeFlows[0];
    expect(flow.goodId).toBe('textiles');
    expect(flow.toSettlementId).toBe(mostNeedy.id);
    expect(flow.fromSettlementId).toBe(src.id);
    expect(flow.cargo).toBe(5);
    expect(src.goodStocks!['textiles']).toBe(0); // source fully drained
  });
});

// ============================================================
// 3. Bidirectional trade on one pair — each town exports what it is flush with
//    and imports what it lacks (a lane can now carry a different good each way).
// ============================================================
describe('bidirectional trade on a single pair', () => {
  it('ships components one way and steel the other between two industry towns', () => {
    const x = { ind: 100, agri: 0 };
    const r = townsSim([x, x]);
    const tx = r.settlements[0], ty = r.settlements[1];
    stockFull(r, tx);
    stockFull(r, ty);
    tx.goodStocks!['steel'] = 0;       // tx short on steel  → imports it
    ty.goodStocks!['components'] = 0;   // ty short on components → imports it
    link(r, tx, ty);

    tickPriceArbitrage(r);

    expect(r.tradeFlows).toHaveLength(2);
    const components = r.tradeFlows.find((f) => f.goodId === 'components')!;
    const steel = r.tradeFlows.find((f) => f.goodId === 'steel')!;
    expect(components.fromSettlementId).toBe(tx.id); // tx flush → exports components
    expect(components.toSettlementId).toBe(ty.id);
    expect(steel.fromSettlementId).toBe(ty.id);      // ty flush → exports steel
    expect(steel.toSettlementId).toBe(tx.id);
  });
});

// ============================================================
// 4. Determinism — identical setup ⇒ identical dispatched flows
// ============================================================
describe('global dispatch is deterministic', () => {
  function scenario(): RegionSim {
    const r = townsSim([
      { ind: 0, agri: 100 },
      { ind: 100, agri: 0 },
      { ind: 100, agri: 0 },
      { ind: 60, agri: 40 },
    ]);
    for (const t of r.settlements) stockFull(r, t);
    r.settlements[0].goodStocks!['textiles'] = 8;
    r.settlements[1].goodStocks!['textiles'] = 0;
    r.settlements[2].goodStocks!['textiles'] = 0;
    r.settlements[3].goodStocks!['steel'] = 0;
    for (let i = 0; i < r.settlements.length; i++)
      for (let j = i + 1; j < r.settlements.length; j++)
        link(r, r.settlements[i], r.settlements[j]);
    return r;
  }
  it('produces byte-identical tradeFlows across two independent runs', () => {
    const a = scenario(); tickPriceArbitrage(a);
    const b = scenario(); tickPriceArbitrage(b);
    expect(a.tradeFlows).toEqual(b.tradeFlows);
    expect(a.tradeFlows.length).toBeGreaterThan(0); // the scenario actually ships
  });

  it('respects one in-flight shipment per directed lane', () => {
    const r = scenario();
    tickPriceArbitrage(r); // dispatch once
    const after = r.tradeFlows.length;
    expect(after).toBeGreaterThan(0);
    tickPriceArbitrage(r); // immediately again — lanes are busy, sources drained
    // No directed lane carries two shipments.
    const lanes = r.tradeFlows.map((f) => `${f.fromSettlementId}>${f.toSettlementId}`);
    expect(new Set(lanes).size).toBe(lanes.length);
  });
});

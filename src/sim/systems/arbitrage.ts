/**
 * Price arbitrage & physical trade-route shipments (Phase 15 / GDD §5.2) — the
 * third `region.ts` tick subsystem extracted to the roadmap's free-function form
 * `fn(r: RegionSim, …)` (Track C). See systems/pollution.ts for the rationale:
 * the body runs verbatim against the same RegionSim so the RNG-consumption order
 * is untouched, tick() dispatches, all state + serialize() stay on RegionSim, and
 * the byte-identical serialize() diff is guarded by tests/serialize-determinism.
 *
 * This is the first extracted subsystem that DOES consume RNG (the delivery /
 * stranding log lines) and mutates the per-town goods ledger (`addGoodStock`/
 * `shipGoodFrom`, now public for this seam) — moving it without moving a single
 * draw is exactly what the free-function form preserves. It's the natural leaf to
 * lift now that it has grown a physical-cargo leg (PR-3 slice 1): the trade-route
 * shipment pipeline is self-contained, and pulling it out of the 14k-line monolith
 * clears the way for the per-town supply solve (PR-3 slice 2) that builds on it.
 */
import type { RegionSim } from '../region';
import { INTERMEDIATE_GOODS } from '../region';
import { localGoodPrice } from './goods';
import { DAYS_PER_MONTH, formatCurrency } from '../defs';

/** PR-3 slice 3 — profit scale for a price-driven shipment: pendingIncome =
 *  cargo × priceGap × (1 − tariff) × this. Keeps arbitrage a minor treasury trickle
 *  (the gap is O(£1/unit), cargo ≤ the volume cap), in the spirit of the old
 *  wage-gap proxy's `volume × tariff × 5`. */
const ARBITRAGE_PROFIT_SCALE = 5;

/** Compute a congestion tariff for a goods route between two settlements.
 *  tariff = routeDistance × (1 + (1 − routeCondition/100) × 0.5), clamped 0.05–0.3. */
export function computeCongestionTariff(r: RegionSim, fromId: number, toId: number): number {
  const route = r.routes.find(
    (rt) => (rt.a === fromId && rt.b === toId) || (rt.a === toId && rt.b === fromId)
  );
  if (!route) return 0.3; // no route = maximum friction

  const routeDistance = route.path.length;
  const routeCondition = route.condition;
  const tariff = (routeDistance / 100) * (1 + (1 - routeCondition / 100) * 0.5);
  return Math.max(0.05, Math.min(0.3, tariff));
}

/** Tick price arbitrage between player settlements (GDD §5.2: physical goods on
 *  routes, transit × congestion). Goods physically travel: a flow's arbitrage
 *  profit is paid out only when the shipment ARRIVES (after `transitDays` of
 *  travel, which congestion lengthens), and a flow whose route is severed
 *  mid-transit is lost. Where a price differential exceeds congestion costs and
 *  no shipment is already en route, a new flow is dispatched. */
export function tickPriceArbitrage(r: RegionSim): void {
  // 1. Advance in-transit shipments. Deliver those that arrive (pay out their
  //    pending income); strand those whose route has been severed.
  const stillMoving: typeof r.tradeFlows = [];
  let delivered = 0;
  let stranded = 0;
  for (const flow of r.tradeFlows) {
    // A flow needs a live route the whole way; a SEVERED lane loses its cargo.
    // (A merely-congested route still delivers — only a missing one strands, so
    // test for the route's existence, not the clamped-max congestion tariff.)
    const hasRoute = r.routes.some(
      (rt) =>
        (rt.a === flow.fromSettlementId && rt.b === flow.toSettlementId) ||
        (rt.a === flow.toSettlementId && rt.b === flow.fromSettlementId),
    );
    if (!hasRoute) {
      stranded++;
      continue;
    }
    flow.transitDays -= DAYS_PER_MONTH;
    if (flow.transitDays <= 0) {
      delivered += flow.pendingIncome;
      // Land the physical cargo in the destination town's ledger (the source was
      // debited on dispatch). A vanished destination simply drops the cargo.
      if (flow.cargo > 0) {
        const dest = r.settlement(flow.toSettlementId);
        if (dest !== undefined) r.addGoodStock(dest, flow.goodId, flow.cargo);
      }
    } else {
      stillMoving.push(flow);
    }
  }
  r.tradeFlows = stillMoving;
  if (delivered > 0) {
    r.treasury += delivered;
    if (r.rng.chance(0.1)) {
      r.addLog(`Goods arrive: shipments deliver ${formatCurrency(Math.round(delivered))} in arbitrage profit.`, 'good');
    }
  }
  if (stranded > 0 && r.rng.chance(0.15)) {
    r.addLog(`Goods stranded: a severed route loses ${stranded} shipment${stranded > 1 ? 's' : ''} in transit.`, 'bad');
  }

  // 2. Dispatch new shipments where a PER-GOOD price gap beats the congestion cost.
  //    PR-3 slice 3 drops the wage-gap proxy: each good is now priced per town from
  //    its local stock vs. demand (`localGoodPrice`, in systems/goods.ts), so a town
  //    short on a good prices it dear and a town flush with it prices it cheap. For
  //    each lane we ship the good with the largest profitable gap, from the cheap
  //    (abundant) town to the dear (short) one — so a deprived town pulls exactly the
  //    good it needs, where the proxy shipped `goodIds[0]` regardless. In balanced /
  //    self-sufficient play every town holds what it consumes → every price is base →
  //    no gap → no shipment (arbitrage idles until a real shortage opens a spread).
  const playerSettlements = r.settlements.filter(s => s.factionId === r.playerFactionId);
  if (playerSettlements.length < 2) return;

  const goodIds = INTERMEDIATE_GOODS
    .filter(g => r.year >= g.eraUnlock)
    .map(g => g.id);
  if (goodIds.length === 0) return; // no goods unlocked yet → nothing to price/ship

  for (let i = 0; i < playerSettlements.length; i++) {
    for (let j = i + 1; j < playerSettlements.length; j++) {
      const from = playerSettlements[i];
      const to = playerSettlements[j];
      const tariff = computeCongestionTariff(r, from.id, to.id);
      if (tariff >= 0.3) continue; // no route

      // Find the good with the largest price gap the cheaper town can actually
      // supply (it must hold stock to ship). The cheaper town is the source, the
      // dearer the market — buy low, sell high.
      let best: { goodId: string; source: typeof from; market: typeof from; gap: number } | null = null;
      for (const goodId of goodIds) {
        const priceFrom = localGoodPrice(r, from, goodId);
        const priceTo = localGoodPrice(r, to, goodId);
        if (priceFrom === priceTo) continue;
        const source = priceFrom < priceTo ? from : to; // lower price — abundant
        const market = priceFrom < priceTo ? to : from; // higher price — short
        if ((source.goodStocks?.[goodId] ?? 0) <= 0) continue; // can't ship what it lacks
        const gap = Math.abs(priceFrom - priceTo);
        if (best === null || gap > best.gap) best = { goodId, source, market, gap };
      }
      if (best === null) continue;
      // The per-unit gap must clear the per-unit congestion friction, or the trip
      // doesn't pay. (tariff ∈ [0.05, 0.3]; a cross-sector shortage opens a gap of
      // ~£1/unit, so a real shortage clears this and balanced play does not.)
      if (best.gap <= tariff) continue;

      // Only one shipment per directed lane at a time — wait for it to arrive.
      const existing = r.tradeFlows.find(
        f => f.fromSettlementId === best!.source.id && f.toSettlementId === best!.market.id
      );
      if (existing) continue;

      const volume = Math.min(10, best.gap * 5); // gap O(£1) → up to ~5–10 units
      // Move the real units the source town can spare (≤ volume) out of its ledger;
      // they ride to the dear market and relieve its shortage on arrival (its local
      // price falls as stock lands → the gate that gated its production reopens).
      const cargo = r.shipGoodFrom(best.source, best.goodId, volume);
      if (cargo <= 0) continue; // nothing actually moved (defensive)
      r.tradeFlows.push({
        goodId: best.goodId,
        fromSettlementId: best.source.id,
        toSettlementId: best.market.id,
        volume,
        // Congestion sets the travel time (≥1 day so a shipment always spends a
        // tick in transit); the profit lands when it arrives, not now.
        transitDays: Math.max(1, Math.round(tariff * 100)),
        congestionTariff: tariff,
        // Profit is the realised spread on the units shipped, eroded by congestion.
        pendingIncome: cargo * best.gap * (1 - tariff) * ARBITRAGE_PROFIT_SCALE,
        cargo,
      });
    }
  }
}

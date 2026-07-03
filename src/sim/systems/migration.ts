/**
 * Internal migration (GDD §5.5) — Track-C tick subsystem lifted to fn(r: RegionSim).
 * Body VERBATIM (this.→r.); dispatched monthly; no RNG. People follow contentment
 * and pay down the route network; state + serialize() stay on RegionSim.
 */
import type { RegionSim } from '../region';
import type { Settlement } from '../region';

/** Move a slow trickle from the least- to the most-appealing town, network-gated. */
export function migrate(r: RegionSim): void {
    if (r.settlements.length < 2) return;
    // People follow both contentment and pay (Phase 1): a booming mill town
    // pulls labor off poor farms even when life there is pleasant enough.
    const regionWage = r.settlements.reduce((s, t) => s + r.avgWageOf(t), 0) / r.settlements.length;
    const score = (t: Settlement) => t.satisfaction + (r.avgWageOf(t) - regionWage) * 30;
    // One pass for the magnet and the source — no full sort, and avgWageOf runs
    // once per town instead of O(n log n) times through a comparator.
    let best = r.settlements[0], worst = r.settlements[0];
    let bestScore = score(best), worstScore = bestScore;
    for (const t of r.settlements) {
      const sc = score(t);
      if (sc > bestScore) { bestScore = sc; best = t; }      // first max (matches stable sort [0])
      if (sc <= worstScore) { worstScore = sc; worst = t; }  // last min (matches stable sort [last])
    }
    // Don't feed an already-overcrowded destination; cap the capital magnet effect.
    const destFull = r.popOf(best) >= best.housing;
    if (bestScore - worstScore > 15 && r.popOf(worst) > 10 && !destFull) {
      // movers ride the network too: without a route, only a trickle walks out
      const connected = r.routePath(worst.id, best.id) !== null;
      // 1% per month (was 2%): urbanization is gradual, not a mass exodus
      const movers = r.popOf(worst) * 0.01 * (connected ? 1 : 0.3);
      r.removePop(worst, movers);
      best.cohorts.bands[1] += movers * 0.7;
      best.cohorts.bands[2] += movers * 0.3;
    }
    warRefugees(r); // GDD §7.4: war front-lines bleed refugees toward safety
  }

/** One faction's front-line settlements (enemy army group present) bleed
 *  refugees toward its own largest settlement not under direct threat.
 *  Returns the population moved and the destination, or null if no source or
 *  destination qualifies. */
function bleedFrontLine(
  r: RegionSim,
  homeId: number,
  enemyId: number,
  flightRate: number,
): { moved: number; dest: Settlement } | null {
  const home = r.settlements.filter((t) => t.factionId === homeId);
  if (home.length < 2) return null;
  const frontLine = home.filter(
    (t) => r.popOf(t) > 5 && r.armyGroups.some((ag) => ag.ownerId === enemyId && ag.provinceId === t.id),
  );
  if (frontLine.length === 0) return null;
  const safe = home.filter((t) => !frontLine.includes(t));
  if (safe.length === 0) return null;
  const dest = safe.reduce((best, t) => (r.popOf(t) > r.popOf(best) ? t : best));
  let moved = 0;
  for (const from of frontLine) {
    const fromPop = r.popOf(from);
    if (fromPop < 5) continue;
    const movers = fromPop * flightRate;
    if (movers < 0.1) continue;
    r.removePop(from, movers);
    dest.cohorts.bands[1] += movers * 0.7;
    dest.cohorts.bands[2] += movers * 0.3;
    moved += movers;
  }
  return moved > 0 ? { moved, dest } : null;
}

/** War refugee migration (GDD §7.4) — mirrors the climate-refugee trigger in
 *  systems/climate.ts (same flight-rate shape, "largest safe town" destination
 *  choice, and throttled log line) but keys off active war rather than tidal
 *  flooding. Fires wherever an enemy army group sits at a settlement — the
 *  player's own war (`r.playerWar`) and wars between rival powers
 *  (`r.foreignWars`) both drive it, so refugees flee both sides of every
 *  active front, not just the player's. No RNG (army positions are already
 *  deterministic), and the whole routine short-circuits the instant no war is
 *  active, so a war-free autoplay sweep draws nothing extra and stays
 *  byte-identical. */
export function warRefugees(r: RegionSim): void {
  if (!r.playerWar && r.foreignWars.length === 0) return;
  if (r.settlements.length < 2 || r.armyGroups.length === 0) return;

  // One warring faction-id pair per conflict: the player's own war, plus every
  // foreign-vs-foreign war (refugee flight isn't limited to the player's front).
  const pairs: [number, number][] = [];
  if (r.playerWar) pairs.push([r.playerFactionId, r.playerWar.rivalId]);
  for (const fw of r.foreignWars) pairs.push([fw.a, fw.b]);

  // Severity mirrors climate's warmingC-excess multiplier: worse under active
  // occupation and brutal administration (GDD §7.4), baseline otherwise. Flight
  // rate: min(1%, 0.1% × severity) per monthly tick, same shape as climate.
  const w = r.playerWar;
  const severity = w ? 1 + (w.occupied > 0 ? 0.5 : 0) + (w.brutality ? 0.5 : 0) : 1;
  const flightRate = Math.min(0.01, 0.001 * severity);

  let totalMovers = 0;
  let lastDest: Settlement | null = null;
  for (const [a, b] of pairs) {
    const fromA = bleedFrontLine(r, a, b, flightRate);
    if (fromA) { totalMovers += fromA.moved; lastDest = fromA.dest; }
    const fromB = bleedFrontLine(r, b, a, flightRate);
    if (fromB) { totalMovers += fromB.moved; lastDest = fromB.dest; }
  }

  if (totalMovers >= 1 && lastDest) {
    r.addLog(
      `War drives families from the front — ${Math.round(totalMovers)} people arrive at ${lastDest.name} seeking safety.`,
      'bad',
    );
  }
}

/**
 * Demographics & social unrest (GDD §5.3, Phase 13) — the sixth `region.ts` tick
 * subsystem lifted to the Track-C free-function form `fn(r: RegionSim, …)`. See
 * systems/pollution.ts for the rationale: each body runs VERBATIM against the same
 * RegionSim so the RNG-consumption order is byte-identical (only tickUnrestLadder
 * draws — the revolution roll at rung 5), `tick()` dispatches, and all state +
 * serialize() stay on RegionSim. The byte-identical serialize() diff is guarded by
 * tests/serialize-determinism.
 *
 * `tickStatsHistory` (the Century-Graph sampler) stays on RegionSim — it sits
 * between these methods in the class but belongs to the stats subsystem, not
 * demographics. The rung-3 player actions `crackdownProtests` / `concedeToProtesters`
 * also stay. Only `computeDemographicPhase` and `removePop` had to be made public
 * (the bodies call them directly); the rest of the surface was already public.
 */
import type { RegionSim } from '../region';

/** Tick the demographic transition: apply era-based natural population growth to
 *  EVERY settlement (rival or player), with a mid-century baby-boom multiplier, and
 *  levy the post-2050 aging-crisis pension burden once the phase turns post_transition. */
export function tickDemographicTransition(r: RegionSim): void {
  r.demographicPhase = r.computeDemographicPhase();
  const birthRate = r.globalBirthRate();
  const deathRate = r.globalDeathRate();
  const yr = r.year;
  // Mid-century baby boom multiplier
  const boomMult = (birthRate > 25 && deathRate < 15 && yr >= 1945 && yr <= 1975) ? 1.2 : 1.0;

  // Era-based natural growth applies to EVERY settlement, rival or player —
  // rivals were previously skipped here, which (with no tax income to grow on)
  // left their towns demographically stunted. Parity lets rival populations
  // climb with the same birth/death/baby-boom curve the player's towns ride.
  for (const t of r.settlements) {
    const pop = r.popOf(t);
    if (pop <= 0) continue;
    const naturalGrowth = pop * (birthRate - deathRate) / 1000 / 12 * boomMult;
    if (naturalGrowth > 0) {
      // Add to young working-age band
      t.cohorts.bands[1] += naturalGrowth * 0.6;
      t.cohorts.bands[0] += naturalGrowth * 0.4;
    } else if (naturalGrowth < 0) {
      r.removePop(t, -naturalGrowth);
    }
  }

  // Aging crisis (2050+, post_transition): pension burden
  if (r.demographicPhase === 'post_transition' && yr > 2050) {
    if (!r.agingCrisisActive) {
      r.agingCrisisActive = true;
      r.addLog('Aging population placing strain on pension system.', 'bad');
    }
    const gdp = Math.max(0, r.gdpLastMonth);
    const pensionBurden = 0.015 * gdp / 12;
    r.treasury -= pensionBurden;
  }
}

/** Tick appeal-score-driven migration between player settlements. */
export function tickAppealMigration(r: RegionSim): void {
  const playerSettlements = r.settlements.filter((t) => t.factionId === r.playerFactionId);
  if (playerSettlements.length < 2) return;

  // Compute appeal scores for all player settlements (using 'middle' cohort as default)
  const scores = new Map<number, number>();
  for (const t of playerSettlements) {
    scores.set(t.id, r.appealScore(String(t.id), 'middle'));
  }

  // For each pair, migrate if appeal difference > 15
  for (let i = 0; i < playerSettlements.length; i++) {
    for (let j = i + 1; j < playerSettlements.length; j++) {
      const a = playerSettlements[i];
      const b = playerSettlements[j];
      const scoreA = scores.get(a.id) ?? 0;
      const scoreB = scores.get(b.id) ?? 0;
      const diff = scoreA - scoreB;
      if (Math.abs(diff) <= 15) continue;
      const [from, to, absDiff] = diff > 0 ? [b, a, diff] : [a, b, -diff];
      const fromPop = r.popOf(from);
      if (fromPop <= 5) continue;
      // Max migration: 1% of sending settlement's pop per tick
      const maxMove = fromPop * 0.01;
      const movers = Math.min(maxMove, Math.floor((absDiff / 100) * 2));
      if (movers < 0.01) continue;
      r.removePop(from, movers);
      to.cohorts.bands[1] += movers * 0.7;
      to.cohorts.bands[2] += movers * 0.3;
    }
  }
}

/** Push current school coverage to the education lag ring buffer (once per year). */
export function tickEducationLag(r: RegionSim): void {
  const coverage = r.currentSchoolCoverage();
  r.educationLag.unshift(coverage);
  if (r.educationLag.length > 25) r.educationLag.pop();
}

/** Tick the unrest ladder — escalate or de-escalate based on grievance. Six rungs
 *  (calm → petitions → strikes → protests → riots → revolution); escalation is capped
 *  at one rung/month, de-escalation needs grievance 15+ below threshold, and rung 5
 *  carries an RNG-gated revolution that topples the government. */
export function tickUnrestLadder(r: RegionSim): void {
  const playerSettlements = r.settlements.filter((t) => t.factionId === r.playerFactionId);
  if (playerSettlements.length === 0) return;
  const avgGrievance = playerSettlements.reduce((s, t) => s + t.grievance, 0) / playerSettlements.length;
  const prevLevel = r.unrestLevel;

  // Determine target level from grievance thresholds
  let targetLevel: 0 | 1 | 2 | 3 | 4 | 5 = 0;
  if (avgGrievance > 90) targetLevel = 5;
  else if (avgGrievance > 75) targetLevel = 4;
  else if (avgGrievance > 60) targetLevel = 3;
  else if (avgGrievance > 45) targetLevel = 2;
  else if (avgGrievance > 30) targetLevel = 1;

  // Also check time-based escalation
  if (r.unrestLevel >= 1 && r.unrestMonthsAtLevel >= 3 && targetLevel < 2) targetLevel = Math.max(targetLevel, 2) as 0 | 1 | 2 | 3 | 4 | 5;
  if (r.unrestLevel >= 2 && r.unrestMonthsAtLevel >= 2 && targetLevel < 3) targetLevel = Math.max(targetLevel, 3) as 0 | 1 | 2 | 3 | 4 | 5;
  if (r.unrestLevel >= 3 && r.unrestMonthsAtLevel >= 3 && targetLevel < 4) targetLevel = Math.max(targetLevel, 4) as 0 | 1 | 2 | 3 | 4 | 5;
  if (r.unrestLevel >= 4 && r.unrestMonthsAtLevel >= 2 && targetLevel < 5) targetLevel = Math.max(targetLevel, 5) as 0 | 1 | 2 | 3 | 4 | 5;

  // Cap: can only move one rung per month (escalate)
  if (targetLevel > r.unrestLevel) {
    r.unrestLevel = (r.unrestLevel + 1) as 0 | 1 | 2 | 3 | 4 | 5;
  } else if (targetLevel < r.unrestLevel) {
    // De-escalate: require grievance 15+ below threshold, 3-month grace
    const threshold = [0, 30, 45, 60, 75, 90][r.unrestLevel] ?? 0;
    if (avgGrievance < threshold - 15) {
      r.unrestLevel = (r.unrestLevel - 1) as 0 | 1 | 2 | 3 | 4 | 5;
    }
  }

  // Track months at current level
  if (r.unrestLevel !== prevLevel) {
    r.unrestMonthsAtLevel = 0;
  } else {
    r.unrestMonthsAtLevel++;
  }

  // Apply rung effects
  const worstSettlement = playerSettlements.reduce((a, b) => a.grievance > b.grievance ? a : b);
  switch (r.unrestLevel) {
    case 1:
      // Petitions: flavor event only
      if (r.unrestLevel !== prevLevel) {
        r.addLog('Workers petition for better conditions.', 'info');
      }
      break;
    case 2:
      // Strikes: sector output −15% in highest-grievance settlement (via strikeUntil)
      if (r.unrestLevel !== prevLevel) {
        worstSettlement.strikeUntil = r.day + 30;
        r.addLog(`Strike wave begins at ${worstSettlement.name}.`, 'bad');
      }
      break;
    case 3:
      // Protests: trigger decision for player
      if (r.unrestLevel !== prevLevel) {
        r.addLog(
          `PROTESTS erupt in ${worstSettlement.name}. Choose: Crackdown (workers relations −10) or Concede (cost 2% GDP, unrest −1) via the Politics tab.`,
          'bad',
        );
      }
      break;
    case 4:
      // Riots: infrastructure damage, approval hit
      if (r.unrestLevel !== prevLevel) {
        // Damage a random building in the worst settlement
        if (worstSettlement.buildings.length > 0) {
          // Just log — we don't have per-building condition tracking yet, so we apply grievance hit
          worstSettlement.grievance = Math.min(100, worstSettlement.grievance + 5);
        }
        if (r.nationProclaimed && r.legitimacy > 0) {
          r.legitimacy = Math.max(0, r.legitimacy - 8);
        }
        r.addLog(`Riots erupt in ${worstSettlement.name}. Infrastructure damaged. Legitimacy −8.`, 'bad');
        for (const t of playerSettlements) t.satisfaction = Math.max(0, t.satisfaction - 10);
      }
      break;
    case 5: {
      // Revolution threat: monthly chance of government collapse
      const grevFrac = avgGrievance / 100;
      const revolChance = 0.03 * grevFrac;
      if (r.rng.chance(revolChance)) {
        const capital = playerSettlements[0];
        r.addLog(
          `Revolutionary movement seizes ${capital?.name ?? 'the capital'}! The government is overthrown — a successor faction rises. Regime change event pending.`,
          'bad',
        );
        // Legitimacy collapse
        if (r.nationProclaimed) r.legitimacy = Math.max(0, r.legitimacy - 30);
        // Drop unrest a bit after the release
        r.unrestLevel = 2;
        r.unrestMonthsAtLevel = 0;
        for (const t of playerSettlements) {
          t.grievance = Math.max(0, t.grievance - 30);
          t.satisfaction = Math.max(0, t.satisfaction - 15);
        }
      }
      break;
    }
  }
}

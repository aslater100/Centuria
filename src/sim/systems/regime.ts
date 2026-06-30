/**
 * Governance: advisor loyalty, advisor events, legitimacy decay, and per-regime
 * mechanics (GDD §5.3, §8.7, §9) — the fifth `region.ts` tick subsystem extracted
 * to the roadmap's Track-C free-function form `fn(r: RegionSim, …)`. See
 * systems/pollution.ts for the rationale: each body runs VERBATIM against the same
 * RegionSim so the RNG-consumption order is byte-identical, `tick()` dispatches,
 * all state + serialize() stay on RegionSim, and the byte-identical serialize()
 * diff is guarded by tests/serialize-determinism.
 *
 * This cluster is governance-cohesive and self-contained: every member it touches
 * was already public, so the move is a pure relocation (no new public surface).
 * The player-ACTION method `recordPortfolioAction` (which sits between these in the
 * class) and the transition actions stay on RegionSim. All four functions early-out
 * unless `nationProclaimed`, so a pre-nation game runs them as no-ops exactly as before.
 */
import type { RegionSim } from '../region';
import { GOV_TYPES } from '../region';

/** Monthly advisor loyalty decay + defection (GDD §8.7). A minister whose portfolio
 *  the player has ignored for ≥3 months loses loyalty, and a deeply-disloyal minister
 *  may defect to an opposition bloc (RNG-gated), denting legitimacy. */
export function tickAdvisorLoyalty(r: RegionSim): void {
  if (!r.nationProclaimed) return;
  const monthDays = 30;

  for (const assignment of r.ministers) {
    if (assignment.notableId === null) continue;
    const notable = r.notables.find((n) => n.id === assignment.notableId && n.alive);
    if (!notable) continue;

    if (notable.loyalty === undefined) notable.loyalty = 100;
    if (notable.monthsIgnored === undefined) notable.monthsIgnored = 0;

    const lastAction = r.lastActionDay[assignment.role] ?? -Infinity;
    const monthsSinceAction = (r.day - lastAction) / monthDays;

    if (monthsSinceAction >= 3) {
      notable.monthsIgnored = (notable.monthsIgnored ?? 0) + 1;
      if (notable.monthsIgnored >= 3) {
        notable.loyalty = Math.max(0, (notable.loyalty ?? 100) - 2);
      }
    } else {
      notable.monthsIgnored = 0;
    }

    if ((notable.loyalty ?? 100) < 20 && r.rng.chance(0.03)) {
      const faction = notable.factionAlignment ?? 'merchants';
      const factionName = faction === 'workers' ? 'Labour' : faction === 'landowners' ? 'Conservative' : 'Liberal';
      r.addLog(`${notable.name} has defected to the ${factionName} bloc after being sidelined.`, 'bad');
      const oppFaction = r.factions.find((f) => f.id === faction);
      if (oppFaction) oppFaction.power = Math.min(100, oppFaction.power + 10);
      r.legitimacy = Math.max(0, r.legitimacy - 8);
      assignment.notableId = null;
    }
  }
}

/** Monthly advisory briefs from ministers — diplomatic snubs, research bottlenecks,
 *  credibility warnings, and revanchism prompts (GDD §8.7). All RNG-gated logs. */
export function tickAdvisorEvents(r: RegionSim): void {
  if (!r.nationProclaimed) return;

  const coldRival = r.rivals.find((rv) => rv.relations < -30);
  if (coldRival && r.rng.chance(0.05)) {
    r.addLog(`FOREIGN SECRETARY: An envoy to ${coldRival.name} was refused audience. Relations are deteriorating.`, 'bad');
    coldRival.relations = Math.max(-100, coldRival.relations - 5);
  }

  if (!r.researchBottleneckActive) {
    const noSchool = r.settlements.filter((t) => !t.buildings.includes('schoolhouse'));
    if (noSchool.length >= 3) {
      r.researchBottleneckActive = true;
      r.addLog(`SCIENCE MINISTRY: Our research pipeline is bottlenecked — secondary education is absent in ${noSchool.length} settlements. Recommend redirecting funding.`, 'bad');
    }
  } else {
    const stillMissing = r.settlements.filter((t) => !t.buildings.includes('schoolhouse')).length;
    if (stillMissing < 3) r.researchBottleneckActive = false;
  }

  if (r.legitimacy < 60 && (100 - r.legitimacy) > 40 && r.rng.chance(0.08)) {
    r.addLog(`PRESS SECRETARY: The credibility gap is accelerating — recommend addressing fiscal transparency and public services.`, 'bad');
  }

  // Revanchism advisory: surface available revanchism CB (once after each defeat scar)
  if (!r.playerWar && r.warScars.length > 0 && r.rng.chance(0.04)) {
    const defeatScar = r.warScars.find((s) => s.outcome === 'defeat');
    if (defeatScar) {
      const offender = r.rivals.find((rv) => rv.id === defeatScar.rivalId);
      if (offender && r.availableCasusBelli(offender).includes('revanchism')) {
        r.addLog(
          `FOREIGN SECRETARY: The humiliation of our defeat against ${defeatScar.rivalName} in ${defeatScar.yearEnded} still rankles. ` +
          `Nationalists demand satisfaction — a revanchist campaign is available if the State has the will.`,
          'info',
        );
      }
    }
  }
}

/** Monthly legitimacy tick (GDD §5.3): baseline decay (slowed by press freedom + an
 *  information minister + regime modifier), with junta/monarchy adjustments and an
 *  RNG-gated legitimacy-crisis log when it falls below 30. */
export function tickLegitimacy(r: RegionSim): void {
  if (!r.nationProclaimed) return;
  const govDef = r.govType ? GOV_TYPES.find((g) => g.id === r.govType) : null;
  const regimeModifier = govDef?.legitimacyDecayModifier ?? 1.0;
  // Press Freedom Act law slows decay by 30%; Information minister adds a further 25%
  const pressBonus = r.passedLaws.has('press_freedom_act') ? 0.7 : 1.0;
  const infoBonus = r.ministerFor('press') ? 0.75 : 1.0;
  const decayRate = 0.5 * regimeModifier * pressBonus * infoBonus;
  r.legitimacy = Math.max(0, r.legitimacy - decayRate);
  if (r.govType === 'junta') {
    const ws = r.factions.find((f) => f.id === 'workers')?.support ?? 50;
    const ls = r.factions.find((f) => f.id === 'landowners')?.support ?? 50;
    const avg = ws * 0.5 + ls * 0.5;
    if (avg > 60) r.legitimacy = Math.min(100, r.legitimacy + 0.3);
    if (avg < 30) r.legitimacy = Math.max(0, r.legitimacy - 0.5);
  }
  if (r.govType === 'monarchy') {
    const elders = r.notables.filter((n) => n.alive && n.age >= 50).length;
    if (elders > 0) r.legitimacy = Math.min(100, r.legitimacy + 0.2 * elders);
  }
  if (r.legitimacy < 30 && r.rng.chance(0.05)) {
    r.addLog(
      'LEGITIMACY CRISIS: opposition groups are openly challenging the regime.',
      'bad',
    );
  }
}

/** Monthly per-regime mechanics (GDD §9): one-party reported-GDP optimism, the
 *  authoritarian credibility gap + collapse cliff, fascist conflict-hunger, theocratic
 *  schism risk, and corporatocracy shareholder patience — each RNG-gated where it fires. */
export function tickRegimeMechanics(r: RegionSim): void {
  if (!r.nationProclaimed || !r.govType) return;

  // ---- One-Party State: planning optimism and reported GDP ----
  if (r.govType === 'one_party') {
    r.planningOptimism = Math.min(1, r.planningOptimism + 0.01);
    r.reportedGDP = r.gdpLastMonth * (1 + r.planningOptimism * 0.3);
  } else {
    r.reportedGDP = r.gdpLastMonth;
    // planningOptimism resets on regime change (handled in proclaimNation)
  }

  // ---- Credibility Gap: authoritarian press + controlled narrative ----
  const isAuthoritarian = ['junta', 'autocracy', 'one_party', 'fascist', 'abs_monarchy', 'monarchy'].includes(r.govType);
  const hasControlledPress = !r.passedLaws.has('press_freedom_act');
  if (isAuthoritarian && hasControlledPress) {
    r.credibilityGap = Math.min(100, r.credibilityGap + 0.5);
    // Cliff event: gap > 80 + spark
    if (r.credibilityGap > 80) {
      const spark = r.treasury < 0 ||
        (r.playerWar && r.playerWar.score < -20) ||
        r.settlements.some((t) => t.grievance > 75);
      if (spark && r.rng.chance(0.15)) {
        r.legitimacy = Math.max(0, r.legitimacy - 30);
        r.addLog(
          'CREDIBILITY COLLAPSE: The gap between the official narrative and lived reality has become impossible to ignore. Legitimacy shattered.',
          'bad',
        );
      }
    }
  } else {
    r.credibilityGap = Math.max(0, r.credibilityGap - 0.3);
  }

  // ---- Fascist regime: legitimacy requires conflict ----
  if (r.govType === 'fascist') {
    const atPeace = !r.playerWar;
    if (atPeace) {
      r.legitimacy = Math.max(0, r.legitimacy - 1);
      if (r.rng.chance(0.3)) {
        r.addLog(
          'PRESSURE TO EXPAND: The regime feeds on conflict — without a war to sustain the movement, the streets grow restless.',
          'bad',
        );
      }
    }
  }

  // ---- Theocracy: schism risk grows with secular techs ----
  if (r.govType === 'theocracy') {
    const secularTechs = ['computing', 'civil_rights', 'antibiotics', 'public_education', 'social_insurance'];
    const researched = secularTechs.filter((t) => r.has(t)).length;
    if (researched > 0) {
      r.schismRisk = Math.min(100, r.schismRisk + researched);
    }
    // Schism event at risk > 70
    if (r.schismRisk > 70 && r.rng.chance(0.03)) {
      // Schism fires
      for (const t of r.settlements) {
        t.grievance = Math.min(100, t.grievance + 20);
      }
      r.legitimacy = Math.max(0, r.legitimacy - 10);
      r.schismRisk = 30; // reset after schism
      r.addLog(
        `DOCTRINAL SCHISM: The tension between religious orthodoxy and modernizing society erupts. ` +
        `Faction split — a reformist movement challenges the clerical establishment. Grievance surges across all towns.`,
        'bad',
      );
    }
  }

  // ---- Corporatocracy: shareholder patience decays during long wars ----
  if (r.govType === 'corporatocracy') {
    if (r.playerWar) {
      const warMonths = (r.day - (r.playerWar as any).startDay) / 30;
      if (warMonths > 12) {
        r.shareholderPatience = Math.max(0, r.shareholderPatience - 3);
      }
    } else {
      // Peacetime: patience recovers slowly
      r.shareholderPatience = Math.min(100, r.shareholderPatience + 0.5);
    }
    // Hostile board takeover at patience < 20
    if (r.shareholderPatience < 20 && r.rng.chance(0.1)) {
      r.legitimacy = Math.max(0, r.legitimacy - 15);
      const merchantFaction = r.factions.find((f) => f.id === 'merchants');
      if (merchantFaction) {
        merchantFaction.support = Math.min(100, merchantFaction.support + 20);
      }
      r.addLog(
        'HOSTILE BOARD TAKEOVER: The corporate council convenes an emergency session. ' +
        'Shareholder patience exhausted — a new policy is enacted by the merchant faction without consultation.',
        'bad',
      );
      r.shareholderPatience = 35; // shock resets patience
    }
  }
}

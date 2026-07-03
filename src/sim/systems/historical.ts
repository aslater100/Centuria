/**
 * Historical anchors (GDD §1) — the eleventh `region.ts` tick subsystem lifted to the
 * Track-C free-function form `fn(r: RegionSim)`. See systems/pollution.ts for the
 * rationale: the body runs VERBATIM against the same RegionSim so the RNG-consumption
 * order is byte-identical, `tick()` dispatches, and all state + serialize() stay on
 * RegionSim. The byte-identical serialize() diff is guarded by tests/serialize-determinism.
 *
 * Scripted world-events (world war, oil shock, the Crash/Depression, the pandemic) that
 * rhyme with history without reciting it — each fires at most once, gated on world-state
 * and an era window. The once-fired latches (worldWarFired / oilShockFired / crashFired /
 * crashMonthCounter / pandemicFired) and the helpers it drives (pairRelations, warBetween,
 * startForeignWar, has) stay on RegionSim and are reached through `r`.
 */
import type { RegionSim } from '../region';
import { OIL_EMBARGO_DAYS, OIL_EMBARGO_CUT, SECTOR_IDS } from '../region';
import { formatCurrency } from '../defs';

  /** Scripted world-events that rhyme with history without reciting it.
   *  Each fires at most once, gated on world-state conditions and era window. */
export function tickHistoricalAnchors(r: RegionSim): void {
    // Phase 17: difficulty wiring — skip entirely or use only base probabilities
    if (r.difficultySettings.historicalAnchors === 'off') return;
    const anchorsEmergent = r.difficultySettings.historicalAnchors === 'emergent';

    const y = r.year;

    // 1. World-war window (GDD §1, 1936–1948): great-power tensions ignite.
    // Fires when rival powers are hostile to each other AND an expansionist is in the mix.
    // In 'emergent' mode, drop the year constraint so it can fire at any time.
    const wwInWindow = anchorsEmergent ? r.rivals.length >= 2 : (y >= 1936 && y <= 1948 && r.rivals.length >= 2);
    if (!r.worldWarFired && wwInWindow) {
      // Find the most hostile pair among rivals
      let worstRel = -35;
      let warA = -1;
      let warB = -1;
      for (let i = 0; i < r.rivals.length; i++) {
        for (let j = i + 1; j < r.rivals.length; j++) {
          const rel = r.pairRelations(r.rivals[i].id, r.rivals[j].id);
          if (rel < worstRel) {
            worstRel = rel;
            warA = r.rivals[i].id;
            warB = r.rivals[j].id;
          }
        }
      }
      const hasExpansionist = r.rivals.some((rv) => rv.weights.expansion >= 6);
      // Needs at least one hostile pair + an expansionist drive + era roll
      if (warA >= 0 && hasExpansionist && r.rng.chance(0.08)) {
        r.worldWarFired = true;
        // Escalate the most hostile pair into open war if not already fighting
        if (!r.warBetween(warA, warB)) r.startForeignWar(warA, warB);
        // The wider world tenses: all rival-player relations drift more hostile
        for (const rv of r.rivals) {
          if (rv.relations > -10) rv.relations -= 8;
        }
        // Confidence takes a hit — war news shakes markets
        r.confidence = Math.max(5, r.confidence - 12);
        const aName = r.rival(warA)?.name ?? 'one power';
        const bName = r.rival(warB)?.name ?? 'another';
        r.addLog(
          `THE CONFLAGRATION: ${aName} and ${bName} are no longer trading ultimatums — ` +
          `they are trading artillery. The great powers are choosing sides. ` +
          `Will you hold the line, or join the storm?`,
          'bad',
        );
      }
    }

    // 1b. World-war follow-ups (LOG-ONLY): rhymes the war's chronicle without
    // touching a single number. Timing is read straight off the `foreignWars`
    // entry (startedDay/endsDay) that firing the war already recorded — the
    // first entry whose two sides are still tracked rivals stands in for "the"
    // conflagration. No RNG, no new latches: rounding the entry's own window to
    // the 30-day tick grid means each beat's day is hit on exactly one call.
    if (r.worldWarFired) {
      const ww = r.foreignWars.find((w) => r.rival(w.a) && r.rival(w.b));
      if (ww) {
        const round30 = (d: number) => Math.round(d / 30) * 30;
        const midDay = round30((ww.startedDay + ww.endsDay) / 2);
        const endDay = round30(ww.endsDay);
        const aName = r.rival(ww.a)?.name ?? 'one power';
        const bName = r.rival(ww.b)?.name ?? 'another';
        if (r.day === midDay) {
          r.addLog(
            `THE LONG FRONT: ${aName} and ${bName} are still burying their dead. ` +
            `Neither army has broken, and neither treasury can hold much longer.`,
            'bad',
          );
        }
        if (r.day === endDay) {
          r.addLog(
            `THE ARMISTICE: ${aName} and ${bName} sign the peace at last. ` +
            `The guns fall silent, but the maps — and the grudges — are redrawn for good.`,
            'good',
          );
        }
      }
    }

    // 2. Oil shock (1970s-equivalent): fossil dependency meets a supply embargo.
    // Fires when combustion-engine tech is researched but no clean energy exists yet.
    const oilInWindow = anchorsEmergent ? true : (y >= 1970 && y <= 1985);
    if (!r.oilShockFired && oilInWindow) {
      const hasFossil = r.has('combustion_engine');
      const hasCleanEnergy = r.has('renewables') || r.has('fusion_power');
      if (hasFossil && !hasCleanEnergy && r.rng.chance(0.06)) {
        r.oilShockFired = true;
        // Route the shock through the supply chain: embargo the `oil` raw so the
        // cut cascades oil → fuel → trucking/plastics and the supply-chain drag
        // bites for the window — the shock is a fuel price the economy keeps
        // paying, not just a one-off popup (GDD §5.4).
        r.rawEmbargoes['oil'] = { until: r.day + OIL_EMBARGO_DAYS, cut: OIL_EMBARGO_CUT };
        // Economic hit: treasury drain + inflation spike + currency devaluation
        const gdp = r.settlements.reduce(
          (s, t) => s + SECTOR_IDS.reduce((ss, id) => ss + t.sectors[id].output, 0), 0,
        );
        const hit = Math.round(gdp * 0.14 + 150);
        r.treasury -= hit;
        r.inflationRate = Math.min(0.28, r.inflationRate + 0.07);
        r.exchangeRate = Math.max(0.3, r.exchangeRate - 0.14);
        r.confidence = Math.max(5, r.confidence - 18);
        // Add a brief industry slump event to each player settlement
        for (const t of r.settlements) {
          if (t.factionId !== r.playerFactionId) continue;
          if (!t.activeEvents.some((ev) => ev.kind === 'labor_shortage')) {
            t.activeEvents.push({ kind: 'labor_shortage', untilDay: r.day + 90, severity: 1 });
            t.satisfaction = Math.max(0, t.satisfaction - 5);
            t.grievance = Math.min(100, t.grievance + 6);
          }
        }
        r.addLog(
          `OIL EMBARGO: Exporting nations choke the supply lines. Fuel prices triple overnight — ` +
          `${formatCurrency(hit)} drained from reserves, inflation surges, industry stalls. ` +
          `The answer is in the renewables labs.`,
          'bad',
        );
      }
    }

    // 2b. Oil-shock follow-ups (LOG-ONLY): timing comes straight off the embargo's
    // own `until` day already recorded in `rawEmbargoes['oil']` — no new state,
    // no RNG. OIL_EMBARGO_DAYS is a fixed multiple of 30, so both derived days
    // land exactly on the monthly tick grid.
    if (r.oilShockFired) {
      const embargo = r.rawEmbargoes['oil'];
      if (embargo) {
        const midDay = embargo.until - OIL_EMBARGO_DAYS / 2;
        if (r.day === midDay) {
          r.addLog(
            `THE LONG QUEUE: months into the embargo, filling stations post handwritten signs ` +
            `and shuttered pumps. Every ledger from harbor to hinterland now reads "fuel" in red ink.`,
            'bad',
          );
        }
        if (r.day === embargo.until) {
          r.addLog(
            `THE TAPS REOPEN: the embargo lifts and tankers return to harbor. ` +
            `The price at the pump remembers — and so do the men building the renewables labs.`,
            'good',
          );
        }
      }
    }

    // 3. Great Depression analog (1927–1936): credit bubble meets a confidence
    // collapse. Fires once when leverage is stretched and confidence is already
    // fragile in the historical window — the sim sets the fuse, the era strikes it.
    const depressionInWindow = anchorsEmergent ? true : (y >= 1927 && y <= 1936);
    if (!r.crashFired && depressionInWindow) {
      if (r.privateLeverage * r.policyRate > 0.12 && r.confidence < 55) {
        r.crashFired = true;
        // Credit implosion
        r.confidence = Math.max(5, r.confidence - 40);
        r.privateLeverage *= 0.65;
        // Depression depth: drives ongoing export suppression and confidence ceiling for ~30 months
        r.depressionDepth = 1.0;
        r.crashMonthCounter = 0;
        r.depressionMeasuresUsed = [];
        r.depressionCeilingBonus = 0;
        // Bank failures drain reserves
        const gdp = r.settlements.reduce(
          (s, t) => s + SECTOR_IDS.reduce((ss, id) => ss + t.sectors[id].output, 0), 0,
        );
        r.treasury -= Math.round(gdp * 0.12 + 80);
        // Political radicalization: unemployment and hunger push factions to extremes
        for (const t of r.settlements) {
          if (t.factionId !== r.playerFactionId) continue;
          t.grievance = Math.min(100, t.grievance + 25);
          t.satisfaction = Math.max(0, t.satisfaction - 15);
          if (!t.activeEvents.some((ev) => ev.kind === 'labor_shortage')) {
            t.activeEvents.push({ kind: 'labor_shortage', untilDay: r.day + 150, severity: 1 });
          }
        }
        if (r.nationProclaimed) {
          r.legitimacy = Math.max(0, r.legitimacy - 12);
        }
        r.addLog(
          `THE CRASH: credit markets seize. Banks close their doors overnight — ` +
          `savings vanish, factories idle, bread lines stretch around city blocks. ` +
          `The world has not seen this before. A generation will remember.`,
          'bad',
        );
        r.addLog(
          `DEPRESSION: unemployment surges across every settlement. ` +
          `Radical movements — left and right — are filling the void that hunger leaves.`,
          'bad',
        );
      }
    }

    // 3b. Depression follow-ups (LOG-ONLY): keyed off `crashMonthCounter`, the
    // counter the decay logic already increments once per month while the
    // depression is active (see the ~30-month horizon noted above). It is a
    // strictly-increasing integer that freezes once the depression lifts, so
    // each exact count is reached at most once — no new state, no RNG.
    if (r.crashFired) {
      if (r.crashMonthCounter === 15) {
        r.addLog(
          `THE LONG WINTER: fifteen months on, the soup lines have not shortened. ` +
          `Shuttered storefronts wear their padlocks like medals.`,
          'bad',
        );
      }
      if (r.crashMonthCounter === 30) {
        r.addLog(
          `THE SLOW MEND: the ledgers stop bleeding red and furnaces relight, one by one. ` +
          `The Depression is not forgotten — but at last, it is history.`,
          'good',
        );
      }
    }

    // 4. 2020-analog pandemic: a novel pathogen sweeps the globe.
    // Fires once in the 2012–2027 window; antibiotics tech halves the severity.
    const pandemicInWindow = anchorsEmergent ? r.rng.chance(0.04) : (y >= 2012 && y <= 2027 && r.rng.chance(0.04));
    if (!r.pandemicFired && pandemicInWindow) {
      r.pandemicFired = true;
      const hasAntibiotics = r.has('antibiotics') || r.has('welfare_state');
      const duration = hasAntibiotics ? 60 : 120;
      const mult = hasAntibiotics ? 0.86 : 0.72;
      // Push a severe pandemic_wave onto every settlement
      for (const t of r.settlements) {
        t.activeEvents = t.activeEvents.filter((ev) => ev.kind !== 'pandemic_wave');
        t.activeEvents.push({ kind: 'pandemic_wave', untilDay: r.day + duration, severity: 1 });
        const satHit = hasAntibiotics ? 6 : 14;
        const grHit = hasAntibiotics ? 5 : 11;
        t.satisfaction = Math.max(0, t.satisfaction - satHit);
        t.grievance = Math.min(100, t.grievance + grHit);
        // Manually apply output multiplier to current sector outputs
        for (const id of SECTOR_IDS) {
          t.sectors[id].output = Math.max(0.1, t.sectors[id].output * mult);
        }
      }
      r.confidence = Math.max(5, r.confidence - (hasAntibiotics ? 12 : 28));
      r.exportEarningsLastMonth *= 0.65;
      const msg = hasAntibiotics
        ? `PANDEMIC: A novel pathogen spreads across the world. Modern medicine blunts the worst — cities lock down for weeks, not years. Trade slows; recovery is measured in months.`
        : `PANDEMIC: A novel pathogen sweeps the globe. Without modern medical infrastructure the toll is heavy — cities shutter, commerce stops, the dead are counted in silence.`;
      r.addLog(msg, 'bad');
    }

    // 4b. Pandemic follow-ups (LOG-ONLY): read the wave's own `untilDay` off any
    // settlement's `activeEvents` — pushed identically for every settlement at
    // fire time, so any copy carries the same value. No new state, no RNG. The
    // resolution beat targets the wave's last still-visible tick (`untilDay - 30`)
    // since the regional-events sweep already prunes an entry the instant
    // `r.day` reaches `untilDay`, before this system runs.
    if (r.pandemicFired) {
      let wave: { untilDay: number } | undefined;
      for (const t of r.settlements) {
        wave = t.activeEvents.find((ev) => ev.kind === 'pandemic_wave');
        if (wave) break;
      }
      if (wave) {
        const hasAntibiotics = r.has('antibiotics') || r.has('welfare_state');
        const halfDuration = hasAntibiotics ? 30 : 60;
        if (r.day === wave.untilDay - halfDuration) {
          r.addLog(
            `THE QUIET STREETS: weeks into the sickness, market squares stand empty and ` +
            `the church bells ring for the dead more than the living.`,
            'bad',
          );
        }
        if (r.day === wave.untilDay - 30) {
          r.addLog(
            `THE ALL-CLEAR: quarantine flags come down, the shops reopen, ` +
            `and the ledgers total what the pathogen cost.`,
            'good',
          );
        }
      }
    }
  }

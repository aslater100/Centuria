import { describe, it, expect } from 'vitest';
import { RegionSim, SAVE_SCHEMA_VERSION, IncompatibleSaveError } from '../src/sim/region';
import { tickMonetary } from '../src/sim/systems/monetary';
import { tickUnrestLadder } from '../src/sim/systems/demographics';

/** A proclaimed nation with the monetary machinery on — mirrors the fixture the
 *  economy/serialize guards use, so the central bank is established. */
function nation(seed: number): RegionSim {
  const r = RegionSim.create(seed);
  r.stateProclaimed = true;
  r.nationProclaimed = true;
  r.govType = 'republic';
  r.legitimacy = 60;
  r.activePolicies = [];
  r.treasury = 1000;
  r.passedLaws.add('central_bank_charter');
  r.passedLaws.add('income_tax');
  return r;
}

/** Plant a settlement for the first non-player faction so it can receive a secession.
 *  (Fresh rivals spawn with empty settlementIds until they found a town.) */
function ensureRivalHasSettlement(r: RegionSim): number {
  const rival = r.regionalFactions.find((f) => f.id !== r.playerFactionId)!;
  if (rival.settlementIds.length === 0) {
    (r as unknown as { foundSettlement: (f: typeof rival, x: number, y: number) => object | null })
      .foundSettlement(rival, 20, 20);
    if (rival.settlementIds.length > 0) rival.capital = rival.settlementIds[0];
  }
  return rival.id;
}

// ---------------------------------------------------------------------------
// 1. Save schema v2 — hard cutover
// ---------------------------------------------------------------------------

describe('Save schema v2', () => {
  it('SAVE_SCHEMA_VERSION is 5 (v2: D1/D2; v3: negotiations + arcs; v4: insolvencyMonths; v5: ententes + coalition)', () => {
    expect(SAVE_SCHEMA_VERSION).toBe(5);
  });

  it('a fresh RegionSim round-trips through serialize → deserialize', () => {
    const r = RegionSim.create(7);
    const r2 = RegionSim.deserialize(r.serialize());
    expect(r2).toBeInstanceOf(RegionSim);
    // canonical (post-load) form is a fixed point
    expect(RegionSim.deserialize(r2.serialize()).serialize()).toBe(r2.serialize());
  });

  it('deserialize throws IncompatibleSaveError (foundVersion 1) for a v1 blob', () => {
    const r = RegionSim.create(7);
    const raw = JSON.parse(r.serialize());
    raw.v = 1;
    let err: unknown;
    try {
      RegionSim.deserialize(JSON.stringify(raw));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(IncompatibleSaveError);
    expect((err as IncompatibleSaveError).foundVersion).toBe(1);
  });

  it('deserialize rejects a future-version blob instead of misparsing it', () => {
    const r = RegionSim.create(7);
    const raw = JSON.parse(r.serialize());
    raw.v = SAVE_SCHEMA_VERSION + 1;
    let err: unknown;
    try {
      RegionSim.deserialize(JSON.stringify(raw));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(IncompatibleSaveError);
    expect((err as IncompatibleSaveError).foundVersion).toBe(SAVE_SCHEMA_VERSION + 1);
  });

  it('hyperinflationMonths and postRevoltGrievanceMonths survive a round-trip', () => {
    const r = RegionSim.create(7);
    r.hyperinflationMonths = 7;
    r.postRevoltGrievanceMonths = { 3: 2, 5: 1 };
    const r2 = RegionSim.deserialize(r.serialize());
    expect(r2.hyperinflationMonths).toBe(7);
    expect(typeof r2.hyperinflationMonths).toBe('number');
    expect(r2.postRevoltGrievanceMonths).toEqual({ 3: 2, 5: 1 });
  });
});

// ---------------------------------------------------------------------------
// 2. D1 — hyperinflation collapse (monetary.ts tickMonetary tail)
// ---------------------------------------------------------------------------

describe('D1 hyperinflation loss', () => {
  // tickMonetary mean-reverts inflationRate 15%/month toward ~0.02 *before* the collapse check,
  // so we re-force the crisis each month. inflationRate = 0.6 post-reversion pins to the 0.50
  // clamp, which is >= the 0.45 trigger line. The trigger is inflation-only (see the mechanic
  // comment: the spec's confidence co-condition was dropped as unreachable/redundant).
  const forceCrisis = (r: RegionSim): void => {
    r.inflationRate = 0.6;
  };

  it('twelve consecutive trigger-months end the run', () => {
    const r = nation(7);
    for (let m = 0; m < 12; m++) {
      forceCrisis(r);
      tickMonetary(r);
    }
    expect(r.hyperinflationMonths).toBe(12);
    expect(r.gameOver).toBe(true);
  });

  it('a single restored-price-stability month resets the counter and staves off collapse', () => {
    const r = nation(7);
    for (let m = 0; m < 6; m++) {
      forceCrisis(r);
      tickMonetary(r);
    }
    expect(r.hyperinflationMonths).toBe(6);

    // One month where inflation falls back below the 0.45 line breaks the streak. 0.1 sits far
    // enough under the line that the 15%/month reversion can't lift it back over in one tick.
    r.inflationRate = 0.1;
    tickMonetary(r);
    expect(r.hyperinflationMonths).toBe(0);
    expect(r.gameOver).toBe(false);

    // Several more crisis months rebuild the counter but do not reach 12.
    for (let m = 0; m < 4; m++) {
      forceCrisis(r);
      tickMonetary(r);
    }
    expect(r.hyperinflationMonths).toBe(4);
    expect(r.gameOver).toBe(false);
  });

  it('a sustained print-regime supply cascade collapses the currency within ~3 years (D1 is reachable, not a phantom)', () => {
    const r = nation(7);
    // Structural catastrophe, NO direct inflationRate/confidence poke — this proves the loss
    // state is reachable from real model pressure, not just a forced number. A money-printing
    // regime on top of a full supply-chain cascade drives the inflation TARGET to
    // 0.02 + print 0.01 + supplyPush (severity 1 × 0.30) + localGoods (1 × 0.08)
    // + finalShortfall (1 × 0.15) ≈ 0.56, so inflationRate mean-reverts up to the 0.50 clamp
    // and confidence falls on its own under the price shock.
    const drive = (): void => {
      r.monetaryRegime = 'print';
      r.supplyChainHealth = 0; // severity → 1 (baseline − 0) / baseline
      r.localGoodsScarcity = 1;
      r.finalConsumptionShortfall = 1;
    };
    let collapsedBy = -1;
    for (let m = 0; m < 36 && collapsedBy < 0; m++) {
      drive();
      tickMonetary(r);
      if (r.gameOver) collapsedBy = m + 1;
    }
    expect(r.gameOver).toBe(true);
    expect(collapsedBy).toBeGreaterThan(0);
    expect(collapsedBy).toBeLessThanOrEqual(36);
  });
});

// ---------------------------------------------------------------------------
// 3. D2 — revolution → partition (demographics.ts + RegionSim.secedeSettlement)
// ---------------------------------------------------------------------------

describe('D2 secession', () => {
  it('secedeSettlement hands a player town to a rival and updates both rosters', () => {
    const r = RegionSim.create(7);
    const town = r.settlements.find((t) => t.factionId === r.playerFactionId)!;
    const rivalId = ensureRivalHasSettlement(r);
    const player = r.faction(r.playerFactionId)!;
    if (!player.settlementIds.includes(town.id)) player.settlementIds.push(town.id);

    expect(r.secedeSettlement(town)).toBe(true);
    expect(town.factionId).not.toBe(r.playerFactionId);
    expect(player.settlementIds).not.toContain(town.id);
    const newOwner = r.faction(town.factionId)!;
    expect(newOwner.id).toBe(rivalId);
    expect(newOwner.settlementIds).toContain(town.id);
  });

  it('secedeSettlement is a no-op when no other faction can receive the town', () => {
    const r = RegionSim.create(7);
    const town = r.settlements.find((t) => t.factionId === r.playerFactionId)!;
    r.regionalFactions = r.regionalFactions.filter((f) => f.id === r.playerFactionId);
    expect(r.secedeSettlement(town)).toBe(false);
    expect(town.factionId).toBe(r.playerFactionId);
  });

  it('postRevoltGrievanceMonths climbs only while grievance holds the revolt line', () => {
    const r = RegionSim.create(7);
    // crisisFrequency 0 → secession roll (0.08 × freq) is 0, so the counter is
    // observable climbing without any RNG-gated defection firing.
    r.difficultySettings.crisisFrequency = 0;
    const town = r.settlements.find((t) => t.factionId === r.playerFactionId)!;
    r.postRevoltGrievanceMonths[town.id] = 0;

    // Below the revolt-critical line (75): counter stays pinned at 0.
    town.grievance = 70;
    tickUnrestLadder(r);
    expect(r.postRevoltGrievanceMonths[town.id]).toBe(0);

    // At/above the line for three months: counter reaches 3.
    town.grievance = 80;
    tickUnrestLadder(r);
    tickUnrestLadder(r);
    tickUnrestLadder(r);
    expect(r.postRevoltGrievanceMonths[town.id]).toBe(3);
    expect(town.factionId).toBe(r.playerFactionId); // never actually seceded
  });
});

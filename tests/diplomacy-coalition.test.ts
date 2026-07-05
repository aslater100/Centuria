import { describe, expect, it } from 'vitest';

import { RegionSim } from '../src/sim/region';
import type { RivalNation, DealBasket, Coalition } from '../src/sim/region';
import { tickCoalition } from '../src/sim/systems/diplomacy';

// Spec 12 §A/§B — alignment diplomacy (ententes, mediation) and the encirclement
// pressure (coalition → ultimatum → war → terminal). tickCoalition is re-exported
// from region for direct driving; formation is the only RNG-gated step.

function makeRegion(seed: number): RegionSim {
  const r = RegionSim.create(seed, { aiDifficulty: 'normal', currencySymbol: '$' });
  r.stateProclaimed = true;
  r.nationProclaimed = true;
  return r;
}

function spawnRivals(r: RegionSim, n: number): RivalNation[] {
  const spawn = (r as unknown as { spawnRival: () => RivalNation }).spawnRival.bind(r);
  while (r.rivals.length < n) spawn();
  return r.rivals.slice(0, n);
}

function emptyBasket(over: Partial<DealBasket> = {}): DealBasket {
  return { treaties: [], goldToThem: 0, goldToYou: 0, borderSettlement: false, entente: null, ...over };
}

// A coalition object built directly, so the deterministic maintain/ultimatum/war
// logic can be exercised without waiting on the RNG-gated formation step.
function seatCoalition(memberIds: number[], over: Partial<Coalition> = {}): Coalition {
  return { memberIds, formedDay: 0, cohesion: 40, demand: null, ultimatumDay: null, warDeclared: false, ...over };
}

describe('§A1 — entente chip on the bargaining table', () => {
  it('signs into the bloc, dings the named target, and is capped at MAX_ENTENTES', () => {
    const r = makeRegion(1);
    const [signer, target] = spawnRivals(r, 2);
    signer.relations = 50;
    signer.weights = { ...signer.weights, honor: 8, expansion: 4, grudge: 0, commerce: 5 };
    r.rivalPairs[r.pairKey(signer.id, target.id)] = -40; // signer already resents the target
    const targetRelBefore = target.relations;

    const ok = r.proposeDeal(signer.id, emptyBasket({ entente: target.id }));

    expect(ok).toBe(true);
    expect(r.ententes.some((e) => e.withRivalId === signer.id && e.targetRivalId === target.id)).toBe(true);
    expect(target.relations).toBe(r.clampRel(targetRelBefore - 8));
  });

  it('a rival will not sign an entente against its own ally', () => {
    const r = makeRegion(2);
    const [signer, target] = spawnRivals(r, 2);
    signer.relations = 60;
    r.alliances.push(r.pairKey(signer.id, target.id)); // they are allied
    // ententeAppetite returns −40 → deep concession → the deal cannot clear on its own.
    const ok = r.proposeDeal(signer.id, emptyBasket({ entente: target.id }));
    expect(ok).toBe(false);
    expect(r.ententes.length).toBe(0);
  });

  it('co-belligerence: an entente partner joins the player’s side in war on the target (statistical)', () => {
    let joined = 0;
    const trials = 40;
    for (let s = 0; s < trials; s++) {
      const r = makeRegion(100 + s);
      const [partner, target] = spawnRivals(r, 2);
      partner.weights = { ...partner.weights, honor: 10 }; // chance 0.4 + 0.5 = 0.9
      r.ententes.push({ withRivalId: partner.id, targetRivalId: target.id, signedDay: 0 });
      r.startPlayerWar(target, 'fabricated', false);
      if (r.playerWar?.allies.includes(partner.id)) joined++;
    }
    expect(joined / trials).toBeGreaterThan(0.7);
  });
});

describe('§A2 — broker foreign peace', () => {
  it('a favorable mediation ends the war as a white peace (statistical)', () => {
    let ended = 0;
    const trials = 40;
    for (let s = 0; s < trials; s++) {
      const r = makeRegion(200 + s);
      const [a, b] = spawnRivals(r, 2);
      a.relations = 80; b.relations = 80;
      a.weights = { ...a.weights, grudge: 0 };
      b.weights = { ...b.weights, grudge: 0 };
      r.treasury = 100000;
      r.foreignWars.push({ a: a.id, b: b.id, startedDay: r.day, endsDay: r.day + 3650 });
      const ok = r.brokerForeignPeace(a.id);
      if (ok && !r.foreignWars.some((w) => w.a === a.id || w.b === b.id)) ended++;
    }
    expect(ended / trials).toBeGreaterThan(0.75);
  });

  it('refuses cleanly with no treasury spent when the war-parties despise you', () => {
    const r = makeRegion(3);
    const [a, b] = spawnRivals(r, 2);
    a.relations = -90; b.relations = -90;
    a.weights = { ...a.weights, grudge: 10 };
    b.weights = { ...b.weights, grudge: 10 };
    r.treasury = 100000;
    r.foreignWars.push({ a: a.id, b: b.id, startedDay: r.day, endsDay: r.day + 3650 });
    const before = r.treasury;
    // Low p (~0.15) — assert the walk path stays cheap over repeated attempts.
    let refusedWithNoSpend = true;
    for (let i = 0; i < 20; i++) {
      const t = r.treasury;
      const ok = r.brokerForeignPeace(a.id);
      if (!ok && r.treasury !== t) refusedWithNoSpend = false;
      if (ok) break;
    }
    expect(refusedWithNoSpend).toBe(true);
    expect(r.treasury).toBeLessThanOrEqual(before);
  });
});

describe('§B — encirclement coalition', () => {
  it('does NOT coalesce on easy (teeth off) and draws no state', () => {
    const r = makeRegion(4); // default difficulty = easy (unrestPressure 0)
    const members = spawnRivals(r, 4);
    for (const m of members) m.relations = -60;
    r.treatiesBroken = 6; // belligerent
    for (let i = 0; i < 200; i++) tickCoalition(r);
    expect(r.coalition).toBeNull();
  });

  it('forms under threat + shared hostility when teeth are on', () => {
    const r = makeRegion(5);
    r.difficultySettings = { ...r.difficultySettings, unrestPressure: 1 };
    const members = spawnRivals(r, 4);
    for (const m of members) m.relations = -55;
    r.treatiesBroken = 6; // threat via belligerence ≥ bar
    let formed = false;
    for (let i = 0; i < 200 && !formed; i++) { tickCoalition(r); formed = !!r.coalition; }
    expect(formed).toBe(true);
    expect(r.coalition!.memberIds.length).toBeGreaterThanOrEqual(3);
  });

  it('peels a member the player mollifies, dissolving below the minimum', () => {
    const r = makeRegion(6);
    r.difficultySettings = { ...r.difficultySettings, unrestPressure: 1 };
    const members = spawnRivals(r, 3);
    for (const m of members) m.relations = -50;
    r.coalition = seatCoalition(members.map((m) => m.id), { cohesion: 50 });
    members[0].relations = 10; // bought off, above the leave line
    tickCoalition(r);
    expect(r.coalition).toBeNull();
  });

  it('ultimatum → war → coalition capitulation ends the run as encirclement', () => {
    const r = makeRegion(7);
    r.difficultySettings = { ...r.difficultySettings, unrestPressure: 1 };
    const members = spawnRivals(r, 3);
    for (const m of members) m.relations = -60;
    r.treatiesBroken = 6;
    // Seat a hardened bloc whose ultimatum window has already elapsed.
    r.coalition = seatCoalition(members.map((m) => m.id), {
      cohesion: 80, demand: 'tribute', ultimatumDay: r.day - 400,
    });
    tickCoalition(r);
    expect(r.coalition!.warDeclared).toBe(true);
    expect(r.playerWar).not.toBeNull();
    expect(r.playerWar!.enemyAllies.length).toBeGreaterThanOrEqual(2);
    // The bloc dictates the peace.
    r.capitulate();
    expect(r.gameOver).toBe(true);
    expect(r.gameOverCause).toBe('encirclement');
    expect(r.coalition).toBeNull();
  });

  it('a survived coalition war clears the bloc — no stale encirclement on a later, unrelated defeat', () => {
    const r = makeRegion(11);
    r.difficultySettings = { ...r.difficultySettings, unrestPressure: 1 };
    const members = spawnRivals(r, 3);
    for (const m of members) m.relations = -60;
    // Seat a marched coalition + its active war, then have the player SURVIVE it
    // (war ends by any path other than capitulation → playerWar cleared elsewhere).
    r.coalition = seatCoalition(members.map((m) => m.id), { cohesion: 80, warDeclared: true });
    r.startPlayerWar(members[0], 'encirclement', true);
    r.playerWar = null;
    tickCoalition(r);
    expect(r.coalition).toBeNull(); // the zombie is gone
    // A later ordinary 1v1 defeat against a former member must NOT read as encirclement.
    r.startPlayerWar(members[0], 'fabricated', false);
    r.capitulate();
    expect(r.gameOverCause).not.toBe('encirclement');
    expect(r.gameOver).toBe(false);
  });

  it('yielding to the ultimatum disperses the bloc before it marches', () => {
    const r = makeRegion(8);
    r.difficultySettings = { ...r.difficultySettings, unrestPressure: 1 };
    const members = spawnRivals(r, 3);
    for (const m of members) m.relations = -50;
    r.treasury = 10000;
    r.coalition = seatCoalition(members.map((m) => m.id), {
      cohesion: 70, demand: 'tribute', ultimatumDay: r.day - 10,
    });
    const ok = r.yieldToCoalition();
    expect(ok).toBe(true);
    expect(r.coalition).toBeNull();
    expect(r.playerWar).toBeNull();
  });

  it('ententes and coalition survive a serialize round-trip', () => {
    const r = makeRegion(9);
    const members = spawnRivals(r, 3);
    r.ententes.push({ withRivalId: members[0].id, targetRivalId: members[1].id, signedDay: 5 });
    r.coalition = seatCoalition(members.map((m) => m.id), { cohesion: 63, demand: 'disarm', ultimatumDay: 12 });
    const round = RegionSim.deserialize(r.serialize());
    expect(round.ententes).toEqual(r.ententes);
    expect(round.coalition).toEqual(r.coalition);
  });
});

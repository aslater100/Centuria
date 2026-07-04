/**
 * Notables lifecycle (GDD §2.4) — the twelfth `region.ts` tick subsystem lifted to the
 * Track-C free-function form `fn(r: RegionSim)`. See systems/pollution.ts for the
 * rationale: the body runs VERBATIM against the same RegionSim so the RNG-consumption
 * order is byte-identical (auxRng for health degradation, rng for mortality / heirs /
 * minister defection / scandal — in that exact order), `tick()` dispatches, and all
 * state + serialize() stay on RegionSim. Guarded by tests/serialize-determinism.
 *
 * The helpers it drives — mintNotable (vacancy fill / heir birth) and selectSuccessor
 * (minister replacement) — stay on RegionSim and are reached through `r`; mintNotable
 * was made public for this seam.
 */
import type { RegionSim, Notable, NotableArc } from '../region';

export function tickNotableLifecycle(r: RegionSim): void {
    // --- age, health degradation, death ---
    for (const n of r.notables) {
      if (!n.alive) continue;
      n.age += 1 / 12;

      // Health degrades monthly (scaled from annual rates). Seeded (auxRng), not
      // Math.random — a notable's health is serialized, so a non-deterministic
      // draw made the save non-reproducible for a fixed seed.
      const healthDecay = (r.auxRng.next() * 2 + (n.age > 70 ? 3 : 0)) / 12;
      n.health = Math.max(0, (n.health ?? 80) - healthDecay);

      // Death risk blended from age-based mortality and health
      const annualRisk = n.age > 75 ? 0.12 : n.age > 60 ? 0.03 : 0.004;
      const healthRisk = n.health < 20 ? 0.08 : n.health < 40 ? 0.02 : 0;
      if (r.rng.chance((annualRisk + healthRisk) / 12)) {
        n.alive = false;
        n.deathYear = r.year;
        n.bio.push(`Died ${r.year}, aged ${Math.floor(n.age)}.`);
        r.addLog(`${n.name}, ${n.role} of ${r.settlement(n.settlementId)?.name ?? 'the colony'}, has died, aged ${Math.floor(n.age)}.`, 'bad');
        // If minister, select a successor
        const mIdx = r.ministers.findIndex((m) => m.notableId === n.id);
        if (mIdx >= 0) {
          r.selectSuccessor(mIdx);
        } else {
          r.mintNotable(n.role, n.settlementId);
        }
      }
    }

    // --- birth of heirs (5% annual = ~0.417%/month) ---
    const alive = r.notables.filter((n) => n.alive);
    for (const n of alive) {
      if (n.age >= 25 && n.age <= 50 && r.rng.chance(0.05 / 12)) {
        const child = r.mintNotable(n.role, n.settlementId, { parentId: n.id, age: 0 });
        child.bio = [`Born to ${n.name}, ${r.year}.`];
        child.age = 0;
        n.children = n.children ?? [];
        n.children.push(child.id);
        r.addLog(`${n.name} welcomes a child, ${child.name}, born ${r.year}.`, 'info');
      }
    }

    // --- minister loyalty decay and defection ---
    if (r.nationProclaimed) {
      for (const m of r.ministers) {
        if (m.notableId === null) continue;
        const notable = r.notables.find((n) => n.id === m.notableId && n.alive);
        if (!notable) continue;

        // Loyalty decays 0.5/month for all ministers
        notable.loyalty = Math.max(0, (notable.loyalty ?? 80) - 0.5);
        notable.monthsIgnored = (notable.monthsIgnored ?? 0) + 1;

        // Defection: loyalty < 20 and 5% annual = ~0.4%/month chance
        if ((notable.loyalty ?? 80) < 20 && r.rng.chance(0.05 / 12)) {
          const mIdx = r.ministers.indexOf(m);
          r.addLog(`${notable.name}, ${m.title}, has defected — disillusioned with the government.`, 'bad');
          r.legitimacy = Math.max(0, r.legitimacy - 5);
          // Boost rival faction power if one exists
          const factionId = notable.factionAlignment ?? 'workers';
          const rivalFaction = r.factions?.find((f) => f.id === factionId);
          if (rivalFaction) rivalFaction.support = Math.min(100, (rivalFaction.support ?? 0) + 8);
          m.notableId = null;
          r.selectSuccessor(mIdx);
        }
      }

      // --- scandal: 2% annual per minister in role 5+ years (~0.17%/month) ---
      for (const m of r.ministers) {
        if (m.notableId === null) continue;
        const notable = r.notables.find((n) => n.id === m.notableId && n.alive);
        if (!notable) continue;
        const yearsInRole = r.year - (notable.yearEnteredRole ?? r.year);
        if (yearsInRole >= 5 && r.rng.chance(0.02 / 12)) {
          r.legitimacy = Math.max(0, r.legitimacy - 3);
          // Reduce satisfaction in notable's home settlement
          const t = r.settlement(notable.settlementId);
          if (t) t.satisfaction = Math.max(0, (t.satisfaction ?? 50) - 5);
          r.addLog(`SCANDAL: ${notable.name}, ${m.title}, embroiled in scandal. Public trust shaken.`, 'bad');
        }
      }
    }

    // --- prune unreferenced dead notables (bounds the list over a long run) ---
    // Role-fillers who die childless and were never a minister accumulate forever
    // (memory + a growing per-day scan), yet reference nothing. This removal is
    // provably reference-safe: a dead notable is kept if it belongs to a dynasty
    // (has a parent or children — exactly what buildDynastyTree surfaces) or is a
    // sitting minister. And every id inside a `children`/`parentId` link belongs to
    // a kept notable (a child always has parentId set; a parent always has that
    // child in `children`), so no surviving reference can dangle. Runs only during
    // the (monthly) lifecycle tick, never on deserialize, so a serialize round-trip
    // stays an exact identity.
    const ministerIds = new Set(
      r.ministers.map((m) => m.notableId).filter((id): id is number => id !== null),
    );
    let pruned = false;
    const kept = r.notables.filter((n) => {
      const keep = n.alive || n.parentId !== undefined || n.children.length > 0 || ministerIds.has(n.id);
      if (!keep) pruned = true;
      return keep;
    });
    if (pruned) r.notables = kept;

    tickNotableArcs(r);
  }

// ---------------------------------------------------------------------------
// Spec 10 §ARC — the narrative-arc engine. Notables stop being stat-blocks:
// trait-seeded multi-stage storylines fire beats into the bio chronicle and the
// main log, and stage 3 lands a real mechanical consequence through machinery
// that already exists (loyalty, legitimacy, skill, political capital).
// ---------------------------------------------------------------------------

const ARC_GLOBAL_CAP = 4;          // readable log > saturated log; 4 keeps ~1-2 live at a time
const ARC_SEED_CHANCE = 0.03;      // per eligible notable per month — tuned to ~1 arc/7-8yr (a
                                   // regular texture, not a rarity), still short of log saturation
const ARC_MIN_AGE = 21;

/** Beat decks: [stage0, stage1, stage2, stage3] per kind, 3 variants per stage
 *  (spec 10 §ARC content pass). {name}/{town} interpolated everywhere; {target}
 *  appears in the feud deck only. Variant picked with r.rng.int(3) at fire time. */
const ARC_BEATS: Record<NotableArc['kind'], string[][]> = {
  scandal: [
    [
      'Whispers follow {name} through {town} — sums unaccounted for, favors unexplained.',
      'A contract in {town} went to a firm nobody has heard of, and {name} signed the order twice.',
      'Questions gather around {name}: receipts gone missing, and a new coat no salary explains.',
    ],
    [
      'A clerk comes forward: ledgers touched by {name} do not balance, and never have.',
      'An auditor spends a week in {town} and leaves with a valise heavier than he came with; every page concerns {name}.',
      'The paper trail behind {name} runs through three names, and two of them are dead.',
    ],
    [
      'The affair around {name} breaks into the open; allies begin standing carefully apart.',
      'The {town} paper prints the figures in full; {name} calls it slander, and hires a lawyer anyway.',
      '{name} spends more evenings explaining than working, and even paid friends have begun charging more.',
    ],
    [
      'The full weight of the scandal lands on {name} — there is no walking this back.',
      'The inquiry closes and names {name} plainly; the verdict travels faster than the wire.',
      'What {name} took is tallied at last, and {town} learns the number by heart.',
    ],
  ],
  ambition: [
    [
      '{name} has begun speaking of {town} as "a start," and of themselves in the third person.',
      '{name} now arrives first at every meeting in {town} and stays long after the useful part ends.',
      '{name} sits for a portrait and practices a shorter, grander signature.',
    ],
    [
      '{name} is building a following — favors done quietly, names remembered precisely.',
      'Half of {town} owes {name} a favor now, and the other half suspects as much.',
      '{name} keeps a notebook of who said what at which table, and consults it before every handshake.',
    ],
    [
      '{name} openly courts the offices above their station; patience wears visibly thin.',
      '{name} speaks of "when," no longer "if," and takes care that superiors overhear it.',
      'Letters over {name}\'s signature reach desks well above {town}; the answers come back polite and slow.',
    ],
    [
      '{name} forces the question: advancement — or an exit on their own terms.',
      '{name} names a price for staying, and sets a date for the answer.',
      'The waiting is done — {name} demands the office outright, before witnesses chosen with care.',
    ],
  ],
  feud: [
    [
      'A slight at a public table: {name} and {target} no longer speak.',
      '{name} and {target} bid on the same lot in {town}, and one of them was never after the land.',
      'A toast misfired, an apology withheld — {name} and {target} now cross the street for each other.',
    ],
    [
      'The quarrel between {name} and {target} pulls in friends, then factions.',
      'In {town} you buy from {name}\'s people or from {target}\'s, and everyone knows which is which.',
      '{name} hires away {target}\'s best hand at wages that make no commercial sense.',
    ],
    [
      'Sabotage, or something near it — the feud between {name} and {target} is now policy by other means.',
      'A cart of {target}\'s goods founders on a road {name}\'s crew mended last week; nobody calls it an accident twice.',
      'Lawyers carry the quarrel between {name} and {target} now, at rates that will beggar them both.',
    ],
    [
      'The feud breaks: one of them will not recover their standing.',
      'The reckoning between {name} and {target} arrives at last, and {town} gathers to watch it land.',
      'After years of it, {name} and {target} settle the matter in the open, and only one walks away whole.',
    ],
  ],
  redemption: [
    [
      '{name}, still carrying the old disgrace, takes on work no one else wants.',
      '{name} returns to {town} plainly dressed and asks for the hardest post going.',
      'The old fault goes unmentioned; {name} simply starts arriving first and leaving last.',
    ],
    [
      'Quietly, competently, {name} is rebuilding what the scandal burned down.',
      'Work speaks where {name} will not: debts paid, roofs mended, no speeches given.',
      'In {town} they have begun saying "ask {name}" again — a sentence not heard in years.',
    ],
    [
      'Even old critics concede that {name} has changed — or always was more than the worst day.',
      'Those who once cut {name} in the street now stop to talk of weather and grain.',
      'A hard season tests {town}, and it is {name} who is found standing at the front of it.',
    ],
    [
      '{name} stands redeemed — the old shame recedes into the chronicle.',
      '{town} takes {name} back without ceremony, which is the only forgiveness that lasts.',
      'What {name} lost has been earned again, the slow way, and it holds the better for it.',
    ],
  ],
};

/** Two variants per kind; picked with r.rng.int(2) at fire time. */
const ARC_FIZZLE_BEAT: Record<NotableArc['kind'], string[]> = {
  scandal: [
    'The whispers around {name} fade for want of proof; the ledgers close over it.',
    'The witness reconsiders, the file thins, and {town} finds fresher things to whisper about than {name}.',
  ],
  ambition: [
    'The moment passes — {name} settles back into the work at hand, for now.',
    'The offices above stay shut, and {name} decides the view from here will serve a while longer.',
  ],
  feud: [
    'Mutual friends broker a cold but holding peace between {name} and {target}.',
    'Winter, or weariness — {name} and {target} let the quarrel starve for want of feeding.',
  ],
  redemption: [
    'The road back proves longer than {name} hoped; the effort quietly stalls.',
    'An old accusation resurfaces at the wrong hour, and the ground {name} regained gives quietly back.',
  ],
};

function interpolateBeat(template: string, r: RegionSim, n: Notable, target?: Notable): string {
  return template
    .replace(/\{name\}/g, n.name)
    .replace(/\{town\}/g, r.settlement(n.settlementId)?.name ?? 'the capital')
    .replace(/\{target\}/g, target?.name ?? 'a rival');
}

function fireArcBeat(r: RegionSim, n: Notable, text: string, tone: 'info' | 'bad' | 'good'): void {
  n.bio.push(text);
  r.addLog(text, tone);
}

function isMinister(r: RegionSim, n: Notable): boolean {
  return r.ministers.some((m) => m.notableId === n.id);
}

function pickArcKind(r: RegionSim, n: Notable, alive: Notable[]): NotableArc['kind'] | null {
  const kinds: NotableArc['kind'][] = [];
  if (n.traits.includes('disgraced')) kinds.push('redemption');
  if (n.traits.includes('corrupt')) kinds.push('scandal');
  if (n.traits.includes('bold') || n.traits.includes('charismatic')) kinds.push('ambition');
  if ((n.traits.includes('bold') || n.traits.includes('corrupt')) && alive.length > 1) kinds.push('feud');
  if (kinds.length === 0) return null;
  return kinds[r.rng.int(kinds.length)];
}

function arcTraitBias(n: Notable, kind: NotableArc['kind']): number {
  switch (kind) {
    case 'scandal': return n.traits.includes('corrupt') ? 0.10 : 0;
    case 'ambition': return n.traits.includes('bold') ? 0.10 : 0.05;
    case 'feud': return n.traits.includes('bold') ? 0.08 : 0;
    case 'redemption': return n.traits.includes('diligent') ? 0.12 : 0.05;
  }
}

/** Stage-3 consequences, all through existing machinery. Applied exactly once. */
function applyArcTerminal(r: RegionSim, n: Notable, arc: NotableArc, target?: Notable): void {
  switch (arc.kind) {
    case 'scandal': {
      n.loyalty = Math.max(0, n.loyalty - 30);
      if (!n.traits.includes('disgraced')) n.traits.push('disgraced');
      if (isMinister(r, n)) {
        r.legitimacy = Math.max(0, r.legitimacy - 5);
        r.addLog(`${n.name}'s ministry is crippled by the scandal — legitimacy suffers.`, 'bad');
      }
      const t = r.settlement(n.settlementId);
      if (t) t.satisfaction = Math.max(0, (t.satisfaction ?? 50) - 5);
      break;
    }
    case 'ambition': {
      if (r.politicalCapital >= 2) {
        r.politicalCapital -= 2;
        n.loyalty = Math.min(100, n.loyalty + 15);
        n.skill = Math.min(100, n.skill + 5);
        fireArcBeat(r, n, `${n.name} is given greater standing — ambition, for now, is satisfied.`, 'good');
      } else {
        n.loyalty = Math.max(0, n.loyalty - 25);
        fireArcBeat(r, n, `${n.name}'s ambitions are rebuffed for want of political capital — the loyalty lost will not soon return.`, 'bad');
      }
      break;
    }
    case 'feud': {
      if (!target) break;
      const loser = n.skill <= target.skill ? n : target;
      const winner = loser === n ? target : n;
      loser.skill = Math.max(0, loser.skill - 10);
      loser.loyalty = Math.max(0, loser.loyalty - 10);
      loser.bio.push(`Bested in the long feud with ${winner.name}; standing diminished.`);
      winner.bio.push(`Prevailed in the feud with ${loser.name}.`);
      break;
    }
    case 'redemption': {
      n.loyalty = Math.min(100, n.loyalty + 20);
      n.skill = Math.min(100, n.skill + 5);
      n.traits = n.traits.filter((tr) => tr !== 'disgraced');
      break;
    }
  }
}

/** Monthly arc tick: seed new arcs (trait-gated, global cap, at most one new arc
 *  per month), advance due stages (escalate vs fizzle, trait-weighted), land
 *  terminal consequences. All draws on r.rng inside this monthly tick —
 *  deterministic and serialize-safe (arc state rides the notables dump, v3). */
export function tickNotableArcs(r: RegionSim): void {
  const alive = r.notables.filter((n) => n.alive);
  const activeArcs = alive.filter((n) => n.arc && !n.arc.resolved).length;

  // --- seeding ---
  if (activeArcs < ARC_GLOBAL_CAP) {
    for (const n of alive) {
      if (n.arc && !n.arc.resolved) continue;
      if (n.age < ARC_MIN_AGE) continue;
      if (!r.rng.chance(ARC_SEED_CHANCE)) continue;
      const kind = pickArcKind(r, n, alive);
      if (!kind) continue;
      let targetNotableId: number | undefined;
      if (kind === 'feud') {
        const peers = alive.filter((p) => p.id !== n.id && (!p.arc || p.arc.resolved) &&
          (p.settlementId === n.settlementId || (isMinister(r, p) && isMinister(r, n))));
        if (peers.length === 0) continue;
        targetNotableId = peers[r.rng.int(peers.length)].id;
      }
      n.arc = {
        kind, stage: 0, startedDay: r.day,
        nextBeatDay: r.day + 60 + r.rng.int(120),
        targetNotableId, resolved: false,
      };
      const target = targetNotableId !== undefined ? r.notables.find((p) => p.id === targetNotableId) : undefined;
      fireArcBeat(r, n, interpolateBeat(ARC_BEATS[kind][0][r.rng.int(3)], r, n, target), kind === 'redemption' ? 'info' : 'bad');
      break; // at most one new arc per month keeps the stream readable
    }
  }

  // --- progression ---
  for (const n of alive) {
    const arc = n.arc;
    if (!arc || arc.resolved || r.day < arc.nextBeatDay) continue;
    const target = arc.targetNotableId !== undefined ? r.notables.find((p) => p.id === arc.targetNotableId) : undefined;
    // Feuds need a living opposite number; a death quietly closes the book.
    if (arc.kind === 'feud' && (!target || !target.alive)) {
      arc.resolved = true;
      continue;
    }
    const escalateP = 0.55 + arcTraitBias(n, arc.kind);
    if (!r.rng.chance(escalateP)) {
      fireArcBeat(r, n, interpolateBeat(ARC_FIZZLE_BEAT[arc.kind][r.rng.int(2)], r, n, target), 'info');
      arc.resolved = true;
      continue;
    }
    arc.stage = (arc.stage + 1) as NotableArc['stage'];
    fireArcBeat(r, n, interpolateBeat(ARC_BEATS[arc.kind][arc.stage][r.rng.int(3)], r, n, target),
      arc.kind === 'redemption' ? (arc.stage === 3 ? 'good' : 'info') : arc.stage === 3 ? 'bad' : 'info');
    if (arc.stage === 3) {
      applyArcTerminal(r, n, arc, target);
      arc.resolved = true;
    } else {
      arc.nextBeatDay = r.day + 60 + r.rng.int(120);
    }
  }
}

import { describe, expect, it } from 'vitest';

import { RegionSim } from '../src/sim/region';
import type { Notable, NotableRole, Settlement } from '../src/sim/region';

function makeRegion(seed = 7): RegionSim {
  return RegionSim.create(seed, { aiDifficulty: 'normal', currencySymbol: '$' });
}

/** eventNotableBeat is private (spec §L3c); reach it the way the rest of the
 *  suite reaches other private RegionSim internals — a narrow signature cast. */
function fireBeat(r: RegionSim, t: Settlement): void {
  (r as unknown as { eventNotableBeat(t: Settlement): void }).eventNotableBeat(t);
}

/** RegionSim.create seeds a settlement with its own starting Notables (Mayor,
 *  Doctor, Captain, Granger...), so eventNotableBeat's own random pick among
 *  `notablesAt(t.id)` would otherwise land on one of those instead of the
 *  notable under test. Retire every existing local notable first so the one
 *  minted here is the sole (and therefore guaranteed) pick. */
function soloNotable(r: RegionSim, t: Settlement, role: NotableRole, traits: string[]): Notable {
  for (const existing of r.notablesAt(t.id)) existing.alive = false;
  const n = r.mintNotable(role, t.id);
  n.traits = traits;
  return n;
}

describe('Notable bio beats — trait gating (spec §L3c)', () => {
  it('a corrupt-gated Mayor scandal beat never fires for a Mayor without the trait', () => {
    const r = makeRegion();
    const t = r.settlements[0];
    const n = soloNotable(r, t, 'Mayor', []);

    for (let i = 0; i < 200; i++) {
      const before = n.bio.length;
      fireBeat(r, t);
      for (const line of n.bio.slice(before)) {
        expect(line).not.toContain('skims the road fund');
      }
    }
  });

  it('a diligent-gated Doctor virtue beat never fires for a Doctor lacking diligent', () => {
    const r = makeRegion(11);
    const t = r.settlements[0];
    const n = soloNotable(r, t, 'Doctor', ['reclusive']); // holds a different gating trait, not diligent

    for (let i = 0; i < 200; i++) {
      const before = n.bio.length;
      fireBeat(r, t);
      for (const line of n.bio.slice(before)) {
        expect(line).not.toContain('orders new instruments');
      }
    }
  });

  it('a bold-gated Captain beat never fires for a Captain without the trait', () => {
    const r = makeRegion(23);
    const t = r.settlements[0];
    const n = soloNotable(r, t, 'Captain', ['cautious']); // has the *other* gated Captain trait, not bold

    for (let i = 0; i < 200; i++) {
      const before = n.bio.length;
      fireBeat(r, t);
      for (const line of n.bio.slice(before)) {
        expect(line).not.toContain('turns out anyway');
      }
    }
  });

  it('the gated beat becomes reachable once the notable holds the required trait', () => {
    const r = makeRegion(3);
    const t = r.settlements[0];
    const n = soloNotable(r, t, 'Mayor', ['corrupt']);

    let sawGrafter = false;
    for (let i = 0; i < 500 && !sawGrafter; i++) {
      const before = n.bio.length;
      fireBeat(r, t);
      if (n.bio.slice(before).some((line) => line.includes('skims the road fund'))) sawGrafter = true;
    }
    expect(sawGrafter).toBe(true);
  });

  it('every role keeps at least one ungated beat reachable with no traits at all', () => {
    const r = makeRegion(99);
    const roles: NotableRole[] = ['Mayor', 'Doctor', 'Captain', 'Granger', 'Forewoman', 'Reeve'];
    for (const role of roles) {
      const t = r.settlements[0];
      const n = soloNotable(r, t, role, []);
      const before = n.bio.length;
      fireBeat(r, t);
      expect(n.bio.length).toBeGreaterThan(before);
    }
  });
});

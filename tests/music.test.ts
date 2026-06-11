import { describe, expect, it } from 'vitest';
import { eraForYear, ERAS } from '../src/ui/music';

describe('soundtrack era arc (GDD §3.3)', () => {
  it('the colony opens on the ragtime chiptune era', () => {
    expect(eraForYear(1900).id).toBe('ragtime');
    expect(eraForYear(1917).id).toBe('ragtime');
  });

  it('the instrumentation modernizes with the date windows', () => {
    expect(eraForYear(1918).id).toBe('chipjazz');
    expect(eraForYear(1945).id).toBe('midcentury');
    expect(eraForYear(1970).id).toBe('analog');
    expect(eraForYear(2000).id).toBe('electronica');
    expect(eraForYear(2040).id).toBe('future');
  });

  it('clamps a pre-start year to the first era and never falls off the end', () => {
    expect(eraForYear(1850).id).toBe('ragtime');
    expect(eraForYear(2200).id).toBe('future');
  });

  it('the era windows are contiguous and ordered', () => {
    for (let i = 1; i < ERAS.length; i++) {
      expect(ERAS[i].fromYear).toBeGreaterThan(ERAS[i - 1].fromYear);
    }
  });
});

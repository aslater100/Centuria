import { describe, it, expect } from 'vitest';
import { RegionSim } from '../src/sim/region';

function makeRegion(seed = 42): RegionSim {
  return RegionSim.create(seed);
}

describe('computeProvinces()', () => {
  it('returns one province per settlement', () => {
    const r = makeRegion();
    const provinces = r.computeProvinces();
    expect(provinces.length).toBe(r.settlements.length);
  });

  it('province id matches settlement id', () => {
    const r = makeRegion();
    const provinces = r.computeProvinces();
    for (const prov of provinces) {
      const s = r.settlement(prov.id);
      expect(s).toBeDefined();
      expect(prov.capitalId).toBe(s!.id);
    }
  });

  it('province centroid matches settlement coordinates', () => {
    const r = makeRegion();
    const provinces = r.computeProvinces();
    for (const prov of provinces) {
      const s = r.settlement(prov.id);
      expect(prov.centroidX).toBe(s!.x);
      expect(prov.centroidY).toBe(s!.y);
    }
  });

  it('province factionId matches settlement factionId', () => {
    const r = makeRegion();
    const provinces = r.computeProvinces();
    for (const prov of provinces) {
      const s = r.settlement(prov.id);
      expect(prov.factionId).toBe(s!.factionId);
    }
  });

  it('province totalPop is non-negative and rounded', () => {
    const r = makeRegion();
    const provinces = r.computeProvinces();
    for (const prov of provinces) {
      expect(prov.totalPop).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(prov.totalPop)).toBe(true);
    }
  });

  it('province gdpContribution is rounded', () => {
    const r = makeRegion();
    const provinces = r.computeProvinces();
    for (const prov of provinces) {
      expect(Number.isInteger(prov.gdpContribution)).toBe(true);
    }
  });

  it('province satisfaction is in 0..100 range', () => {
    const r = makeRegion();
    const provinces = r.computeProvinces();
    for (const prov of provinces) {
      expect(prov.satisfaction).toBeGreaterThanOrEqual(0);
      expect(prov.satisfaction).toBeLessThanOrEqual(100);
    }
  });

  it('province name matches settlement name', () => {
    const r = makeRegion();
    const provinces = r.computeProvinces();
    for (const prov of provinces) {
      const s = r.settlement(prov.id);
      expect(prov.name).toBe(s!.name);
    }
  });

  it('player province factionId is playerFactionId', () => {
    const r = makeRegion();
    const playerProvinces = r.computeProvinces().filter((p) => p.factionId === r.playerFactionId);
    expect(playerProvinces.length).toBeGreaterThan(0);
    for (const prov of playerProvinces) {
      expect(prov.factionId).toBe(r.playerFactionId);
    }
  });

  it('returns consistent results on repeated calls', () => {
    const r = makeRegion();
    const first = r.computeProvinces();
    const second = r.computeProvinces();
    expect(first.length).toBe(second.length);
    for (let i = 0; i < first.length; i++) {
      expect(first[i].id).toBe(second[i].id);
      expect(first[i].totalPop).toBe(second[i].totalPop);
    }
  });
});

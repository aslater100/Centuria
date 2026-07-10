import { describe, it, expect } from 'vitest';
import {
  LIVE_ASSET_CATALOG,
  TOWN_TIERS,
  BACKDROP_ERAS,
  TERRAIN_BIOMES,
  mergeManifestItems,
  type GeneratedAssetItem,
} from '../src/data/assetCatalog';
import { townSpriteTier } from '../src/ui/assets/registry';
import { eraIdForYear } from '../src/ui/backdrop';

const item = (slot: string, sha = 'a'): GeneratedAssetItem => ({
  slot,
  file: `${slot}.png`,
  category: slot.startsWith('backdrop') ? 'backdrop' : 'town',
  sha256: sha,
});

describe('LIVE_ASSET_CATALOG', () => {
  it('covers exactly the live town tiers, backdrop eras and terrain biomes', () => {
    const slots = LIVE_ASSET_CATALOG.map((s) => s.slot).sort();
    const expected = [
      ...TOWN_TIERS.map((t) => `town-${t}`),
      ...BACKDROP_ERAS.map((e) => `backdrop-${e}`),
      ...TERRAIN_BIOMES.map((b) => `terrain-${b}`),
    ].sort();
    expect(slots).toEqual(expected);
  });

  it('every slot has a non-empty prompt and positive dimensions', () => {
    for (const s of LIVE_ASSET_CATALOG) {
      expect(s.prompt.length).toBeGreaterThan(20);
      expect(s.w).toBeGreaterThan(0);
      expect(s.h).toBeGreaterThan(0);
    }
  });

  it('town slots match the registry tier names', () => {
    const tierNames = new Set([
      townSpriteTier(0), townSpriteTier(50), townSpriteTier(150),
      townSpriteTier(300), townSpriteTier(700), townSpriteTier(5000),
    ]);
    for (const tier of tierNames) {
      expect(LIVE_ASSET_CATALOG.some((s) => s.slot === `town-${tier}`)).toBe(true);
    }
  });

  it('backdrop slots match every era eraIdForYear can return', () => {
    const eras = new Set([1900, 1950, 1980, 2010, 2080].map(eraIdForYear));
    for (const era of eras) {
      const def = LIVE_ASSET_CATALOG.find((s) => s.slot === `backdrop-${era}`);
      expect(def, `missing backdrop-${era}`).toBeDefined();
      expect(def!.era).toBe(era);
    }
  });

  it('terrain slots carry the terrain category, no era, and 64-multiple dims', () => {
    for (const biome of TERRAIN_BIOMES) {
      const def = LIVE_ASSET_CATALOG.find((s) => s.slot === `terrain-${biome}`);
      expect(def, `missing terrain-${biome}`).toBeDefined();
      expect(def!.category).toBe('terrain');
      expect(def!.era).toBeUndefined();
      expect(def!.w % 64).toBe(0); // FLUX needs 64-multiples
      expect(def!.h % 64).toBe(0);
    }
  });
});

describe('mergeManifestItems', () => {
  it('adds new items and sorts by slot', () => {
    const out = mergeManifestItems([], [item('town-castle'), item('backdrop-dawn')]);
    expect(out.map((i) => i.slot)).toEqual(['backdrop-dawn', 'town-castle']);
  });

  it('replaces an existing slot on re-generation, keeping the newest', () => {
    const out = mergeManifestItems([item('town-castle', 'old')], [item('town-castle', 'new')]);
    expect(out).toHaveLength(1);
    expect(out[0].sha256).toBe('new');
  });

  it('preserves existing items not in the incoming set', () => {
    const out = mergeManifestItems([item('town-shack')], [item('town-castle')]);
    expect(out.map((i) => i.slot)).toEqual(['town-castle', 'town-shack']);
  });

  it('is pure — does not mutate its inputs', () => {
    const existing = [item('town-shack')];
    const incoming = [item('town-castle')];
    mergeManifestItems(existing, incoming);
    expect(existing).toHaveLength(1);
    expect(incoming).toHaveLength(1);
  });
});

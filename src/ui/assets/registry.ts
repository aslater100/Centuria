/**
 * AssetRegistry — the generalized, manifest-driven art-override seam for the 4X
 * map, sibling to spriteOverrides.ts (which overrides the town SpriteSet). It
 * loads PNG/WebP art listed in `public/assets/asset_manifest.json` and serves it
 * by slot name, returning null when an asset is absent so every renderer falls
 * back to its procedural art. The game always draws correctly — with real assets
 * or entirely without them.
 *
 * Manifest (all item fields optional except `slot`):
 *   { "schemaVersion": 1,
 *     "items": [ { "slot": "town-castle", "file": "town-castle.png", "era": "interwar" } ] }
 * Absent or empty `items` → pure procedural, no per-asset fetches (opt-in).
 *
 * DOM-only: `Image`/`fetch`/`import.meta.env` are touched only inside `load()`,
 * so the module imports safely in Node (vitest) for its pure helpers below.
 */

export type TownTier = 'shack' | 'cottage' | 'house' | 'town' | 'manor' | 'castle';

/** Map a settlement population to its sprite tier (mirrors drawTownTier's bands). */
export function townSpriteTier(pop: number): TownTier {
  if (pop < 30) return 'shack';
  if (pop < 80) return 'cottage';
  if (pop < 200) return 'house';
  if (pop < 500) return 'town';
  if (pop < 1000) return 'manor';
  return 'castle';
}

/** On-screen draw size (px) for an override town sprite, per tier. */
export const TOWN_TIER_PX: Record<TownTier, number> = {
  shack: 22, cottage: 28, house: 34, town: 42, manor: 48, castle: 54,
};

export interface AssetItem { slot: string; file?: string; era?: string; }
export interface AssetManifest { schemaVersion?: number; items?: AssetItem[]; }

export class AssetRegistry {
  private images = new Map<string, HTMLImageElement>();
  /** Per-slot registration stamp (monotonic tick), driving version(). */
  private stamps = new Map<string, number>();
  private tick = 0;
  private loaded = false;

  /** Fetch the manifest and start loading every listed asset. Never throws. */
  async load(dir = 'assets'): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const base = import.meta.env.BASE_URL;
      const res = await fetch(`${base}${dir}/asset_manifest.json`);
      if (!res.ok) return;
      const manifest = (await res.json()) as AssetManifest;
      const items = manifest.items;
      if (!Array.isArray(items) || items.length === 0) return;
      for (const it of items) {
        if (!it || !it.slot) continue;
        const file = it.file ?? `${it.slot}.png`;
        const img = new Image();
        img.onload = () => {
          // Appears next frame. The stamp records registration order so
          // version() moves on arrival AND on same-slot replacement.
          this.images.set(it.slot, img);
          this.stamps.set(it.slot, ++this.tick);
        };
        img.src = `${base}${dir}/${file}`;
      }
    } catch {
      /* assets are optional — any failure leaves the procedural art in place */
    }
  }

  /** The loaded image for a slot, or null → the caller draws procedurally. */
  get(slot: string): HTMLImageElement | null {
    return this.images.get(slot) ?? null;
  }

  /** Monotonic version of the loaded slots matching a prefix. Images register
   *  asynchronously (`onload`), so cache signatures that bake assets in (e.g.
   *  the terrain mapCache keys on `version('terrain-')`) rebuild exactly when a
   *  matching asset arrives — or is replaced in-place (a plain size count would
   *  miss replacement and would rebuild spuriously on unrelated slots). */
  version(prefix: string): number {
    let v = 0;
    for (const [slot, t] of this.stamps) if (slot.startsWith(prefix) && t > v) v = t;
    return v;
  }

  has(slot: string): boolean {
    return this.images.has(slot);
  }
}

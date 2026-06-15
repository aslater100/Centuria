/**
 * PNG sprite overrides. After `buildSprites()` draws the procedural set, this
 * overlays any hand-made / AI-generated PNG found in `public/sprites/` onto the
 * matching slot, falling back to the procedural art wherever no file exists — so
 * the game always renders, override or not. Drop in one sprite at a time.
 *
 * Opt-in via `public/sprites/index.json` (a JSON array of slot names). Absent or
 * empty → pure procedural, and only ONE request is made (no per-sprite 404s).
 *
 * Slot names are derived by reflecting the SpriteSet, so there's no manifest to
 * keep in sync:
 *   canvas at key K       → "K"                (e.g. "tree", "interiorWall")
 *   array[i] at key K      → "K-i"              (settler[v][f] → "settler-v-f")
 *   Record[sub] at key K   → "K-sub"            (stations["oven"] → "stations-oven")
 * The file for slot "name" is `public/sprites/name.png`, drawn at the slot's
 * existing dimensions (so the renderer's hard-coded offsets keep working).
 * `sprites-preview.html` prints the full slot list with dimensions.
 *
 * ponytail: no headless self-check — it's DOM-only (canvas/Image/fetch); the
 * preview page exercises `listSlots` live and the loader degrades to a no-op.
 */
import type { SpriteSet } from './sprites';

export interface Slot { name: string; canvas: HTMLCanvasElement; }

/** Flatten a SpriteSet into named canvas slots — the override manifest. */
export function listSlots(sprites: SpriteSet): Slot[] {
  const out: Slot[] = [];
  const walk = (v: unknown, name: string): void => {
    if (v instanceof HTMLCanvasElement) out.push({ name, canvas: v });
    else if (Array.isArray(v)) v.forEach((c, i) => walk(c, `${name}-${i}`));
    else if (v && typeof v === 'object') for (const [k, c] of Object.entries(v)) walk(c, `${name}-${k}`);
  };
  for (const [k, v] of Object.entries(sprites)) walk(v, k);
  return out;
}

/** Paint a loaded PNG onto a slot's canvas, keeping the slot's dimensions. */
function paint(canvas: HTMLCanvasElement, img: HTMLImageElement): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
}

/** Overlay the PNG overrides listed in `{dir}/index.json`. Never throws. */
export async function applyOverrides(sprites: SpriteSet, dir = 'sprites'): Promise<void> {
  const base = import.meta.env.BASE_URL;
  try {
    const res = await fetch(`${base}${dir}/index.json`);
    if (!res.ok) return;
    const names: unknown = await res.json();
    if (!Array.isArray(names) || names.length === 0) return;
    const slots = new Map(listSlots(sprites).map((s) => [s.name, s.canvas]));
    for (const name of names) {
      const canvas = slots.get(String(name));
      if (!canvas) continue;
      const img = new Image();
      img.onload = () => paint(canvas, img); // async: next frame shows it; failures are ignored
      img.src = `${base}${dir}/${name}.png`;
    }
  } catch {
    /* overrides are optional — any failure falls back to procedural art */
  }
}

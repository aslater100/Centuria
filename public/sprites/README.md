# Sprite overrides (drop-in PNGs)

The game draws **procedural** sprites from `src/ui/sprites.ts`. To replace any
one with hand-made or AI-generated art, drop a PNG here and list its slot name
in `index.json` — no code change, falls back to procedural if the file is missing.

## How
1. Find the slot **name** and exact **dimensions**: run `npm run dev`, open
   `/sprites-preview.html`, scroll to the "Override manifest" section (every slot
   listed as `name.png — W×H`).
2. Make `public/sprites/<name>.png` at those dimensions, transparent background.
   (It's scaled to the slot size on load, so close dimensions are fine, but exact
   avoids blur.)
3. Add `"<name>"` to the array in `index.json`.
4. Reload. Overlay applies in both the live game and `core.html`.

## Naming
- single sprite:    `tree.png`, `interiorWall.png`
- animation frame:  `water-0.png`, `settler-0-1.png`  (settler[variant][frame])
- keyed (stations/items): `stations-oven.png`, `items-wood.png`

`index.json = []` means "no overrides" (the default) — one request, zero 404s.

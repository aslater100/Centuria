/**
 * scripts/shoot.ts — "Verify override beats procedural" screenshot driver
 * (.claude/agents/asset-generator.md, runbook step 7). Produces a deterministic
 * A/B PNG pair of the region view: one with the art-override manifest forced
 * empty (pure procedural rendering) and one with a single slot's override
 * populated, so a human can eyeball that the override actually replaces the
 * procedural sprite at the right size/position with no regression.
 *
 * Determinism: `Date.now()` is pinned before the game boots (main.ts seeds
 * `RegionSim.create`/`fromEraStart` with `Date.now() % 100000`), and once in
 * region mode the script writes directly to the already-exposed
 * `window.region` (`main.ts` sets this in `enterRegionMode`) to pin the
 * in-game clock (`region.minute`) and the founding settlement's population
 * (`settlements[0].cohorts.bands`) to a fixed castle-tier value. No sim tick
 * is required — `main.ts`'s render loop reads `region` live every frame.
 *
 * Manifest control: rather than writing to the real
 * `public/assets/asset_manifest.json` (shared, concurrently edited by other
 * tooling per the asset-generator contract — see its "Hard contracts"), this
 * script intercepts the manifest *and* override-image network requests with
 * Playwright route fulfillment. This never touches any file outside this
 * script's own process, is immune to a concurrently-running asset-generation
 * pass, and needs no before/after `git checkout --` restore step.
 *
 * Usage:
 *   npx tsx scripts/shoot.ts
 *   npm run shoot
 *
 * The dev server is started automatically (`npm run dev`) if nothing is
 * already listening on the target port, and killed again on exit. If a dev
 * server is already running there, it's reused as-is and left running.
 */
import { chromium, type Browser, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng, type Raster } from './png';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;
const OUT_DIR = resolve(REPO_ROOT, 'screenshots');
/** Fallback Chromium binary when the pinned Playwright can't locate one itself. */
const FALLBACK_CHROMIUM_PATH = '/opt/pw-browsers/chromium';

// ---- Deterministic target state -------------------------------------------

/** Pins the `Date.now() % 100000` seed main.ts feeds RegionSim.create/fromEraStart. */
const FIXED_NOW_MS = 1_700_000_000_000;
/** src/sim/defs.ts: START_YEAR=1919, MINUTES_PER_DAY=1440, 4 seasons * 15 days/season. */
const START_YEAR = 1919;
const MINUTES_PER_DAY = 1440;
const DAYS_PER_YEAR = 60;
const TARGET_YEAR = 1955;
const TARGET_MINUTE = (TARGET_YEAR - START_YEAR) * DAYS_PER_YEAR * MINUTES_PER_DAY;
/** Sums to 1200 -> castle tier (registry.ts townSpriteTier: pop >= 1000). */
const TARGET_POP_BANDS: readonly number[] = [200, 300, 300, 200, 200];
const OVERRIDE_SLOT = 'town-castle';
/** Served only via route interception below — never written to disk. */
const OVERRIDE_FILE = 'shoot-ab-override.png';

const MANIFEST_SLOTS = [
  'town-shack', 'town-cottage', 'town-house', 'town-town', 'town-manor', 'town-castle',
  'backdrop-dawn', 'backdrop-modern', 'backdrop-analog', 'backdrop-digital', 'backdrop-future',
];

const EMPTY_MANIFEST_JSON = JSON.stringify({
  schemaVersion: 1,
  note: 'scripts/shoot.ts A/B pass — forced-empty manifest served via route interception (procedural baseline).',
  availableSlots: MANIFEST_SLOTS,
  items: [],
});

const OVERRIDE_MANIFEST_JSON = JSON.stringify({
  schemaVersion: 1,
  note: 'scripts/shoot.ts A/B pass — forced override manifest served via route interception.',
  availableSlots: MANIFEST_SLOTS,
  items: [{ slot: OVERRIDE_SLOT, file: OVERRIDE_FILE }],
});

// ---- Dev server lifecycle ---------------------------------------------------

async function isServerUp(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function waitForServer(url: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerUp(url)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

/** Starts `npm run dev` if nothing answers at BASE_URL yet; null if reused. */
async function ensureDevServer(): Promise<ChildProcess | null> {
  if (await isServerUp(BASE_URL)) {
    console.log(`[shoot] dev server already running at ${BASE_URL} — reusing it.`);
    return null;
  }
  console.log('[shoot] starting `npm run dev`...');
  const child = spawn('npm', ['run', 'dev', '--', '--port', String(PORT), '--strictPort'], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  child.stdout?.on('data', () => {});
  child.stderr?.on('data', () => {});
  const up = await waitForServer(BASE_URL, 30_000);
  if (!up) {
    stopDevServer(child);
    throw new Error(`dev server did not become ready at ${BASE_URL} within 30s`);
  }
  console.log(`[shoot] dev server ready at ${BASE_URL}`);
  return child;
}

function stopDevServer(child: ChildProcess | null): void {
  if (!child || child.pid === undefined) return;
  try {
    // negative pid = whole detached process group (npm's child vite process too).
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    try { child.kill('SIGTERM'); } catch { /* already gone */ }
  }
}

// ---- Browser helpers ---------------------------------------------------

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch {
    return await chromium.launch({ executablePath: FALLBACK_CHROMIUM_PATH });
  }
}

async function setManifestRoute(page: Page, manifestJson: string): Promise<void> {
  await page.route('**/assets/asset_manifest.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: manifestJson }),
  );
}

async function setOverrideImageRoute(page: Page, pngBuffer: Buffer): Promise<void> {
  await page.route(`**/assets/${OVERRIDE_FILE}`, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: pngBuffer }),
  );
}

/** Title screen -> sandbox 1919 scenario -> region view (mirrors scripts/shoot-ui.mjs). */
async function enterRegionView(page: Page): Promise<void> {
  await page.goto(BASE_URL, { waitUntil: 'load' });
  await page.locator('#ts-scenarios').first().click({ timeout: 15_000 });
  await page.locator('#ts-begin-scenario').first().click({ timeout: 15_000 });
  await page.waitForFunction(
    () => Boolean((window as unknown as { region?: unknown }).region),
    null,
    { timeout: 20_000 },
  );
}

interface PinArgs {
  minute: number;
  bands: readonly number[];
}

/** Writes region.minute / settlements[0].cohorts.bands via the window.region hook main.ts already exposes. */
async function pinDeterministicState(page: Page): Promise<void> {
  const args: PinArgs = { minute: TARGET_MINUTE, bands: TARGET_POP_BANDS };
  await page.evaluate((a: PinArgs) => {
    interface RegionLike {
      minute: number;
      settlements: Array<{ cohorts: { bands: number[] } }>;
    }
    const r = (window as unknown as { region: RegionLike }).region;
    r.minute = a.minute;
    if (r.settlements.length > 0) r.settlements[0].cohorts.bands = a.bands.slice();
  }, args);
  // The render loop redraws every requestAnimationFrame from live `region` state
  // (src/main.ts) — no tick() needed, just let one frame land before capturing.
  await page.waitForTimeout(250);
}

// ---- Synthetic override placeholder ----------------------------------------

/**
 * A bold magenta/teal checkerboard — deliberately unmistakable against the
 * brown/stone procedural town sprites, so the A/B diff is legible at a glance.
 * This is a synthetic placeholder to exercise the override seam end-to-end;
 * producing real art is asset-generator's job (see its runbook), not this
 * script's.
 */
function buildPlaceholderRaster(width: number, height: number): Raster {
  const data = new Uint8Array(width * height * 4);
  const cell = 32;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const on = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      data[i] = on ? 255 : 20;
      data[i + 1] = on ? 0 : 220;
      data[i + 2] = on ? 255 : 40;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

// ---- Main ---------------------------------------------------------------

async function shootPass(
  browser: Browser,
  manifestJson: string,
  overridePng: Buffer | null,
  outPath: string,
): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('[shoot] page error:', e.message));
  await page.addInitScript((fixedNow: number) => {
    Date.now = () => fixedNow;
  }, FIXED_NOW_MS);
  await setManifestRoute(page, manifestJson);
  if (overridePng) await setOverrideImageRoute(page, overridePng);
  await enterRegionView(page);
  await pinDeterministicState(page);
  if (overridePng) await page.waitForTimeout(300); // let the intercepted <img> decode + register
  await page.screenshot({ path: outPath });
  await page.close();
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const devServer = await ensureDevServer();
  const browser = await launchBrowser();
  try {
    const proceduralPath = resolve(OUT_DIR, 'ab-procedural.png');
    const overridePath = resolve(OUT_DIR, 'ab-override.png');

    console.log(`[shoot] pass 1/2: procedural (manifest items:[]) -> ${proceduralPath}`);
    await shootPass(browser, EMPTY_MANIFEST_JSON, null, proceduralPath);

    console.log(`[shoot] pass 2/2: override (manifest items:[${OVERRIDE_SLOT}]) -> ${overridePath}`);
    const overridePng = encodePng(buildPlaceholderRaster(512, 512));
    await shootPass(browser, OVERRIDE_MANIFEST_JSON, overridePng, overridePath);

    console.log(`[shoot] done:\n  ${proceduralPath}\n  ${overridePath}`);
  } finally {
    await browser.close();
    stopDevServer(devServer);
  }
}

main().catch((err: unknown) => {
  console.error('[shoot] failed:', err);
  process.exitCode = 1;
});

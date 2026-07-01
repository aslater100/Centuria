// Screenshot harness for the Gilded Century UI overhaul.
// Usage: node shoot-ui.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? './shots';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text()); });

const shot = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };
const clickId = async (id) => { await page.locator(`#${id}`).first().click({ force: true }); await page.waitForTimeout(300); };
const nudge = async (sel, left) => page.evaluate(([s, l]) => { const el = document.querySelector(s); if (el) { el.style.left = l; el.style.right = 'auto'; } }, [sel, left]);

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await shot('01-title');

try {
  await clickId('ts-scenarios');
  await shot('02-scenarios');
} catch (e) { console.log('skip scenarios:', e.message); }

try {
  await clickId('ts-begin-scenario');
  await page.waitForTimeout(2500);
  await shot('03-region');
} catch (e) { console.log('skip begin:', e.message); }

// In-game panels via the REGION-panel toggle buttons; left-anchored ones get
// nudged clear of the REGION panel for a clean shot.
const panels = [
  ['economy-toggle', '04-economy', '.economy-panel', '450px'],
  ['research-toggle', '05-research', null, null],
  ['settlements-toggle', '06-settlements', '.settlement-list-panel', '450px'],
  ['routenet-toggle', '07-routes', '.route-network-panel', '450px'],
];
for (const [toggleId, name, sel, left] of panels) {
  try {
    await clickId(toggleId);
    await page.waitForTimeout(500);
    if (sel) await nudge(sel, left);
    await shot(name);
    if (name === '04-economy') {
      // Wonders tab (the space race)
      const tab = page.locator('[data-ptab="wonders"]');
      if (await tab.count()) { await tab.first().click({ force: true }); await page.waitForTimeout(400); await shot('04b-wonders'); }
    }
    await clickId(toggleId);
    await page.waitForTimeout(200);
  } catch (e) { console.log('skip', name, e.message); }
}

// Settlement inspector
try {
  for (const [dx, dy] of [[0, -15], [0, 60], [-120, 0], [120, 40], [0, -80]]) {
    await page.mouse.click(800 + dx, 470 + dy);
    await page.waitForTimeout(350);
    const vis = await page.locator('.inspector:not(.hidden)').count();
    if (vis > 0) { await shot('08-inspector'); break; }
  }
} catch (e) { console.log('skip inspector:', e.message); }

// Pause menu
try {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await shot('09-pause');
  await page.keyboard.press('Escape');
} catch (e) { console.log('skip pause:', e.message); }

await browser.close();
console.log('done');

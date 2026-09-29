import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on('pageerror', (e) => console.log('PAGEERR', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await p.goto('http://localhost:5173/');
await p.waitForTimeout(1500);
const errs = await p.evaluate(async () => {
  const { RegionSim } = await import('/src/sim/region.ts');
  const { NationScreen } = await import('/src/ui/screens/nationScreen.ts');
  document.querySelector('.title-screen')?.classList.add('hidden');
  const mode = new URLSearchParams(location.search).get('m');
  const r = RegionSim.create(4);
  const shots = [];
  const ns = new NationScreen(document.body);
  ns.onSetFiscal = (k, v) => { r[k] = v; };
  ns.onSetPolicyRate = (v) => { r.policyRate = v; };
  window.__ns = ns; window.__r = r;
  const step = (n) => { for (let i = 0; i < n; i++) r.tick(); };
  ns.open(r, 'government');
  window.__stage = 'pre';
  return 'ok';
});
console.log(errs);
const shot = async (n) => { await p.waitForTimeout(200); await p.screenshot({ path: `/tmp/claude-0/shots/nation-${n}.png` }); };
for (const t of ['government','budget','politics','military']) {
  await p.evaluate((t) => window.__ns.open(window.__r, t), t);
  await shot('pre-' + t);
}
await p.evaluate(() => {
  const r = window.__r;
  r.stateProclaimed = true; r.nationProclaimed = true; r.stateName = 'Valeria'; r.nationName = 'Republic of Valeria';
  r.govType = 'democracy'; r.legitimacy = 72; r.politicalCapital = 60; r.proclamationReady = true;
  r.activePolicies = [null, null, null, null];
  for (let i = 0; i < 365; i++) r.tick();
  r.passedLaws.add('central_bank_charter');
});
for (const t of ['government','budget','politics','military']) {
  await p.evaluate((t) => window.__ns.open(window.__r, t), t);
  await shot('post-' + t);
}
await p.evaluate(() => { const r = window.__r; r.startPlayerWar(r.rivals[0], 'border_dispute', false); r.recruitUnits('militia', 10); window.__ns.open(r, 'military'); });
await shot('war');
await p.evaluate(() => { window.__ns.open(window.__r, 'government'); });
await p.click('button[data-act="slot"]').catch(() => {});
await shot('picker');
await b.close();

// Headless E2E smoke test for The Sovereign's Trial & Alchemist Wheel.
//   pnpm dev   (one terminal)      pnpm e2e   (another)
// Env: BASE_URL (default http://localhost:5175/), CHROME_PATH (default /usr/bin/google-chrome),
//      E2E_GPU=0 for software rendering (skips FPS assertions).
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:5175/';
const OUT = new URL('./screenshots/', import.meta.url).pathname;
const GPU = process.env.E2E_GPU !== '0';
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', ...(GPU ? ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'] : [])],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`${BASE}?inspector=1&clientSeed=e2e-herald`, { waitUntil: 'load' });
await page.waitForSelector('.stage__canvas');
await sleep(900);

const state = () => page.$eval('.inspector .pill.is-active', (e) => e.textContent);
const text = (sel) => page.$eval(sel, (e) => e.textContent ?? '');
const waitState = async (want, ms = 12000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (want.includes(await state())) return true;
    await sleep(40);
  }
  return false;
};
const blur = () => page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
const force = async (v) => {
  await page.select('[data-testid="force"]', v);
  await blur();
};
const begin = async () => {
  await blur();
  await page.keyboard.press('Space');
};
const treasury = () => text('.ledger__treasury .figure');
const accepted = async (event) =>
  page.$$eval(
    '.log tbody tr',
    (rows, ev) => rows.filter((r) => !r.classList.contains('is-rejected') && r.children[1]?.textContent?.startsWith(ev)).length,
    event,
  );
const rejected = async (event) =>
  page.$$eval(
    '.log tbody tr',
    (rows, ev) => rows.filter((r) => r.classList.contains('is-rejected') && r.children[1]?.textContent?.startsWith(ev)).length,
    event,
  );

check('scene canvas mounted with size', await page.$eval('.stage__canvas', (c) => c.width > 200 && c.height > 200));
check('initial state IDLE', (await state()) === 'IDLE');
check('three risk pennants and five ladder tiers', (await page.$$('.pennant')).length === 3 && (await page.$$('.rung')).length === 5);
await page.screenshot({ path: `${OUT}/01-idle.png` });

// 1. Begin (spam Space): one START, the wheel launches immediately.
const t0 = await treasury();
await begin();
await page.keyboard.press('Space');
await page.keyboard.press('Space');
await sleep(260); // inspector polls every 200 ms
check('stake debited once', (await treasury()) !== t0, `${t0} → ${await treasury()}`);
const wheelEarly = await text('[data-testid="insp-wheel"]');
check('wheel launches at once (wind-up/accel) while the court decides', /windup|accel|cruise/.test(wheelEarly), wheelEarly);
await sleep(700);
await page.screenshot({ path: `${OUT}/02-spinning.png` });
check('alchemist pushed the wheel (push/watch clip)', /push|watch|tension/.test(await text('[data-testid="insp-chars"]')), await text('[data-testid="insp-chars"]'));
await waitState(['LADDER_DECISION', 'ROUND_OVER_BUST', 'ROUND_OVER_COLLECTED']);
check('exactly one START accepted despite triple Space', (await accepted('START')) === 1, `accepted ${await accepted('START')}`);
await sleep(250);
const landing = await text('[data-testid="insp-landing"]');
const m = landing.match(/server #(\d+) · settled under pointer #(\d+)/);
const ticks = parseInt(await text('[data-testid="insp-ticks"]'), 10);
check('wheel settled exactly on the server sector', !!m && m[1] === m[2], landing);
check('pointer ticked against the pins', ticks >= 12, `${ticks} ticks`);

// 2. Fair trial verifies (whatever the outcome).
if ((await state()) === 'LADDER_DECISION') {
  await page.click('[data-testid="claim"]');
  await waitState(['ROUND_OVER_COLLECTED']);
}
await sleep(300);
await page.click('[data-testid="verify"]');
await page.waitForSelector('[data-testid="verdict"]', { timeout: 4000 }).catch(() => null);
check('finished trial verifies (seal + every turn re-derived)', (await page.$eval('[data-testid="verdict"]', (e) => e.className).catch(() => '')).includes('is-ok'));

// 3. Forced advance → ladder decision; double claim → one CLAIM.
await force('advance');
await begin();
check('forced advance reaches the ladder decision', await waitState(['LADDER_DECISION']));
await sleep(500);
check('rung I sealed in wax', (await page.$$('.rung.is-current')).length === 1 && (await text('.rung.is-current .rung__name')).includes('Novitiate'));
await page.screenshot({ path: `${OUT}/03-decision.png` });
const claimsBefore = await accepted('CLAIM');
await page.click('[data-testid="claim"]');
await page.click('[data-testid="claim"]').catch(() => null);
await page.keyboard.press('c');
check('claim settles → ROUND_OVER_COLLECTED', await waitState(['ROUND_OVER_COLLECTED']));
check('exactly one CLAIM accepted (double-collect impossible)', (await accepted('CLAIM')) - claimsBefore === 1, `+${(await accepted('CLAIM')) - claimsBefore}, rejected ${await rejected('CLAIM')}`);
await sleep(1100);
check('proclamation scroll + alchemist bow + coins', !!(await page.$('.proclaim--won')) && /bow|idle/.test(await text('[data-testid="insp-chars"]')));
await page.screenshot({ path: `${OUT}/04-collected.png` });

// 4. Risk climb: forced advance twice, Tempt Fate mid-decision → rung II.
await force('advance');
await begin();
await waitState(['LADDER_DECISION']);
await force('advance');
await page.click('[data-testid="risk"]');
await page.click('[data-testid="risk"]').catch(() => null);
await waitState(['LADDER_DECISION', 'ROUND_OVER_BUST']);
check('Tempt Fate climbs to tier II (one RISK accepted)', (await text('.rung.is-current .rung__name')).includes('Squire'));

// 5. Forced curse → bust, flinch, soot, scroll.
await force('curse');
await page.click('[data-testid="risk"]');
check('curse → ROUND_OVER_BUST', await waitState(['ROUND_OVER_BUST']));
await sleep(120);
const chars = await text('[data-testid="insp-chars"]');
const parts = parseInt(await text('[data-testid="insp-particles"]'), 10);
check('alchemist flinches, raven flaps, soot burst', chars.startsWith('flinch') && chars.includes('flap') && parts > 40, `${chars} · ${parts} particles`);
await page.screenshot({ path: `${OUT}/05-cursed.png` });
await sleep(1500);
check('cursed proclamation (delayed so the curse reads first)', !!(await page.$('.proclaim--cursed')));
await page.click('[data-testid="verify"]');
await sleep(400);
check('forced outcome is detected by verification', (await page.$eval('[data-testid="verdict"]', (e) => e.className).catch(() => '')).includes('is-bad'));

// 6. Lost response mid-trial → letter → send again → applied once.
await force('advance');
await begin();
await waitState(['LADDER_DECISION']);
const turnsBefore = (await text('.inspector .kv')).length;
await force('lostResponse');
await page.click('[data-testid="risk"]');
await page.waitForSelector('.letter', { timeout: 8000 }).catch(() => null);
check('lost answer opens the court letter', !!(await page.$('.letter')));
check('letter actions right-aligned', (await page.$eval('.letter__actions', (e) => getComputedStyle(e).justifyContent)) === 'flex-end');
await page.screenshot({ path: `${OUT}/06-letter.png` });
await page.click('.letter .btn--primary');
check('retry resolves the same spin', await waitState(['LADDER_DECISION', 'ROUND_OVER_BUST'], 12000));
const turnsText = await page.$$eval('.inspector .kv dd', (dds) => dds.map((d) => d.textContent).find((t) => /^\d:/.test(t ?? '')) ?? '');
check('the retried turn counted exactly once', turnsText.trim().split(/\s+/).length === 2, turnsText);
void turnsBefore;
if ((await state()) === 'LADDER_DECISION') {
  await page.click('[data-testid="claim"]');
  await waitState(['ROUND_OVER_COLLECTED']);
}

// 7. Open failure → refund → back to the hall.
const before = await treasury();
await force('networkError');
await begin();
await page.waitForSelector('.letter', { timeout: 6000 }).catch(() => null);
check('stake returned when the trial could not begin', (await treasury()) === before, `${before} vs ${await treasury()}`);
await page.click('.letter .btn--primary');
check('dismiss returns to IDLE', await waitState(['IDLE']));

// 8. Risk preset by key.
await blur();
await page.keyboard.press('3');
await sleep(200);
check('key 3 selects the Sovereign’s Gambit', (await text('[data-testid="insp-preset"]')) === 'SOVEREIGN_HIGH_RISK');
await page.keyboard.press('2');

// 9. Frame rate during a full spin.
await begin();
await sleep(1600);
const fps = parseFloat(await text('[data-testid="insp-fps"]'));
const perf = await text('[data-testid="insp-perf"]');
if (GPU) check('≥ 50 fps while the wheel spins', fps >= 50, `${fps} fps · ${perf}`);
else console.log(`SKIP  FPS (software GL): ${fps}`);
await waitState(['LADDER_DECISION', 'ROUND_OVER_BUST']);
if ((await state()) === 'LADDER_DECISION') {
  await page.click('[data-testid="claim"]');
  await waitState(['ROUND_OVER_COLLECTED']);
}

// 10. Rules drawer: primary action on the right.
await page.click('button[aria-label="Laws of the trial"]');
await sleep(400);
check('rules drawer footer right-aligned', (await page.$eval('.rules .drawer__footer', (e) => getComputedStyle(e).justifyContent)) === 'flex-end');
await page.screenshot({ path: `${OUT}/07-rules.png` });
await page.keyboard.press('Escape');

// 11. Responsive layouts.
for (const [name, vp] of [
  ['portrait-390', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['portrait-360', { width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['portrait-320', { width: 320, height: 640, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['landscape-844', { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['tablet-820', { width: 820, height: 1180, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['desktop-1280', { width: 1280, height: 720 }],
]) {
  await page.setViewport(vp);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('.stage__canvas');
  await sleep(800);
  const r = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const act = document.querySelector('.act').getBoundingClientRect();
    const alcove = document.querySelector('.alcove').getBoundingClientRect();
    const ledger = document.querySelector('.ledger');
    const lr = ledger.getBoundingClientRect();
    const overlap = !(lr.right <= alcove.left || lr.left >= alcove.right || lr.bottom <= alcove.top || lr.top >= alcove.bottom);
    return {
      overflow,
      ledgerClipped: ledger.scrollWidth - ledger.clientWidth,
      ctaVisible: act.bottom <= innerHeight && act.right <= innerWidth && act.height > 0,
      alcoveH: Math.round(alcove.height),
      overlap,
    };
  });
  check(`${name}: no overflow, CTA visible, wheel alcove ≥ 200px, no overlap`, r.overflow === 0 && r.ledgerClipped === 0 && r.ctaVisible && r.alcoveH >= 200 && !r.overlap, JSON.stringify(r));
  await page.screenshot({ path: `${OUT}/layout-${name}.png` });
}

check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

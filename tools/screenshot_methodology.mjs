// Screenshots of every page of the experiment, for the methodology document.
// Runs study 1 (and the first screens of study 2) in headless Chromium at a
// 1300 x 820 window, 2x device pixel ratio, calibrated at 5.11 px/mm, with the
// deployed configuration pointed at a fake Supabase endpoint on this machine so
// the completion page looks exactly as deployed.
// Run: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tools/screenshot_methodology.mjs <out-dir>
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'site');
const OUT = path.resolve(process.argv[2] ?? 'methodology-screens');
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml'};
let base = '';
const configs = {1: fs.readFileSync(path.join(APP, '1/config.js'), 'utf8'), 2: fs.readFileSync(path.join(APP, '2/config.js'), 'utf8')};
const fake = c => { const r = c.replace(/supabase: \{url: '[^']*'/, `supabase: {url: '${base}supabase/'`); if (r === c) throw new Error('config not rewritten'); return r; };
const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  if (req.method === 'POST') { let body = ''; req.on('data', c => body += c); req.on('end', () => { const n = p === '/supabase/rest/v1/rpc/record_rows' ? JSON.parse(body).p_rows.length : 0; res.writeHead(200, {'Content-Type': 'application/json'}); res.end(String(n)); }); return; }
  const m = /^\/([12])\/config\.js$/.exec(p);
  if (m) { res.writeHead(200, {'Content-Type': 'text/javascript', 'Cache-Control': 'no-store'}); return res.end(fake(configs[m[1]])); }
  let file = path.join(APP, p);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store'});
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, r));
base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 1300, height: 820}, deviceScaleFactor: 2});
await context.addInitScript(() => { Object.defineProperty(screen, 'width', {get: () => 1920}); Object.defineProperty(screen, 'height', {get: () => 1080}); });
fs.mkdirSync(OUT, {recursive: true});
const shot = (page, name, opts = {}) => page.screenshot({path: path.join(OUT, name + '.png'), ...opts});
const state = page => page.evaluate(() => lineSimilarityState());

// Study 1: every page in order.
const page = await context.newPage();
page.on('pageerror', e => { throw e; });
await page.goto(`${base}1/?reset=1`);
await shot(page, '01-first-page', {fullPage: true});
if (await page.isVisible('#code-row')) await page.fill('#participant-code', '12345678');
await page.click('#begin');
await shot(page, '02-consent', {fullPage: true});
await page.check('#consent-agree'); await page.click('#consent-continue');
if (await page.isVisible('#demographics')) { await shot(page, '03-age-gender', {fullPage: true}); await page.fill('#age', '34'); await page.check('input[name=gender][value=female]'); await page.click('#demographics-continue'); }
await shot(page, '04-calibration');
await page.evaluate(w => { const r = document.getElementById('card-size'); r.value = w; r.dispatchEvent(new Event('input')); }, 85.6 * 5.11);
await shot(page, '04b-calibration-matched');
await page.click('#confirm-card');
await page.waitForSelector('#start:not([disabled])');
await shot(page, '05-instructions', {fullPage: true});
await page.click('#start');
const n = (await state(page)).total ?? 19;
for (let i = 0; i < n; i++) {
  await page.waitForFunction(k => lineSimilarityState().ready && lineSimilarityState().completed === k, i);
  await page.waitForTimeout(150);
  const s = await state(page);
  await shot(page, `06-trial-${String(i + 1).padStart(2, '0')}-${s.presentation.trial_id}-${s.presentation.left_condition}-vs-${s.presentation.right_condition}`);
  if (i === 0) { await page.waitForTimeout(100); }
  await page.keyboard.press(i % 2 ? 'ArrowRight' : 'ArrowLeft');
  if (i === 0) { await page.waitForTimeout(120); await shot(page, '06b-between-trials'); }
}
await page.waitForFunction(() => lineSimilarityState().mode === 'complete' && lineSimilarityState().submitted, null, {timeout: 60000});
await shot(page, '07-finished');
await page.close();

// Study 2: first page, instructions and two trial screens.
const page2 = await context.newPage();
page2.on('pageerror', e => { throw e; });
await page2.goto(`${base}2/?reset=1`);
await shot(page2, '20-study2-first-page', {fullPage: true});
if (await page2.isVisible('#code-row')) await page2.fill('#participant-code', '12345678');
await page2.click('#begin');
await page2.evaluate(w => { const r = document.getElementById('card-size'); r.value = w; r.dispatchEvent(new Event('input')); }, 85.6 * 5.11);
await page2.click('#confirm-card');
await page2.waitForSelector('#start:not([disabled])');
await shot(page2, '21-study2-instructions', {fullPage: true});
await page2.click('#start');
for (let i = 0; i < 2; i++) {
  await page2.waitForFunction(k => lineSimilarityState().ready && lineSimilarityState().completed === k, i);
  await page2.waitForTimeout(150);
  const s = await state(page2);
  await shot(page2, `22-study2-trial-${i + 1}-${s.presentation.trial_id}-${s.presentation.left_condition}-vs-${s.presentation.right_condition}`);
  await page2.keyboard.press('ArrowLeft');
}
// The participant information and consent page prepared for the ethics application.
const consent = await context.newPage();
await consent.goto('file://' + path.join(ROOT, 'docs/methodology/consent-page.html'));
await consent.waitForTimeout(200);
await shot(consent, '02-consent-information', {fullPage: true});
await browser.close(); server.close();
console.log(fs.readdirSync(OUT).sort().join('\n'));

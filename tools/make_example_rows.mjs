// Produces example Supabase rows for the analysis handoff by running both
// studies in headless Chromium against a fake Supabase endpoint on this
// machine, with the deployed configs (only the Supabase URL is replaced).
// Two "participants" complete each study; the first one also leaves study 1
// after four screens (producing an 'abandoned' interim row) and then starts
// again. Reaction times are those of an automated browser, not of people.
// Output: <out>/posts.json (every record_rows call, in order) and one JSON
// array per table with the rows exactly as posted.
// Run: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tools/make_example_rows.mjs [out-dir]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'site');
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'handoff/analysis/examples/raw');
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml'};
const posts = [];
let base = '';
const configs = {1: fs.readFileSync(path.join(APP, '1/config.js'), 'utf8'), 2: fs.readFileSync(path.join(APP, '2/config.js'), 'utf8')};
const fake = c => { const r = c.replace(/supabase: \{url: '[^']*'/, `supabase: {url: '${base}supabase/'`); if (r === c) throw new Error('config not rewritten'); return r; };
const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  if (req.method === 'POST') {
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      if (p !== '/supabase/rest/v1/rpc/record_rows') { res.writeHead(404); return res.end('unexpected ' + p); }
      const b = JSON.parse(body);
      posts.push({received_at: new Date().toISOString(), table: b.p_table, rows: b.p_rows});
      res.writeHead(200, {'Content-Type': 'application/json'}); res.end(String(b.p_rows.length));
    }); return;
  }
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
const context = await browser.newContext({viewport: {width: 1300, height: 820}});
await context.addInitScript(() => { Object.defineProperty(screen, 'width', {get: () => 1920}); Object.defineProperty(screen, 'height', {get: () => 1080}); });
const errors = [];
const rand = (a, b) => a + Math.random() * (b - a);
const state = p => p.evaluate(() => lineSimilarityState());
const waitPosts = async n => { const t0 = Date.now(); while (posts.length < n) { if (Date.now() - t0 > 20000) throw new Error('expected ' + n + ' posts, have ' + posts.length); await new Promise(r => setTimeout(r, 100)); } };

async function newPage(study) {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}${study}/?reset=1`);
  return page;
}
async function intro(page, code, demo) {
  await page.fill('#participant-code', code);
  await page.click('#begin');
  if (await page.isVisible('#consent-page')) { await page.check('#consent-agree'); await page.click('#consent-continue'); }
  if (await page.isVisible('#demographics')) { await page.fill('#age', String(demo.age)); await page.check(`input[name=gender][value=${demo.gender}]`); await page.click('#demographics-continue'); }
  if ((await state(page)).mode !== 'calibration') throw new Error('expected calibration, got ' + (await state(page)).mode);
  await page.evaluate(w => { const r = document.getElementById('card-size'); r.value = w; r.dispatchEvent(new Event('input')); }, 85.6 * 5.11);
  await page.click('#confirm-card');
  await page.waitForSelector('#start:not([disabled])');
  await page.click('#start');
  await page.waitForFunction(() => lineSimilarityState().ready);
}
async function answer(page, i, {method = 'keyboard', side} = {}) {
  await page.waitForFunction(n => lineSimilarityState().ready && lineSimilarityState().completed === n, i);
  await page.waitForTimeout(rand(350, 1100));
  side ??= Math.random() < 0.5 ? 'left' : 'right';
  if (method === 'pointer') await page.click(`#stage .object[aria-label="Choose ${side === 'left' ? 'B' : 'C'}"]`);
  else await page.keyboard.press(side === 'left' ? 'ArrowLeft' : 'ArrowRight');
}
async function hideAndShow(page) {
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', {get: () => true, configurable: true}); Object.defineProperty(document, 'visibilityState', {get: () => 'hidden', configurable: true}); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', {get: () => false, configurable: true}); Object.defineProperty(document, 'visibilityState', {get: () => 'visible', configurable: true}); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(() => lineSimilarityState().ready);
}
async function finish(page, label) {
  await page.waitForFunction(() => lineSimilarityState().mode === 'complete' && lineSimilarityState().submitted, null, {timeout: 90000})
    .catch(async e => { throw new Error(label + ': completion wait failed: ' + JSON.stringify(await state(page)) + ' ' + e.message); });
}
const total = async page => (await state(page)).total;

// Study 1, participant 11223344: four screens (one interrupted by a hidden tab), then leaves.
const p1 = await newPage(1);
await intro(p1, '11223344', {age: 29, gender: 'male'});
await answer(p1, 0);
await page1Interrupt(p1);
async function page1Interrupt(page) { await page.waitForFunction(() => lineSimilarityState().ready && lineSimilarityState().completed === 1); await hideAndShow(page); }
await answer(p1, 1, {method: 'pointer'});
await answer(p1, 2);
await answer(p1, 3, {method: 'pointer'});
await p1.waitForFunction(() => lineSimilarityState().completed === 4);
await p1.waitForTimeout(200);
const before = posts.length;
await p1.goto(`${base}1/`); // leaving mid-study: interim 'abandoned' rows go out on pagehide
await waitPosts(before + 2);
// ... and starts again from the first page (pilot setting: every visit is a new session).
await intro(p1, '11223344', {age: 29, gender: 'male'});
const n1 = await total(p1);
for (let i = 0; i < n1; i++) await answer(p1, i, {method: i % 5 === 2 ? 'pointer' : 'keyboard'});
await finish(p1, 'study 1 / 11223344');

// Study 1, participant 55667788: completes in one go, mostly with the mouse.
const p2 = await newPage(1);
await intro(p2, '55667788', {age: 41, gender: 'female'});
for (let i = 0; i < n1; i++) await answer(p2, i, {method: i % 4 === 3 ? 'keyboard' : 'pointer'});
await finish(p2, 'study 1 / 55667788');

// Study 2, both participants.
const p3 = await newPage(2);
await intro(p3, '11223344', {});
const n2 = await total(p3);
for (let i = 0; i < n2; i++) await answer(p3, i);
await finish(p3, 'study 2 / 11223344');
const p4 = await newPage(2);
await intro(p4, '55667788', {});
for (let i = 0; i < n2; i++) await answer(p4, i, {method: i % 3 === 0 ? 'pointer' : 'keyboard'});
await finish(p4, 'study 2 / 55667788');

await browser.close();
server.close();
if (errors.length) throw new Error('browser errors: ' + errors.join('\n'));
fs.mkdirSync(OUT, {recursive: true});
fs.writeFileSync(path.join(OUT, 'posts.json'), JSON.stringify(posts, null, 1));
const tables = [...new Set(posts.map(p => p.table))];
for (const t of tables) fs.writeFileSync(path.join(OUT, t + '.json'), JSON.stringify(posts.filter(p => p.table === t).flatMap(p => p.rows), null, 1));
console.log('Wrote ' + posts.length + ' posts to ' + OUT + ': ' + tables.map(t => t + ' (' + posts.filter(p => p.table === t).reduce((n, p) => n + p.rows.length, 0) + ' rows)').join(', '));

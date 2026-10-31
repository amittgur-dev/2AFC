// Real-browser test of the colleagues' preview module (site/preview): the
// list of variations, a full run of one variation with nothing recorded, the
// return to the list, and the shared card match that skips calibration on
// the next variation run. Run: PLAYWRIGHT_MODULE=... node tests/preview-test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const {variations} = await import(path.join(ROOT, 'site/preview/variations.js'));
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml'};
// Serve the deployed form of study 2, which carries the preview at /preview/.
const built = path.join(ROOT, 'dist-preview-test');
const {execFileSync} = await import('node:child_process');
execFileSync('node', [path.join(ROOT, 'tools/build_site.mjs'), '2', built]);
const posts = [];
const server = http.createServer((req, res) => {
  if (req.method === 'POST') { posts.push(req.url); res.writeHead(200); return res.end('0'); }
  let file = path.join(built, req.url.split('?')[0]);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store'});
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/preview/`;
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 1300, height: 820}});
await context.addInitScript(() => { Object.defineProperty(screen, 'width', {get: () => 1920}); Object.defineProperty(screen, 'height', {get: () => 1080}); });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const state = () => page.evaluate(() => lineSimilarityState());

// The list.
await page.goto(base);
assert.ok(await page.isVisible('#menu') && await page.isHidden('#information'));
const links = await page.$$eval('#variation-list a', as => as.map(a => [a.textContent, a.getAttribute('href')]));
assert.deepEqual(links.map(l => l[0]), variations.map(v => v.name));
assert.ok(links.every(l => /^\?v=[a-z0-9-]+&reset=1$/.test(l[1])));
assert.equal(variations.length, 3);

// First variation: calibration, instructions, every screen, finish, back to the list.
const v = variations.find(x => x.id === 'random');
await page.click(`#variation-list a:has-text("${v.name}")`);
await page.waitForFunction(() => typeof lineSimilarityState === 'function');
assert.equal((await state()).mode, 'information');
assert.ok(await page.isHidden('#menu') && await page.isHidden('#code-row'));
assert.equal(await page.textContent('#study-title'), v.name);
await page.click('#begin');
assert.equal((await state()).mode, 'calibration', 'no consent or demographics, straight to calibration');
await page.evaluate(w => { const r = document.getElementById('card-size'); r.value = w; r.dispatchEvent(new Event('input')); }, 85.6 * 5.11);
await page.click('#confirm-card');
assert.equal((await state()).mode, 'instructions');
await page.waitForSelector('#start:not([disabled])'); await page.click('#start');
await page.waitForFunction(() => lineSimilarityState().ready);
const s = await state();
assert.equal(s.total, 24);
assert.ok(['sub', 'whole', 'shape'].includes(s.presentation.left_condition));
const objs = await page.$$eval('#stage .object', els => els.map(e => ({w: e.getBoundingClientRect().width, src: e.querySelector('img').currentSrc})));
assert.equal(objs.length, 3);
for (const o of objs) { assert.ok(Math.abs(o.w - 42.64 * s.pixelsPerMm) < .2, 'image at 42.64 mm: ' + o.w); assert.ok(/\/preview\/variations\/squares-diamonds\/assets\/S00\d\.svg$/.test(o.src), o.src); }
for (let i = 0; i < 24; i++) { await page.waitForFunction(n => lineSimilarityState().ready && lineSimilarityState().completed === n, i); await page.keyboard.press(i % 2 ? 'ArrowRight' : 'ArrowLeft'); }
await page.waitForFunction(() => lineSimilarityState().mode === 'complete');
const trialIds = (await state()).trialIds ?? null;
assert.equal(posts.length, 0, 'nothing is sent anywhere');
await page.waitForSelector('#redirect-link:not([hidden])');
assert.equal(await page.textContent('#redirect-link'), 'Back to the list of variations');
await page.click('#redirect-link');
await page.waitForSelector('#menu:not([hidden])');
assert.ok(await page.isVisible('#variation-list'));

// Second run on the same screen: the card match is reused, so calibration is skipped.
await page.click(`#variation-list a:has-text("${v.name}")`);
await page.waitForFunction(() => typeof lineSimilarityState === 'function');
await page.click('#begin');
await page.waitForFunction(() => lineSimilarityState().mode === 'instructions');
assert.ok(Math.abs((await state()).pixelsPerMm - 5.11) < .01, 'shared calibration reused: ' + (await state()).pixelsPerMm);
assert.ok((await page.evaluate(() => JSON.parse(localStorage.getItem('line-similarity:preview:session:v1')).events)).some(e => e.type === 'shared-calibration'));
// A zoom change invalidates it.
const zoomed = await context.newPage();
await zoomed.addInitScript(() => { Object.defineProperty(window, 'devicePixelRatio', {get: () => 1.5}); });
await zoomed.goto(base + '?v=' + v.id + '&reset=1');
await zoomed.click('#begin');
assert.equal(await zoomed.evaluate(() => lineSimilarityState().mode), 'calibration', 'a different zoom asks for the card again');

// The studies themselves do not share calibration.
const study = await context.newPage();
await study.goto(`http://127.0.0.1:${server.address().port}/?reset=1&pid=PREVIEWTEST`);
await study.click('#begin');
assert.equal(await study.evaluate(() => lineSimilarityState().mode), 'calibration', 'the rotation study still calibrates');

await browser.close(); server.close();
fs.rmSync(built, {recursive: true, force: true});
assert.deepEqual(errors, []);
console.log('Passed preview flow: list of variations, run with 42.64 mm images and 24 screens, nothing sent, back to the list, shared calibration reused and invalidated by zoom, studies unaffected.');

// Real-browser flow test with Playwright (Chromium). It serves
// site/ over HTTP, calibrates at a known scale, answers every
// question by keyboard and mouse, checks timing and persistence, reloads
// mid-session to test recovery, shrinks the window to test the fit block,
// and inspects the completion/submission path. It cannot check physical size.
// Run: npm run test:browser
//   PLAYWRIGHT_MODULE=/path/to/playwright  (if not resolvable from here)
//   SCREENSHOTS=dir                        (optional: save trial screenshots)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../site');
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml'};
const posts = [];
const server = http.createServer((req, res) => {
  if (req.method === 'POST') { let body = ''; req.on('data', c => body += c); req.on('end', () => { posts.push({url: req.url, body}); res.writeHead(200); res.end('ok'); }); return; }
  const file = path.join(APP, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 1300, height: 820}});
// Headless Chromium reports the viewport as the screen; pin it so a window
// resize is a resize, not a screen change.
await context.addInitScript(() => { Object.defineProperty(screen, 'width', {get: () => 1920}); Object.defineProperty(screen, 'height', {get: () => 1080}); });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const state = () => page.evaluate(() => lineSimilarityState());
const target = 5.11; let ppmm = target; // the card slider snaps to 0.25 px, so the realised scale is read back after calibration
const shots = process.env.SCREENSHOTS; if (shots) fs.mkdirSync(shots, {recursive: true});

await page.goto(base + '?pid=TEST-001&STUDY_ID=S1&reset=1');
assert.equal((await state()).mode, 'information');
assert.ok(await page.isHidden('#consent-row'), 'pilot has no consent checkbox');
await page.click('#begin');
assert.equal((await state()).mode, 'calibration');
// Calibrate at 5.11 px/mm by setting the card width directly.
await page.evaluate(w => { const r = document.getElementById('card-size'); r.value = w; r.dispatchEvent(new Event('input')); }, 85.6 * target);
await page.click('#confirm-card');
assert.equal((await state()).mode, 'verification');
ppmm = (await state()).pixelsPerMm;
assert.ok(Math.abs(ppmm - target) < .01, 'calibration close to target: ' + ppmm);
const mm = await page.$eval('#one-mm', e => e.getBoundingClientRect());
assert.ok(Math.abs(mm.height - ppmm) < .05 && Math.abs(mm.width - 40 * ppmm) < .05, '1 mm × 40 mm reference line');
await page.click('#to-instructions');
assert.equal((await state()).mode, 'instructions');
await page.waitForSelector('#start:not([disabled])');
assert.equal(await page.textContent('#trial-count'), '19');
await page.click('#start');
await page.waitForFunction(() => lineSimilarityState().ready);
let s = await state();
assert.equal(s.mode, 'experiment'); assert.equal(s.total, 19); assert.equal(s.completed, 0);
// Rendered sizes equal physical mm × scale, for every object on the first screen.
const objects = await page.$$eval('#stage .object', els => els.map(e => ({w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height, wmm: +e.dataset.widthMm, hmm: +e.dataset.heightMm, label: e.querySelector('.label').textContent})));
assert.equal(objects.length, 3);
for (const o of objects) { assert.ok(Math.abs(o.w - o.wmm * ppmm) < .05 && Math.abs(o.h - o.hmm * ppmm) < .05, 'calibrated size for ' + o.label); }
assert.deepEqual(objects.map(o => o.label), ['A', 'B', 'C']);
const stage = await page.$eval('#stage', e => e.getBoundingClientRect());
assert.ok(Math.abs(stage.width - 220 * ppmm) < .05 && Math.abs(stage.height - 120 * ppmm) < .05);
if (shots) await page.screenshot({path: path.join(shots, 'trial-1.png')});
// A response before the next screen is ready must be ignored; a double press counts once.
await page.waitForTimeout(300);
await page.keyboard.press('ArrowLeft');
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(100);
assert.equal((await state()).completed, 1);
assert.equal((await state()).ready, false, 'blank inter-trial interval');
await page.waitForFunction(() => lineSimilarityState().ready && lineSimilarityState().completed === 1);
await page.keyboard.press('ArrowRight');
await page.waitForFunction(() => lineSimilarityState().ready && lineSimilarityState().completed === 2);
// Mouse response on C.
await page.click('#stage .object[aria-label="Choose C"]');
await page.waitForFunction(() => lineSimilarityState().ready && lineSimilarityState().completed === 3);
let saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), 'line-similarity:session:v1');
assert.equal(saved.participant_id, 'TEST-001'); assert.deepEqual(saved.url_parameters, {STUDY_ID: 'S1'});
assert.equal(saved.trials.length, 3);
assert.deepEqual(saved.trials.map(t => t.chosen_side), ['left', 'right', 'right']);
assert.deepEqual(saved.trials.map(t => t.response_method), ['keyboard', 'keyboard', 'pointer']);
for (const t of saved.trials) {
  assert.ok(t.reaction_time_ms > 0 && t.reaction_time_ms < 5000, 'reaction time recorded: ' + t.reaction_time_ms);
  assert.equal(t.chosen_asset_id, t.chosen_side === 'left' ? t.left_asset_id : t.right_asset_id);
  assert.equal(t.chosen_condition, t.chosen_side === 'left' ? t.left_condition : t.right_condition);
  assert.equal(t.pixels_per_mm, saved.calibration.pixels_per_mm);
}
assert.ok(saved.trials[0].reaction_time_ms >= 300, 'timing starts at stimulus onset, not at the key press: ' + saved.trials[0].reaction_time_ms);
const sequenceBefore = saved.sequence.map(p => p.trial_id + p.side_assignment).join();

// Reload mid-session: the session resumes after recalibration with the same sequence.
await page.goto(base);
assert.equal((await state()).mode, 'information');
assert.ok(!(await page.isHidden('#resume-notice')));
assert.ok((await page.textContent('#resume-notice')).includes('3 of 19'));
await page.click('#begin');
await page.evaluate(w => { const r = document.getElementById('card-size'); r.value = w; r.dispatchEvent(new Event('input')); }, 85.6 * target);
await page.click('#confirm-card');
await page.click('#to-instructions');
await page.waitForFunction(() => lineSimilarityState().mode === 'experiment' && lineSimilarityState().ready);
s = await state(); assert.equal(s.completed, 3); assert.equal(s.session_id, saved.session_id);
assert.equal(s.presentation.presentation_index, 3);
saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), 'line-similarity:session:v1');
assert.equal(saved.sequence.map(p => p.trial_id + p.side_assignment).join(), sequenceBefore, 'assigned order survives reload');
assert.equal(saved.calibration_history.length, 2);

// Too little space: responses are blocked and the trial restarts when space returns.
await page.setViewportSize({width: 900, height: 820});
await page.waitForSelector('#fit-overlay:not([hidden])');
assert.ok((await page.textContent('#fit-message')).includes('1157 × 704'));
await page.keyboard.press('ArrowLeft');
assert.equal((await state()).completed, 3, 'blocked screen accepts no response');
await page.setViewportSize({width: 1300, height: 820});
await page.waitForFunction(() => document.getElementById('fit-overlay').hidden);
await page.waitForFunction(() => lineSimilarityState().ready);
assert.equal((await state()).attempts, 2);
if (shots) await page.screenshot({path: path.join(shots, 'trial-4-after-block.png')});

// A zoom change (device pixel ratio) invalidates the calibration mid-trial.
await page.evaluate(() => { Object.defineProperty(window, 'devicePixelRatio', {get: () => 1.25, configurable: true}); window.dispatchEvent(new Event('resize')); });
assert.equal((await state()).mode, 'calibration');
assert.ok((await page.textContent('#calibration-notice')).includes('zoom changed'));
await page.evaluate(w => { const r = document.getElementById('card-size'); r.value = w; r.dispatchEvent(new Event('input')); }, 85.6 * target);
await page.click('#confirm-card'); await page.click('#to-instructions');
await page.waitForFunction(() => lineSimilarityState().mode === 'experiment' && lineSimilarityState().ready);
assert.equal((await state()).completed, 3); assert.equal((await state()).attempts, 3);

// Answer the remaining questions, screenshotting a few.
for (let i = 3; i < 19; i++) {
  await page.waitForFunction(n => lineSimilarityState().ready && lineSimilarityState().completed === n, i);
  if (shots && (i === 5 || i === 10 || i === 15)) await page.screenshot({path: path.join(shots, `trial-${i + 1}.png`)});
  await page.keyboard.press(i % 2 ? 'ArrowRight' : 'ArrowLeft');
}
await page.waitForFunction(() => lineSimilarityState().mode === 'complete');
await page.waitForFunction(() => /saved|could not/.test(document.getElementById('submit-status').textContent));
saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), 'line-similarity:session:v1');
assert.equal(saved.completion_status, 'complete'); assert.equal(saved.trials.length, 19);
assert.deepEqual(saved.trials.map(t => t.trial_id).sort(), saved.sequence.map(p => p.trial_id).sort());
assert.deepEqual(saved.trials[3].interruptions.map(i => i.type), ['insufficient-space', 'screen-change']);
assert.equal(saved.trials[3].attempts, 3);
assert.equal(saved.calibration_history.length, 3);
assert.ok(saved.events.some(e => e.type === 'resumed') && saved.events.some(e => e.type === 'consented'));
// Two Netlify-style posts: the partial record sent when the page was left
// mid-session, then the complete record.
assert.equal(posts.length, 2);
const partial = new URLSearchParams(posts[0].body);
assert.equal(partial.get('completion_status'), 'abandoned'); assert.equal(partial.get('trials_completed'), '3');
assert.equal(JSON.parse(partial.get('payload')).session_id, saved.session_id);
const form = new URLSearchParams(posts[1].body);
assert.equal(form.get('form-name'), 'line-similarity-responses');
assert.equal(form.get('completion_status'), 'complete'); assert.equal(form.get('trials_completed'), '19');
const payload = JSON.parse(form.get('payload'));
assert.equal(payload.session_id, saved.session_id); assert.equal(payload.trials.length, 19);
assert.ok((await page.textContent('#completion-code')).includes(saved.session_id));
assert.ok(await page.isVisible('#download-csv'));
if (shots) await page.screenshot({path: path.join(shots, 'complete.png')});
// Revisiting a completed session does not restart it.
await page.goto(base);
await page.waitForFunction(() => lineSimilarityState().mode === 'complete');
assert.ok((await page.textContent('#submit-status')).includes('already completed'));
assert.equal(posts.length, 2);

// Failed submission path: a server that rejects the post leaves a retry and download.
const page2 = await context.newPage();
page2.on('pageerror', e => errors.push(String(e)));
await page2.route('**/*', route => route.request().method() === 'POST' ? route.fulfill({status: 500, body: 'no'}) : route.continue());
await page2.goto(base + '?reset=1');
await page2.click('#begin');
await page2.evaluate(w => { const r = document.getElementById('card-size'); r.value = w; r.dispatchEvent(new Event('input')); }, 85.6 * target);
await page2.click('#confirm-card'); await page2.click('#to-instructions');
await page2.waitForSelector('#start:not([disabled])'); await page2.click('#start');
for (let i = 0; i < 19; i++) { await page2.waitForFunction(n => lineSimilarityState().ready && lineSimilarityState().completed === n, i); await page2.keyboard.press('b'); }
await page2.waitForFunction(() => /could not be sent/.test(document.getElementById('submit-status').textContent));
assert.ok(await page2.isVisible('#retry-submit') && await page2.isVisible('#download-json'));
const [downloadEvent] = await Promise.all([page2.waitForEvent('download'), page2.click('#download-csv')]);
const csvText = fs.readFileSync(await downloadEvent.path(), 'utf8');
assert.equal(csvText.trim().split('\n').length, 20);
assert.ok(csvText.startsWith('session_id,participant_id'));
const saved2 = await page2.evaluate(k => JSON.parse(localStorage.getItem(k)), 'line-similarity:session:v1');
assert.ok(saved2.trials.every(t => t.chosen_side === 'left' && t.response_method === 'keyboard'));
assert.ok(saved2.submissions.some(s => s.ok === false));

assert.deepEqual(errors, [], 'no page errors');
await browser.close(); server.close();
console.log('Passed real-browser flow: consent, calibration at 5.11 px/mm, 1 mm line, calibrated object sizes, keyboard and mouse responses, double-response guard, onset-based timing, reload recovery with identical order, fit block and re-presentation, completion post, repeat-visit guard, failed-submission fallback and CSV download.');

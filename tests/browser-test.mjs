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
const posts = [];   // Netlify-style form posts
const sbPosts = []; // Supabase-style inserts: {table, query, apikey, auth, prefer, rows}
// The pilot config sends nothing; the main run is served a config that
// records to a fake Supabase on this server, with the download buttons and
// completion code on; the failure run uses the Netlify Forms path. (Served by
// the test server rather than Playwright routing, which would also intercept
// and drop the leaving-page sends.)
const configSource = fs.readFileSync(path.join(APP, '1/config.js'), 'utf8');
const configSource2 = fs.readFileSync(path.join(APP, '2/config.js'), 'utf8');
let configVariant2 = null; // study 2: null (deployed pilot config) or 'supabase'
const configFor2 = () => { const c = configSource2.replace("mode: 'local'", "mode: 'supabase'").replace("supabase: {url: '', anonKey: ''", `supabase: {url: '${base}supabase/', anonKey: 'test-anon-key'`); assert.notEqual(c, configSource2); return c; };
let configVariant = 'supabase'; // 'supabase' | 'netlify' | null (deployed pilot config)
const configFor = variant => {
  let c = configSource.replace('allowDownload: false', 'allowDownload: true').replace('showCode: false', 'showCode: true').replace('rememberSession: false', 'rememberSession: true');
  if (variant === 'supabase') c = c.replace("mode: 'local'", "mode: 'supabase'").replace("supabase: {url: '', anonKey: ''", `supabase: {url: '${base}supabase/', anonKey: 'test-anon-key'`);
  else c = c.replace("mode: 'local'", "mode: 'netlify-forms'");
  assert.notEqual(c, configSource);
  return c;
};
const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/supabase/rest/v1/rpc/record_rows') { const b = JSON.parse(body); sbPosts.push({table: b.p_table, rows: b.p_rows, apikey: req.headers.apikey, auth: req.headers.authorization, prefer: req.headers.prefer}); res.writeHead(200, {'Content-Type': 'application/json'}); return res.end(String(b.p_rows.length)); }
      if (u.pathname.startsWith('/supabase/')) { res.writeHead(404); return res.end('unexpected supabase path ' + u.pathname); }
      posts.push({url: req.url, body}); res.writeHead(200); res.end('ok');
    }); return;
  }
  if (req.url.split('?')[0] === '/1/config.js' && configVariant) { res.writeHead(200, {'Content-Type': 'text/javascript', 'Cache-Control': 'no-store'}); return res.end(configFor(configVariant)); }
  if (req.url.split('?')[0] === '/2/config.js' && configVariant2) { res.writeHead(200, {'Content-Type': 'text/javascript', 'Cache-Control': 'no-store'}); return res.end(configFor2()); }
  let file = path.join(APP, req.url.split('?')[0]);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store'});
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;
const exp1 = base + '1/'; // study 1 lives at /1/, study 2 at /2/
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

await page.goto(exp1 + '?pid=TEST-001&STUDY_ID=S1&reset=1');
assert.equal((await state()).mode, 'information');
assert.ok(await page.isHidden('#consent-row'), 'pilot has no consent checkbox');
assert.ok(await page.isHidden('#code-row'), 'a link with a participant id asks for no code');
await page.click('#begin');
assert.equal((await state()).mode, 'calibration');
// Calibrate at 5.11 px/mm by setting the card width directly.
await page.evaluate(w => { const r = document.getElementById('card-size'); r.value = w; r.dispatchEvent(new Event('input')); }, 85.6 * target);
// Stimuli that cannot be downloaded leave a message and a retry, not a dead end.
await page.route('**/assets/*.svg', route => route.abort());
await page.click('#confirm-card');
assert.equal((await state()).mode, 'instructions');
ppmm = (await state()).pixelsPerMm;
assert.ok(Math.abs(ppmm - target) < .01, 'calibration close to target: ' + ppmm);
await page.waitForFunction(() => /could not be loaded/.test(document.getElementById('instructions-notice').textContent));
assert.ok(!(await page.isDisabled('#start')), 'Start is usable again after a failed preload');
await page.unroute('**/assets/*.svg');
await page.click('#start');
await page.waitForFunction(() => lineSimilarityState().ready || document.getElementById('instructions-notice').textContent === '');
if ((await state()).mode === 'instructions') await page.click('#start');
await page.waitForFunction(() => lineSimilarityState().mode === 'experiment');
// Back to the instructions flow check from a clean session.
await page.goto(exp1 + '?pid=TEST-001&STUDY_ID=S1&reset=1');
await page.click('#begin');
await page.evaluate(w => { const r = document.getElementById('card-size'); r.value = w; r.dispatchEvent(new Event('input')); }, 85.6 * target);
await page.click('#confirm-card');
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
// Hiding the tab interrupts the trial; showing it again re-presents it and responses work.
await page.evaluate(() => { Object.defineProperty(document, 'hidden', {get: () => true, configurable: true}); Object.defineProperty(document, 'visibilityState', {get: () => 'hidden', configurable: true}); document.dispatchEvent(new Event('visibilitychange')); });
s = await state(); assert.equal(s.ready, false); assert.deepEqual(s.interruptions, ['hidden']);
assert.ok(await page.$eval('#stage', e => e.classList.contains('blank')), 'stimulus hidden while interrupted');
await page.evaluate(() => { Object.defineProperty(document, 'hidden', {get: () => false, configurable: true}); Object.defineProperty(document, 'visibilityState', {get: () => 'visible', configurable: true}); document.dispatchEvent(new Event('visibilitychange')); });
await page.waitForFunction(() => lineSimilarityState().ready);
assert.equal((await state()).attempts, 2);
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
assert.equal(saved.trials[0].attempts, 2); assert.deepEqual(saved.trials[0].interruptions.map(i => i.type), ['hidden']);
assert.equal(saved.storage_available, true);
for (const t of saved.trials) {
  assert.ok(t.reaction_time_ms > 0 && t.reaction_time_ms < 5000, 'reaction time recorded: ' + t.reaction_time_ms);
  assert.equal(t.chosen_asset_id, t.chosen_side === 'left' ? t.left_asset_id : t.right_asset_id);
  assert.equal(t.chosen_condition, t.chosen_side === 'left' ? t.left_condition : t.right_condition);
  assert.equal(t.pixels_per_mm, saved.calibration.pixels_per_mm);
}
assert.ok(saved.trials[0].reaction_time_ms >= 300, 'timing starts at stimulus onset, not at the key press: ' + saved.trials[0].reaction_time_ms);
const sequenceBefore = saved.sequence.map(p => p.trial_id + p.side_assignment).join();

// Reload mid-session: the session resumes after recalibration with the same sequence.
await page.goto(exp1);
assert.equal((await state()).mode, 'information');
assert.ok(!(await page.isHidden('#resume-notice')));
assert.ok((await page.textContent('#resume-notice')).includes('3 of 19'));
await page.click('#begin');
await page.evaluate(w => { const r = document.getElementById('card-size'); r.value = w; r.dispatchEvent(new Event('input')); }, 85.6 * target);
await page.click('#confirm-card');
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
await page.click('#confirm-card');
await page.waitForFunction(() => lineSimilarityState().mode === 'experiment' && lineSimilarityState().ready);
assert.equal((await state()).completed, 3); assert.equal((await state()).attempts, 3);

// A stimulus that fails to load keeps the screen blank, is recorded, and the trial proceeds once it loads.
await page.waitForFunction(() => lineSimilarityState().ready && lineSimilarityState().completed === 3);
await page.route('**/assets/*.svg', route => route.abort());
await page.keyboard.press('ArrowLeft');
await page.waitForFunction(() => lineSimilarityState().completed === 4 && lineSimilarityState().interruptions.includes('image-error'));
assert.equal((await state()).ready, false);
assert.ok((await page.textContent('#trial-notice')).includes('Loading'));
assert.ok(await page.$eval('#stage', e => e.classList.contains('blank')));
await page.unroute('**/assets/*.svg');
await page.waitForFunction(() => lineSimilarityState().ready && lineSimilarityState().completed === 4);
assert.ok((await state()).attempts >= 2);
assert.equal(await page.textContent('#trial-notice'), '');
// Answer the remaining questions, screenshotting a few.
for (let i = 4; i < 19; i++) {
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
assert.ok(saved.trials[4].interruptions.some(i => i.type === 'image-error'));
assert.equal(saved.calibration_history.length, 3);
assert.ok(saved.ended_at && saved.environment_at_end && saved.environment_at_end.max_touch_points !== undefined);
assert.ok(saved.events.some(e => e.type === 'resumed') && saved.events.some(e => e.type === 'consented'));
// Supabase: keepalive inserts when the page was left mid-session (an
// 'abandoned' session row and 3 essential trial rows), then the completion
// inserts (a 'complete' session row and all 19 full trial rows).
const sb = table => sbPosts.filter(p => p.table === table);
assert.equal(posts.length, 0, 'nothing went to Netlify');
assert.equal(sbPosts.length, 4, JSON.stringify(sbPosts.map(p => [p.table, p.rows.length])) + ' submissions: ' + JSON.stringify(saved.submissions));
for (const p of sbPosts) { assert.equal(p.apikey, 'test-anon-key'); assert.equal(p.auth, 'Bearer test-anon-key'); assert.ok(Array.isArray(p.rows) && p.rows.length > 0); }
const [abandonedRow, completeRow] = sb('lines_with_edges_sessions').map(p => p.rows[0]);
assert.equal(abandonedRow.submitted_status, 'abandoned'); assert.equal(abandonedRow.trials_completed, 3); assert.equal(abandonedRow.attempt, 1); assert.ok(abandonedRow.record.compact);
assert.equal(completeRow.submitted_status, 'complete'); assert.equal(completeRow.completion_status, 'complete'); assert.equal(completeRow.trials_completed, 19); assert.equal(completeRow.attempt, 2);
assert.equal(completeRow.experiment_id, 'exp1-lines-with-edges'); assert.equal(completeRow.experiment_name, 'Lines with edges'); assert.equal(completeRow.participant_id, 'TEST-001');
assert.equal(completeRow.session_id, saved.session_id); assert.equal(completeRow.pixels_per_mm, saved.calibration.pixels_per_mm); assert.equal(completeRow.record.trials.length, 19); assert.ok(completeRow.design.seed !== undefined);
const [partialTrials, fullTrials] = sb('lines_with_edges_trials').map(p => p.rows);
assert.equal(partialTrials.length, 3); assert.ok(!('viewport' in partialTrials[0]) && partialTrials[0].reaction_time_ms > 0 && partialTrials[0].trial_id);
assert.equal(fullTrials.length, 19);
assert.deepEqual(fullTrials.map(r => r.presentation_index), [...Array(19).keys()]);
assert.ok(fullTrials.every(r => r.session_id === saved.session_id && r.experiment_id === 'exp1-lines-with-edges' && r.reaction_time_ms > 0 && r.viewport && r.chosen_condition && r.left_condition !== r.right_condition && r.stimulus_onset_at && r.response_at));
assert.deepEqual(saved.submissions.map(s => s.status_sent), ['abandoned', 'complete']);
assert.equal(saved.submissions[0].status, 'keepalive-compact'); assert.equal(saved.submissions[0].ok, true); assert.equal(saved.submissions[0].unconfirmed, true);
assert.equal(saved.submissions[1].status, 'supabase'); assert.equal(saved.submissions[1].ok, true); assert.ok(saved.submissions[1].bytes > 10000);
assert.ok((await page.textContent('#completion-code')).includes(saved.session_id));
assert.ok(await page.isVisible('#download-csv'));
if (shots) await page.screenshot({path: path.join(shots, 'complete.png')});
// A zoom change on the completion page neither recalibrates nor resubmits.
await page.evaluate(() => { Object.defineProperty(window, 'devicePixelRatio', {get: () => 1.5, configurable: true}); window.dispatchEvent(new Event('resize')); });
assert.equal((await state()).mode, 'complete');
await page.waitForTimeout(200);
assert.equal(sbPosts.length, 4);
// Revisiting a completed session does not restart it.
await page.goto(exp1);
await page.waitForFunction(() => lineSimilarityState().mode === 'complete');
assert.ok((await page.textContent('#submit-status')).includes('already completed'));
assert.equal(sbPosts.length, 4, 'a confirmed send is not repeated on revisit');
// A different participant id in the URL starts a fresh session instead of showing the first participant's code.
await page.goto(exp1 + '?pid=TEST-002');
assert.equal((await state()).mode, 'information');
assert.equal((await state()).participant_id, 'TEST-002'); assert.equal((await state()).completed, 0);
assert.ok(await page.isHidden('#resume-notice'));
// Safari-style zoom (viewport width changes, window width does not) forces recalibration.
await page.click('#begin');
await page.evaluate(w => { const r = document.getElementById('card-size'); r.value = w; r.dispatchEvent(new Event('input')); }, 85.6 * target);
await page.click('#confirm-card');
const outer = await page.evaluate(() => outerWidth);
if (outer > 0) {
  await page.evaluate(() => { Object.defineProperty(window, 'innerWidth', {get: () => 1180, configurable: true}); window.dispatchEvent(new Event('resize')); });
  assert.equal((await state()).mode, 'calibration');
  assert.ok((await page.textContent('#calibration-notice')).includes('zoom changed'));
} else console.log('note: outerWidth is 0 in this headless browser; Safari zoom check skipped');

// Failed submission path (Netlify Forms mode): a server that rejects the post leaves a retry and download.
configVariant = 'netlify';
const page2 = await context.newPage();
page2.on('pageerror', e => errors.push(String(e)));
await page2.route('**/*', route => route.request().method() === 'POST' ? route.fulfill({status: 500, body: 'no'}) : route.continue());
await page2.goto(exp1 + '?reset=1&pid=TEST-FAIL');
await page2.click('#begin');
await page2.evaluate(w => { const r = document.getElementById('card-size'); r.value = w; r.dispatchEvent(new Event('input')); }, 85.6 * target);
await page2.click('#confirm-card');
await page2.waitForSelector('#start:not([disabled])'); await page2.click('#start');
for (let i = 0; i < 19; i++) { await page2.waitForFunction(n => lineSimilarityState().ready && lineSimilarityState().completed === n, i); await page2.keyboard.press('b'); }
await page2.waitForFunction(() => /could not be sent/.test(document.getElementById('submit-status').textContent));
assert.ok(await page2.isVisible('#retry-submit') && await page2.isVisible('#download-json'));
const [downloadEvent] = await Promise.all([page2.waitForEvent('download'), page2.click('#download-csv')]);
const csvText = fs.readFileSync(await downloadEvent.path(), 'utf8');
assert.equal(csvText.trim().split('\n').length, 20);
assert.ok(csvText.startsWith('experiment_id,session_id,participant_id'));
const saved2 = await page2.evaluate(k => JSON.parse(localStorage.getItem(k)), 'line-similarity:session:v1');
assert.ok(saved2.trials.every(t => t.chosen_side === 'left' && t.response_method === 'keyboard'));
assert.ok(saved2.submissions.some(s => s.ok === false));

// The deployed pilot config: nothing is sent, and the final page says only thank you.
configVariant = null;
const pilot = await browser.newContext({viewport: {width: 1300, height: 820}});
const page3 = await pilot.newPage();
page3.on('pageerror', e => errors.push(String(e)));
const before = posts.length + sbPosts.length;
await page3.goto(exp1 + '?reset=1');
assert.equal(await page3.textContent('#study-title'), 'Similarity judgment');
assert.ok((await page3.textContent('#information')).includes('reference object (A)'));
// No participant id in the link: a code is required before continuing.
assert.ok(await page3.isVisible('#code-row'));
assert.ok(await page3.isDisabled('#begin'));
assert.ok((await page3.textContent('#code-row')).includes('make up an 8-digit number'));
await page3.fill('#participant-code', '1234567');
assert.ok(await page3.isDisabled('#begin'), 'seven digits is not a valid code');
await page3.fill('#participant-code', 'K7P3QM');
assert.ok(await page3.isDisabled('#begin'), 'letters are not a valid code');
await page3.fill('#participant-code', ' 12345678 ');
assert.ok(!(await page3.isDisabled('#begin')));
await page3.click('#begin');
assert.equal((await page3.evaluate(() => lineSimilarityState())).participant_id, '12345678', 'typed code is trimmed');
await page3.evaluate(w => { const r = document.getElementById('card-size'); r.value = w; r.dispatchEvent(new Event('input')); }, 85.6 * target);
await page3.click('#confirm-card');
assert.equal((await page3.evaluate(() => lineSimilarityState())).mode, 'instructions');
await page3.waitForSelector('#start:not([disabled])'); await page3.click('#start');
for (let i = 0; i < 19; i++) { await page3.waitForFunction(n => lineSimilarityState().ready && lineSimilarityState().completed === n, i); await page3.keyboard.press('ArrowRight'); }
await page3.waitForFunction(() => lineSimilarityState().mode === 'complete');
assert.equal((await page3.evaluate(() => document.getElementById('complete').innerText)).replace(/\s+/g, ' ').trim(), 'FINISHED Thank you.');
assert.ok(await page3.isHidden('#completion-code') && await page3.isHidden('#download-csv'));
const pilotSaved = await page3.evaluate(k => JSON.parse(localStorage.getItem(k)), 'line-similarity:session:v1');
assert.equal(pilotSaved.experiment_id, 'exp1-lines-with-edges'); assert.equal(pilotSaved.trials.length, 19);
assert.equal(pilotSaved.participant_id, '12345678'); assert.equal(pilotSaved.participant_id_source, 'typed');
await page3.goto(exp1);
assert.equal(posts.length + sbPosts.length, before, 'pilot sends nothing');
assert.equal((await page3.evaluate(() => lineSimilarityState())).mode, 'information', 'a pilot visit always starts afresh');
assert.notEqual((await page3.evaluate(() => lineSimilarityState())).session_id, pilotSaved.session_id);

// Experiment 2: 48 questions, 41.33 mm images, and registration into its own tables.
configVariant2 = 'supabase';
const sbBefore = sbPosts.length;
const page4 = await pilot.newPage();
page4.on('pageerror', e => errors.push(String(e)));
await page4.goto(base + '2/?reset=1&pid=K7P3QM');
assert.ok(await page4.isHidden('#code-row'));
await page4.click('#begin');
await page4.evaluate(w => { const r = document.getElementById('card-size'); r.value = w; r.dispatchEvent(new Event('input')); }, 85.6 * target);
await page4.click('#confirm-card');
await page4.waitForSelector('#start:not([disabled])'); await page4.click('#start');
await page4.waitForFunction(() => lineSimilarityState().ready);
const s4 = await page4.evaluate(() => lineSimilarityState());
assert.equal(s4.total, 48); assert.ok(['sub', 'whole', 'shape'].includes(s4.presentation.left_condition));
const objs4 = await page4.$$eval('#stage .object', els => els.map(e => ({w: e.getBoundingClientRect().width, src: e.querySelector('img').currentSrc})));
assert.equal(objs4.length, 3);
for (const o of objs4) { assert.ok(Math.abs(o.w - 41.33 * ppmm) < .1); assert.ok(/\/2\/assets\/S\d{3}\.svg$/.test(o.src), o.src); }
if (shots) await page4.screenshot({path: path.join(shots, 'rotation-trial-1.png')});
for (let i = 0; i < 48; i++) { await page4.waitForFunction(n => lineSimilarityState().ready && lineSimilarityState().completed === n, i); await page4.keyboard.press(i % 3 ? 'ArrowLeft' : 'ArrowRight'); }
await page4.waitForFunction(() => lineSimilarityState().mode === 'complete');
await page4.waitForFunction(() => /saved|could not/.test(document.getElementById('submit-status').textContent));
const rotSaved = await page4.evaluate(() => JSON.parse(localStorage.getItem('line-similarity:rotation:session:v1')));
assert.equal(rotSaved.experiment_id, 'exp2-similarity-with-rotation'); assert.equal(rotSaved.experiment_name, 'Similarity with rotation'); assert.equal(rotSaved.trials.length, 48);
assert.equal(rotSaved.submissions.at(-1).status, 'supabase'); assert.equal(rotSaved.submissions.at(-1).ok, true);
const rotPosts = sbPosts.slice(sbBefore);
assert.deepEqual(rotPosts.map(p => p.table), ['similarity_with_rotation_sessions', 'similarity_with_rotation_trials'], 'study 2 writes to its own tables');
assert.equal(rotPosts[0].rows[0].submitted_status, 'complete'); assert.equal(rotPosts[0].rows[0].trials_completed, 48); assert.equal(rotPosts[0].rows[0].experiment_name, 'Similarity with rotation'); assert.equal(rotPosts[0].rows[0].participant_id, 'K7P3QM');
assert.equal(rotPosts[1].rows.length, 48);
assert.ok(rotPosts[1].rows.every(r => ['sub', 'whole', 'shape'].includes(r.chosen_condition) && r.family_name && r.reaction_time_ms > 0 && r.participant_id === 'K7P3QM' && r.experiment_id === 'exp2-similarity-with-rotation'));
assert.equal(new Set(rotPosts[1].rows.map(r => r.trial_id)).size, 48, 'every one of the 48 questions answered once');
configVariant2 = null;
assert.equal(rotSaved.participant_id, 'K7P3QM'); assert.equal(rotSaved.participant_id_source, 'url');
assert.ok(rotSaved.design.randomizeTrialOrder && rotSaved.design.sideAssignment === 'random' && rotSaved.design.controlPosition === 'random');

// The deployed form of a study: built into its own folder and served at the root.
const {execFileSync} = await import('node:child_process');
const os = await import('node:os');
const built = fs.mkdtempSync(path.join(os.tmpdir(), 'study2-'));
execFileSync('node', [path.join(APP, '../tools/build_site.mjs'), '2', built]);
const server2 = http.createServer((req, res) => {
  let file = path.join(built, req.url.split('?')[0]);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store'});
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server2.listen(0, r));
const page5 = await pilot.newPage();
page5.on('pageerror', e => errors.push(String(e)));
await page5.goto(`http://127.0.0.1:${server2.address().port}/?pid=BUILT1`);
assert.equal(await page5.textContent('#study-title'), 'Similarity judgment');
await page5.click('#begin');
await page5.evaluate(w => { const r = document.getElementById('card-size'); r.value = w; r.dispatchEvent(new Event('input')); }, 85.6 * target);
await page5.click('#confirm-card');
await page5.waitForSelector('#start:not([disabled])'); await page5.click('#start');
await page5.waitForFunction(() => lineSimilarityState().ready);
const s5 = await page5.evaluate(() => lineSimilarityState());
assert.equal(s5.total, 48); assert.equal(s5.participant_id, 'BUILT1');
const srcs5 = await page5.$$eval('#stage img', els => els.map(e => new URL(e.currentSrc).pathname));
assert.ok(srcs5.length === 3 && srcs5.every(p => /^\/assets\/S\d{3}\.svg$/.test(p)), 'a built study serves its assets at the root: ' + srcs5.join());
server2.close(); fs.rmSync(built, {recursive: true, force: true});
const built1 = fs.mkdtempSync(path.join(os.tmpdir(), 'study1-'));
execFileSync('node', [path.join(APP, '../tools/build_site.mjs'), '1', built1]);
const server1 = http.createServer((req, res) => {
  let file = path.join(built1, req.url.split('?')[0]);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store'});
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server1.listen(0, r));
const page6 = await pilot.newPage();
page6.on('pageerror', e => errors.push(String(e)));
await page6.goto(`http://127.0.0.1:${server1.address().port}/?pid=BUILT2`);
await page6.click('#begin');
await page6.evaluate(w => { const r = document.getElementById('card-size'); r.value = w; r.dispatchEvent(new Event('input')); }, 85.6 * target);
await page6.click('#confirm-card');
await page6.waitForSelector('#start:not([disabled])'); await page6.click('#start');
await page6.waitForFunction(() => lineSimilarityState().ready);
const s6 = await page6.evaluate(() => lineSimilarityState());
assert.equal(s6.total, 19); assert.equal(s6.participant_id, 'BUILT2');
const srcs6 = await page6.$$eval('#stage img', els => els.map(e => new URL(e.currentSrc).pathname));
assert.ok(srcs6.length === 3 && srcs6.every(p => /^\/assets\/\d-[A-Z]\.svg$/.test(p)), 'built study 1 serves its assets at the root: ' + srcs6.join());
server1.close(); fs.rmSync(built1, {recursive: true, force: true});

assert.deepEqual(errors.filter(e => !/Failed to load resource/.test(e)), [], 'no page errors beyond the deliberately aborted image loads');
await browser.close(); server.close();
console.log('Passed real-browser flow: Supabase inserts for both studies (keepalive on leaving, completion), both studies as built for deployment, calibration at 5.11 px/mm, calibrated object sizes, tab-hidden re-presentation, keyboard and mouse responses, double-response guard, onset-based timing, reload recovery with identical order, fit block, zoom invalidation, failed image load, completion post under the beacon cap, completion-page stability, repeat-visit guard, participant switch, Safari-style zoom, failed-submission fallback and CSV download.');

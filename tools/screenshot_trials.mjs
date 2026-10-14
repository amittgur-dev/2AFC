// Screenshots of a trial screen of each study (calibrated at 5.11 px/mm in a
// 1300 x 820 window), for the analysis handoff.
// Run: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tools/screenshot_trials.mjs [out-dir]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'site');
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'handoff/analysis/previews');
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml'};
const configs = {1: fs.readFileSync(path.join(APP, '1/config.js'), 'utf8'), 2: fs.readFileSync(path.join(APP, '2/config.js'), 'utf8')};
const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  const m = /^\/([12])\/config\.js$/.exec(p);
  if (m) { res.writeHead(200, {'Content-Type': 'text/javascript'}); return res.end(configs[m[1]].replace("mode: 'supabase'", "mode: 'local'")); }
  let file = path.join(APP, p);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 1300, height: 820}});
await context.addInitScript(() => { Object.defineProperty(screen, 'width', {get: () => 1920}); Object.defineProperty(screen, 'height', {get: () => 1080}); });
fs.mkdirSync(OUT, {recursive: true});
for (const study of [1, 2]) {
  const page = await context.newPage();
  await page.goto(`${base}${study}/?reset=1&pid=PREVIEW`);
  await page.screenshot({path: path.join(OUT, `study${study}-first-page.png`)});
  await page.click('#begin');
  if (await page.isVisible('#consent-page')) { await page.check('#consent-agree'); await page.click('#consent-continue'); }
  if (await page.isVisible('#demographics')) { await page.fill('#age', '30'); await page.check('input[name=gender][value=female]'); await page.click('#demographics-continue'); }
  await page.evaluate(w => { const r = document.getElementById('card-size'); r.value = w; r.dispatchEvent(new Event('input')); }, 85.6 * 5.11);
  await page.screenshot({path: path.join(OUT, `study${study}-calibration.png`)});
  await page.click('#confirm-card');
  await page.waitForSelector('#start:not([disabled])');
  if (study === 1) await page.screenshot({path: path.join(OUT, `study1-instructions.png`)});
  await page.click('#start');
  for (let i = 0; i < 3; i++) {
    await page.waitForFunction(n => lineSimilarityState().ready && lineSimilarityState().completed === n, i);
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => lineSimilarityState());
    await page.screenshot({path: path.join(OUT, `study${study}-trial-${i + 1}-${s.presentation.trial_id}-${s.presentation.left_condition}-vs-${s.presentation.right_condition}.png`)});
    await page.keyboard.press('ArrowLeft');
  }
  await page.close();
}
await browser.close(); server.close();
console.log('Screenshots in ' + OUT + ': ' + fs.readdirSync(OUT).join(', '));

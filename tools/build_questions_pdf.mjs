// Renders every 2AFC question at physical size to a PDF (A4 landscape),
// grouped by reference in the canonical order of data/trials.json.
// Run: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tools/build_questions_pdf.mjs [out.pdf]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {assets, trials} = await import(path.join(ROOT, 'site/stimuli.js'));
const {STAGE, LABEL} = await import(path.join(ROOT, 'site/geometry.js'));
const notation = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'data/stimuli-notation.csv'), 'utf8').trim().split('\n').slice(1).map(l => { const c = l.split(','); return [c[0], c[5]]; }));
const out = process.argv[2] ?? path.join(ROOT, 'data/questions-by-reference.pdf');
const svg = id => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(ROOT, 'site', assets[id].src)).toString('base64');
const obj = (id, label) => { const a = assets[id]; const [x, y] = STAGE.positions[label]; return `<div class="o" style="left:${x - a.widthMm / 2}mm;top:${y - a.heightMm / 2}mm;width:${a.widthMm}mm;height:${a.heightMm}mm"><span style="top:-${LABEL.offsetAboveMm}mm;font-size:${LABEL.fontSizeMm}mm">${label}</span><img src="${svg(id)}"></div>`; };
const pages = trials.map((t, i) => { const A = `${t.family}-A`, B = `${t.family}-${t.left}`, C = `${t.family}-${t.right}`; return `<section>
<header>Question ${i + 1} of ${trials.length} &middot; trial ${t.id} &middot; ${t.name} (${t.group}) &middot; A = ${notation[A]} &middot; B = ${notation[B]} &middot; C = ${notation[C]}</header>
<h1>Which is more similar to A?</h1>
<div class="stage">${obj(A, 'A')}${obj(B, 'B')}${obj(C, 'C')}</div>
<footer>Stage ${STAGE.width} &times; ${STAGE.height} mm, objects at their calibrated physical size when printed at 100%. Canonical left/right order; the experiment randomises sides.</footer></section>`; }).join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:A4 landscape;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Optima,"Segoe UI",Arial,sans-serif;color:#000;background:#fff}
section{width:297mm;height:210mm;page-break-after:always;position:relative;padding:12mm 0 0}
header{position:absolute;top:6mm;left:12mm;right:12mm;font-size:3mm;color:#444}
h1{font-size:6mm;font-weight:500;text-align:center;margin:8mm 0 10mm}
.stage{position:relative;width:${STAGE.width}mm;height:${STAGE.height}mm;margin:0 auto}
.o{position:absolute}.o span{position:absolute;left:50%;transform:translateX(-50%);line-height:1}.o img{display:block;width:100%;height:100%}
footer{position:absolute;bottom:6mm;left:12mm;right:12mm;font-size:2.8mm;color:#444}
</style></head><body>${pages}</body></html>`;
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch(); const page = await browser.newPage();
await page.setContent(html, {waitUntil: 'load'});
await page.pdf({path: out, format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true});
await browser.close();
console.log(`Wrote ${trials.length} pages to ${out}`);

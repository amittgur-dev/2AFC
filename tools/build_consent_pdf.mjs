// Builds the "informed consent" document of a study from the consent text in
// its config.js (the same text the app shows on its consent page): writes
// docs/methodology/consent-page[-<study>].html and prints it to an A4 PDF.
// Run: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tools/build_consent_pdf.mjs [study] [out.pdf]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const study = process.argv[2] ?? '1';
const NAMES = {1: 'Lines with edges', 2: 'Similarity with rotation'};
const out = path.resolve(process.argv[3] ?? path.join(ROOT, 'docs', `Informed consent - ${NAMES[study]}.pdf`));
const {config} = await import(pathToFileURL(path.join(ROOT, 'site', study, 'config.js')).href);
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const item = i => {
  if (typeof i === 'string') return `<p>${esc(i)}</p>`;
  let text = esc(i.text);
  if (i.highlight && text.includes(esc(i.highlight))) text = text.replace(esc(i.highlight), `<span class="highlight">${esc(i.highlight)}</span>`);
  return `<li><strong>${esc(i.title)}.</strong> ${text}</li>`;
};
const items = config.study.consentText;
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Participant Information &amp; Consent</title>
<style>
  body { margin: 0; background: #fff; color: #1f2937; font-family: Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
  main { max-width: 1180px; margin: 0 auto; padding: 36px 24px 48px; }
  h1 { text-align: center; font-size: 44px; font-weight: 700; margin: 0 0 26px; letter-spacing: -0.01em; }
  .card { border: 1.5px solid #d9dde3; border-radius: 18px; padding: 34px 48px 30px; font-size: 23px; line-height: 1.55; }
  .card p { margin: 0 0 22px; }
  ul { margin: 0 0 22px; padding-left: 34px; }
  li { margin: 0 0 16px; }
  .highlight { color: #c00000; font-weight: 600; }
  label { display: flex; gap: 14px; align-items: flex-start; font-size: 23px; line-height: 1.35; }
  input[type=checkbox] { width: 26px; height: 26px; margin: 5px 0 0; flex: none; }
</style>
</head>
<body>
<main>
  <h1>Participant Information &amp; Consent</h1>
  <div class="card">
    ${items.filter(i => typeof i === 'string').map(item).join('\n    ')}
    <ul>
      ${items.filter(i => typeof i !== 'string').map(item).join('\n      ')}
    </ul>
    <label><input type="checkbox"> I have read and understood the information above, I am 18 years or older, and I consent to take part in this study and to the use of my data as described.</label>
  </div>
</main>
</body>
</html>
`;
const htmlPath = path.join(ROOT, 'docs/methodology', study === '1' ? 'consent-page.html' : `consent-page-${study}.html`);
fs.writeFileSync(htmlPath, html);
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlPath).href);
await page.emulateMedia({media: 'print'});
await page.pdf({path: out, format: 'A4', printBackground: true, margin: {top: '18mm', bottom: '18mm', left: '16mm', right: '16mm'}, scale: 0.62});
await browser.close();
console.log(htmlPath + '\n' + out);

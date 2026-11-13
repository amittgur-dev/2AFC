// Prints the participant information and consent page of a study
// (docs/methodology/consent-page*.html) to an A4 PDF, for the ethics
// application's "informed consent" document.
// Run: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tools/build_consent_pdf.mjs [study] [out.pdf]
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const study = process.argv[2] ?? '1';
const NAMES = {1: 'Lines with edges', 2: 'Similarity with rotation'};
const out = path.resolve(process.argv[3] ?? path.join(ROOT, 'docs', `Informed consent - ${NAMES[study]}.pdf`));
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file://' + path.join(ROOT, 'docs/methodology', study === '1' ? 'consent-page.html' : `consent-page-${study}.html`));
await page.emulateMedia({media: 'print'});
await page.pdf({path: out, format: 'A4', printBackground: true, margin: {top: '18mm', bottom: '18mm', left: '16mm', right: '16mm'}, scale: 0.62});
await browser.close();
console.log(out);

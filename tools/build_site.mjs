// Assembles ONE study into a publish folder: the study's files at the root
// plus the shared runner under shared/. Each study is deployed as its own
// Netlify project from this repository, so every study has its own link with
// nothing nested under another study's address.
//
// Usage: node tools/build_site.mjs [study] [outDir]
//   study  : folder under site/ ('1' Lines with edges, '2' Similarity with
//            rotation); defaults to the STUDY environment variable, then '1'.
//   outDir : defaults to dist/
// Netlify runs this as the build command (netlify.toml); the second project
// sets the environment variable STUDY=2 and nothing else.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const study = process.argv[2] ?? process.env.STUDY ?? '1';
const out = path.resolve(process.argv[3] ?? path.join(ROOT, 'dist'));
const src = path.join(ROOT, 'site', study);
if (!/^[A-Za-z0-9_-]+$/.test(study) || !fs.existsSync(path.join(src, 'index.html'))) throw new Error(`No study folder site/${study}; existing: ${fs.readdirSync(path.join(ROOT, 'site')).filter(f => f !== 'shared').join(', ')}`);
if (out === ROOT || out === path.join(ROOT, 'site')) throw new Error('refusing to build into the source tree');
fs.rmSync(out, {recursive: true, force: true});
fs.mkdirSync(out, {recursive: true});
fs.cpSync(src, out, {recursive: true});
fs.cpSync(path.join(ROOT, 'site', 'shared'), path.join(out, 'shared'), {recursive: true});
for (const f of ['index.html', 'main.js']) {
  const p = path.join(out, f);
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replaceAll('../shared/', './shared/'));
}
const count = dir => fs.readdirSync(dir, {withFileTypes: true}).reduce((n, e) => n + (e.isDirectory() ? count(path.join(dir, e.name)) : 1), 0);
for (const f of ['index.html', 'main.js', 'config.js', 'stimuli.js', 'shared/app.js', 'shared/style.css']) if (!fs.existsSync(path.join(out, f))) throw new Error('missing ' + f);
if (/\.\.\/shared\//.test(fs.readFileSync(path.join(out, 'index.html'), 'utf8') + fs.readFileSync(path.join(out, 'main.js'), 'utf8'))) throw new Error('shared/ reference not rewritten');
console.log(`Built study ${study} into ${out} (${count(out)} files)`);

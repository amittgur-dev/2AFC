// Scaffolds a second experiment folder that reuses the shared runner.
// Usage: node tools/new_experiment.mjs <folder> <experiment-id> "<name>"
//   e.g. node tools/new_experiment.mjs 3 exp3-shapes "Shape similarity"
// Creates site/<folder>/{index.html, main.js, config.js, stimuli.js, assets/}
// from experiment 1's files (site/1); then replace stimuli.js and assets/
// with the new stimulus set and adjust config.js. Use a neutral folder name
// (a number) so the link reveals nothing about the study.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [folder, id, name] = process.argv.slice(2);
if (!folder || !id || !name) { console.error('Usage: node tools/new_experiment.mjs <folder> <experiment-id> "<name>"'); process.exit(1); }
const dir = path.join(ROOT, 'site', folder);
if (fs.existsSync(dir)) { console.error(dir + ' already exists'); process.exit(1); }
fs.mkdirSync(path.join(dir, 'assets'), {recursive: true});
const site = f => path.join(ROOT, 'site', '1', f);
fs.writeFileSync(path.join(dir, 'index.html'), fs.readFileSync(site('index.html'), 'utf8'));
fs.writeFileSync(path.join(dir, 'main.js'), fs.readFileSync(site('main.js'), 'utf8').replace(/^\/\/ Experiment 1 \(Lines with edges\), served at \/1\/\./m, `// Experiment ${folder} (${name}), served at /${folder}/.`));
fs.writeFileSync(path.join(dir, 'config.js'), fs.readFileSync(site('config.js'), 'utf8')
  .replace(/experiment: \{id: '[^']*', name: '[^']*'\}/, `experiment: {id: '${id}', name: '${name}'}`)
  .replace(/localKey: '[^']*'/, `localKey: 'line-similarity:${folder}:session:v1'`)
  .replace(/stimulusSetVersion: '[^']*'/, `stimulusSetVersion: '${id}-v1'`));
fs.writeFileSync(path.join(dir, 'stimuli.js'), `// Stimuli for ${name}. Same shape as experiment 1's stimuli.js:
// assets: {"<family>-<variant>": {src: 'assets/<file>.svg', widthMm, heightMm}}
// trials: [{id: '<family>.<pair>', family: <number>, name, group, left: '<variant>', right: '<variant>'}]
// Family 0 is treated as the control (see design.controlPosition).
export const assets = {};
export const trials = [];
`);
console.log(`Created site/${folder}/ for experiment "${name}" (${id}). Next: put SVGs in site/${folder}/assets/, fill site/${folder}/stimuli.js, review site/${folder}/config.js. It will be served at /${folder}/.`);

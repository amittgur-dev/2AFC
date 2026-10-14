// Reproduces the presentation order of a session from its recorded design
// seed, using the app's own code (design.js + the experiment's stimuli.js).
// Needed only when a session row carries a compact or minimal record, whose
// trials lack the presentation fields; a full record already contains
// `sequence`. The output is one line per screen in JSON.
//
// Usage: node reproduce_sequence.mjs <1|2> <seed> [design-json]
//   node reproduce_sequence.mjs 1 259228569
//   node reproduce_sequence.mjs 2 123456 '{"controlPosition":"random","randomizeTrialOrder":true,"avoidConsecutiveSameFamily":true,"sideAssignment":"random","repetitions":1}'
// The design JSON defaults to the deployed design; pass the session row's
// `design` column to be exact (extra keys such as seed/keys are ignored).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [study, seedText, designText] = process.argv.slice(2);
if (!['1', '2'].includes(study) || !seedText) { console.error('usage: node reproduce_sequence.mjs <1|2> <seed> [design-json]'); process.exit(2); }
// In the handoff bundle the app files sit next to this script; in the
// repository they are under site/.
const find = (bundled, inRepo) => fs.existsSync(path.join(here, bundled)) ? path.join(here, bundled) : path.join(here, inRepo);
const {buildDesign} = await import(pathToFileURL(find('design.js', '../../../site/shared/design.js')).href);
const {trials} = await import(pathToFileURL(find(`stimuli-${study}.js`, `../../../site/${study}/stimuli.js`)).href);
const defaults = {controlPosition: 'random', randomizeTrialOrder: true, avoidConsecutiveSameFamily: true, sideAssignment: 'random', repetitions: 1, interTrialIntervalMs: 500};
const design = {...defaults, ...(designText ? JSON.parse(designText) : {})};
const {sequence, interleaved} = buildDesign(design, Number(seedText), trials);
console.error(`${sequence.length} screens, interleaved: ${interleaved}`);
for (const p of sequence) console.log(JSON.stringify(p));

// Experiment 2 (Similarity with rotation), served at /2/. Wires this folder's config and stimuli to
// the shared runner. A second experiment is another folder with the same
// three files (index.html, config.js, stimuli.js) and its own assets/.
import {config} from './config.js';
import {assets, trials} from './stimuli.js';
import {run} from '../shared/app.js';
run({config, assets, trials});

// Experiment 1 (Lines with edges), served at /1/. Wires this folder's config
// and stimuli to the shared runner. Each experiment is a numbered folder with
// index.html, main.js, config.js, stimuli.js and assets/; paths say nothing
// about the study.
import {config} from './config.js';
import {assets, trials} from './stimuli.js';
import {run} from '../shared/app.js';
run({config, assets, trials});

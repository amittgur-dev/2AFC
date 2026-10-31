// Colleagues' preview of the 2AFC experiment, served at /preview/ on the
// rotation study's site. Without a variation in the link (?v=<id>) it lists
// the variations; with one, it runs that variation through the shared runner
// with no consent, no demographics and no recording.
import {config} from './config.js';
import {variations} from './variations.js';

const chosen = variations.find(v => v.id === new URL(location.href).searchParams.get('v'));
const $ = id => document.getElementById(id);
if (!chosen) {
  const list = $('variation-list');
  for (const v of variations) {
    const li = document.createElement('li');
    const a = document.createElement('a'); a.className = 'button primary'; a.href = '?v=' + encodeURIComponent(v.id) + '&reset=1'; a.textContent = v.name;
    const p = document.createElement('p'); p.textContent = v.description;
    li.append(a, p); list.append(li);
  }
} else {
  $('menu').hidden = true;
  const folder = chosen.stimuli ?? chosen.id;
  const {assets, trials} = await import(`./variations/${folder}/stimuli.js`);
  const located = Object.fromEntries(Object.entries(assets).map(([id, a]) => [id, {...a, src: `variations/${folder}/${a.src}`}]));
  config.experiment = {id: 'preview-' + chosen.id, name: 'Preview: ' + chosen.name};
  config.study.title = chosen.name;
  config.stimulusSetVersion = folder + '-' + chosen.version;
  config.design = {...config.design, ...(chosen.design ?? {})};
  $('variation-note').textContent = chosen.description;
  const {run} = await import('../shared/app.js');
  run({config, assets: located, trials});
}

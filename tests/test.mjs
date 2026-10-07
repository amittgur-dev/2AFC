// Node-only checks for the line-similarity experiment: physical conversion,
// layout bounds, pair coverage, sequence construction and record export.
// Run: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../site');
const {assets, trials} = await import(path.join(APP, 'stimuli.js'));
const {CARD, STAGE, LABEL, pixelsPerMm, dimensions, fits, requiredPixels, changedScreen, zoomSuspected} = await import(path.join(APP, 'shared/geometry.js'));
const design = await import(path.join(APP, 'shared/design.js'));
const {validateDesign, interleave, hasConsecutiveSameFamily, rng, shuffle} = design;
const buildDesign = (d, seed, t = trials) => design.buildDesign(d, seed, t);
const buildSequence = (d, seed, t = trials) => design.buildSequence(d, seed, t);
const {config} = await import(path.join(APP, 'config.js'));
const {trialsToCsv, compactRecord, minimalRecord, BEACON_LIMIT_BYTES} = await import(path.join(APP, 'shared/storage.js'));

// Stimuli and physical layout
assert.equal(trials.length, 19);
assert.equal(Object.keys(assets).length, 32);
assert.deepEqual([assets['0-A'].widthMm, assets['0-A'].heightMm], [40, 1]);
assert.deepEqual([assets['0-L'].widthMm, assets['0-L'].heightMm], [80, 1]);
assert.deepEqual([assets['0-P'].widthMm, assets['0-P'].heightMm], [80, 2]);
assert.equal(assets['8-A'].heightMm, 38.25);
// Every thin line is 1 mm thick and 40 mm long, like the control.
for (const f of [1, 2, 3, 4, 5]) { assert.equal(assets[`${f}-L`].widthMm - assets[`${f}-A`].widthMm, 40, 'family ' + f + ' extension adds 40 mm'); }
assert.deepEqual([assets['3-A'].widthMm, assets['3-A'].heightMm, assets['3-L'].heightMm, assets['3-P'].heightMm], [44, 1, 1, 2]);
assert.deepEqual([assets['1-A'].widthMm, assets['1-A'].heightMm], [50, 5]);
assert.deepEqual([assets['6-A'].widthMm, assets['6-A'].heightMm], [48, 6]);
const measurements = fs.readFileSync(path.join(APP, '../data/measurements.csv'), 'utf8').trim().split('\n').slice(1).map(l => l.split(','));
for (const m of measurements) if (['1', '2', '3', '4', '5'].includes(m[1])) { assert.equal(+m[7], m[3] === 'A' || m[3] === 'E' ? 40 : 80, m[0] + ' body length'); assert.equal(+m[8], m[3] === 'P' ? 2 : 1, m[0] + ' body thickness'); }
for (const [id, a] of Object.entries(assets)) {
  assert.ok(fs.existsSync(path.join(APP, a.src)), id + ' asset exists');
  assert.ok(fs.readFileSync(path.join(APP, a.src), 'utf8').includes('<svg'));
}
for (const ppmm of [2, 3.78, 4, 5, 6]) {
  assert.ok(Math.abs(pixelsPerMm(CARD.width * ppmm) - ppmm) < 1e-12);
  assert.equal(dimensions(assets['0-A'], ppmm).height, ppmm);
}
// Every unordered pair, in both left/right orders, fits the stage without overlap.
const boxFor = (assetId, label) => {
  const a = assets[assetId]; const [x, y] = STAGE.positions[label];
  return {x0: x - a.widthMm / 2, x1: x + a.widthMm / 2, y0: y - a.heightMm / 2, y1: y + a.heightMm / 2};
};
const disjoint = (a, b) => a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0;
for (const t of trials) for (const reversed of [false, true]) {
  const left = reversed ? t.right : t.left, right = reversed ? t.left : t.right;
  const boxes = [boxFor(`${t.family}-A`, 'A'), boxFor(`${t.family}-${left}`, 'B'), boxFor(`${t.family}-${right}`, 'C')];
  for (const b of boxes) assert.ok(b.x0 > 0 && b.x1 < STAGE.width && b.y0 - LABEL.offsetAboveMm > 0 && b.y1 < STAGE.height, `${t.id} inside stage`);
  assert.ok(boxes[2].x0 - boxes[1].x1 >= 13.4 - 1e-6, `${t.id} minimum gap`);
  const labels = boxes.map(b => ({x0: (b.x0 + b.x1) / 2 - 4, x1: (b.x0 + b.x1) / 2 + 4, y0: b.y0 - LABEL.offsetAboveMm, y1: b.y0 - LABEL.offsetAboveMm + LABEL.fontSizeMm}));
  const all = [...boxes, ...labels];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(disjoint(all[i], all[j]), `${t.id} no overlap`);
}
assert.ok(fits(5.11, 1164, 712) && fits(5.11, 1440, 900) && fits(3.78, 1200, 800) && !fits(3.78, 800, 600));
assert.deepEqual(requiredPixels(5), {width: 1132, height: 690});
const baseline = {dpr: 1, screenWidth: 1920, screenHeight: 1080, visualScale: 1};
assert.ok(!changedScreen(baseline, {...baseline}));
for (const key of Object.keys(baseline)) assert.ok(changedScreen(baseline, {...baseline, [key]: baseline[key] * 1.25}));
for (let i = 1; i <= 5; i++) assert.deepEqual(trials.filter(t => t.family === i).map(t => t.left + t.right), ['EL', 'EP', 'LP']);
for (let i = 6; i <= 8; i++) assert.deepEqual(trials.filter(t => t.family === i).map(t => t.left + t.right), ['LP']);

// Sequence construction
const ids = trials.map(t => t.id).sort();
assert.ok(Math.abs(rng(1)() - rng(1)()) < 1e-15, 'seeded generator is deterministic');
assert.deepEqual(shuffle([1, 2, 3, 4], rng(3)).sort(), [1, 2, 3, 4]);
let reversedCount = 0, controlPositions = new Set();
for (let seed = 0; seed < 300; seed++) {
  const s = buildSequence(config.design, seed);
  assert.equal(s.length, 19);
  assert.deepEqual(s.map(p => p.trial_id).sort(), ids, 'every question exactly once');
  assert.deepEqual(s.map(p => p.presentation_index), [...s.keys()]);
  assert.ok(!hasConsecutiveSameFamily(s), 'families interleaved for seed ' + seed);
  assert.deepEqual(buildSequence(config.design, seed), s, 'reproducible from seed');
  controlPositions.add(s.findIndex(p => p.family_id === 0));
  for (const p of s) {
    assert.ok(assets[p.reference_asset_id] && assets[p.left_asset_id] && assets[p.right_asset_id]);
    assert.equal(p.reference_asset_id, `${p.family_id}-A`);
    assert.equal(p.left_asset_id, `${p.family_id}-${p.left_condition}`);
    assert.equal(p.right_asset_id, `${p.family_id}-${p.right_condition}`);
    assert.notEqual(p.left_condition, p.right_condition);
    if (p.side_assignment === 'reversed') reversedCount++;
  }
}
assert.ok(reversedCount > 300 * 19 * .4 && reversedCount < 300 * 19 * .6, 'left/right coin flip is roughly balanced: ' + reversedCount);
assert.ok(controlPositions.size > 10, 'control appears at many positions, not only first');
const both = buildSequence({...config.design, sideAssignment: 'both'}, 9);
assert.equal(both.length, 38);
for (const t of trials) {
  const pair = both.filter(p => p.trial_id === t.id);
  assert.deepEqual(pair.map(p => p.side_assignment).sort(), ['canonical', 'reversed']);
}
const fixed = buildSequence({...config.design, randomizeTrialOrder: false, sideAssignment: 'fixed', controlPosition: 'first'}, 9);
assert.deepEqual(fixed.map(p => p.trial_id), trials.map(t => t.id));
assert.ok(fixed.every(p => p.side_assignment === 'canonical'));
assert.equal(buildSequence({...config.design, repetitions: 2}, 4).length, 38);
assert.equal(buildSequence({...config.design, controlPosition: 'excluded'}, 4).length, 18);
// Repetitions: the family constraint also holds across the pass boundary.
for (let seed = 0; seed < 300; seed++) {
  const built = buildDesign({...config.design, repetitions: 2}, seed);
  assert.equal(built.sequence.length, 38);
  assert.ok(built.interleaved && !hasConsecutiveSameFamily(built.sequence), 'interleaved across passes for seed ' + seed);
  assert.deepEqual(built.sequence.filter(p => p.repetition_index === 0).map(p => p.trial_id).sort(), ids);
  assert.deepEqual(built.sequence.filter(p => p.repetition_index === 1).map(p => p.trial_id).sort(), ids);
  const bothReps = buildDesign({...config.design, repetitions: 2, sideAssignment: 'both'}, seed);
  assert.ok(bothReps.interleaved && bothReps.sequence.length === 76);
}
// Misconfiguration is an error, not a silent fallback.
assert.throws(() => validateDesign({...config.design, controlPosition: 'frist'}), /controlPosition/);
assert.throws(() => buildSequence({...config.design, sideAssignment: 'fixd'}, 1), /sideAssignment/);
assert.throws(() => buildSequence({...config.design, repetitions: 0}, 1), /repetitions/);
// An impossible interleaving keeps every item and is reported, not hidden.
const impossible = [1, 1, 1, 2].map((f, i) => ({family_id: f, trial_id: 't' + i}));
const repaired = interleave(impossible, rng(1), null, 5);
assert.deepEqual(repaired.map(p => p.trial_id).sort(), ['t0', 't1', 't2', 't3']);
assert.ok(hasConsecutiveSameFamily(repaired));
// Safari-style zoom: viewport width changes while the window width does not.
const fp = {dpr: 2, screenWidth: 1512, screenHeight: 982, visualScale: 1, innerWidth: 1400, outerWidth: 1400, fullscreen: false};
assert.ok(zoomSuspected(fp, {...fp, innerWidth: 1273}));
assert.ok(!zoomSuspected(fp, {...fp, innerWidth: 1200, outerWidth: 1200}), 'window resize is not zoom');
assert.ok(!zoomSuspected(fp, {...fp, innerWidth: 1512, outerWidth: 1512, fullscreen: true}), 'entering full screen is not zoom');
assert.ok(!zoomSuspected({...fp, outerWidth: 0}, {...fp, outerWidth: 0, innerWidth: 900}), 'unknown window width is ignored');

// Record export
const seq = buildSequence(config.design, 1);
const session = {session_id: 's', participant_id: 'p', protocol_version: 'v', stimulus_set_version: 'sv', layout_version: 'lv', sequence: seq,
  trials: [{...seq[0], chosen_side: 'left', chosen_condition: seq[0].left_condition, chosen_asset_id: seq[0].left_asset_id, response_method: 'keyboard', reaction_time_ms: 812.3, stimulus_onset_iso: 'a', response_iso: 'b', attempts: 1, interruptions: [{type: 'hidden'}], pixels_per_mm: 5}]};
const csv = trialsToCsv(session).split('\n');
assert.deepEqual(csv[0].split(',').slice(0, 2), ['experiment_id', 'session_id']);
assert.equal(csv.length, 3);
assert.ok(csv[1].includes(',812.3,') && csv[1].includes(seq[0].trial_id) && csv[1].includes('""type"":""hidden""'));
assert.ok(trialsToCsv({...session, experiment_id: 'e', participant_id: '=HYPERLINK("x")'}).split('\n')[1].startsWith("e,s,\"'=HYPERLINK(\"\"x\"\")\""), 'formula-leading text is neutralised');
assert.ok(trialsToCsv({...session, experiment_id: 'e', participant_id: '-12'}).split('\n')[1].startsWith("e,s,'-12,"));
// Compact beacon record: every trial keeps its identity and response but drops the copied presentation fields.
const fullSession = {...session, events: [{type: 'x'}], trials: seq.map(p => ({...p, chosen_side: 'left', chosen_condition: p.left_condition, chosen_asset_id: p.left_asset_id, response_method: 'keyboard', reaction_time_ms: 500, stimulus_onset_iso: 'a', response_iso: 'b', attempts: 1, interruptions: [], pixels_per_mm: 5}))};
const compact = compactRecord(fullSession, 'abandoned');
assert.equal(compact.trials.length, 19); assert.ok(!('sequence' in compact) && compact.compact && compact.event_count === 1);
assert.ok(compact.trials.every(t => t.presentation_index !== undefined && t.trial_id && t.chosen_condition && !('left_asset_id' in t)));
assert.ok(JSON.stringify(compact).length < JSON.stringify(fullSession).length / 2);
assert.ok(encodeURIComponent(JSON.stringify(compact)).length < BEACON_LIMIT_BYTES);
// The minimal record keeps the beacon under the cap even for the largest design (76 answered screens).
const big = buildSequence({...config.design, sideAssignment: 'both', repetitions: 2}, 3);
const env = {timestamp: 'x', user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15', inner_width: 1440, inner_height: 820, outer_width: 1440, outer_height: 900, screen_width: 1512, screen_height: 982};
const bigSession = {...session, participant_id: '5f3b2c9d8e7a6b5c4d3e2f1a0b9c8d7e', url_parameters: {STUDY_ID: '66f1a2b3c4d5e6f7a8b9c0d1', SESSION_ID: '66f1a2b3c4d5e6f7a8b9c0d2'}, sequence: big,
  calibration: {card_width_px: 437.5, pixels_per_mm: 5.11, at: 'x', environment: env}, calibration_history: [{environment: env}, {environment: env}, {environment: env}], environment_at_start: env, environment_at_end: env,
  events: Array.from({length: 40}, (_, i) => ({type: 'interruption', at: 'x', t: i, presentation_index: i, interruption: 'hidden'})),
  trials: big.map(p => ({...p, chosen_side: 'left', chosen_label: 'B', chosen_condition: p.left_condition, chosen_asset_id: p.left_asset_id, response_method: 'keyboard', reaction_time_ms: 1234.5, stimulus_onset_iso: '2026-10-07T10:00:00.000Z', response_iso: '2026-10-07T10:00:01.234Z', attempts: 1, interruptions: [], pixels_per_mm: 5.11, viewport: {inner_width: 1440, inner_height: 820, fullscreen: false}, reference_width_mm: 45, reference_height_mm: 4.5, left_width_mm: 54, left_height_mm: 9, right_width_mm: 81, right_height_mm: 4.5}))};
const formBytes = r => new URLSearchParams({'form-name': 'x', payload: JSON.stringify(r)}).toString().length;
const minimal = minimalRecord(bigSession, 'abandoned');
assert.equal(minimal.trials.length, 76); assert.ok(minimal.minimal && minimal.compact && !('sequence' in minimal) && !('calibration_history' in minimal));
assert.equal(minimal.calibration.pixels_per_mm, 5.11);
assert.ok(minimal.trials.every(t => t.trial_id && t.chosen_condition && t.reaction_time_ms === 1234.5 && t.interruption_count === 0));
assert.ok(formBytes(minimal) < BEACON_LIMIT_BYTES, 'minimal 76-trial form body under the cap: ' + formBytes(minimal));
assert.ok(formBytes(compactRecord(bigSession, 'abandoned')) > formBytes(minimal));
// `interleaved` reports on the shuffled segments only; a deliberate leading control block does not count.
assert.equal(buildDesign({...config.design, controlPosition: 'first', sideAssignment: 'both'}, 5).interleaved, true);
assert.equal(buildDesign({...config.design, avoidConsecutiveSameFamily: false}, 5).interleaved, null);
assert.equal(buildDesign({...config.design, randomizeTrialOrder: false}, 5).interleaved, null);

// Experiment 2: Similarity with Rotation. 16 questions x 3 pairs, every
// comparison classified from the rotation parameters, same stage.
const rot = await import(path.join(APP, 'rotation/stimuli.js'));
const rotConfig = (await import(path.join(APP, 'rotation/config.js'))).config;
assert.equal(rot.trials.length, 48);
assert.equal(Object.keys(rot.assets).length, 64);
assert.equal(rotConfig.experiment.id, 'exp2-similarity-with-rotation');
assert.notEqual(rotConfig.storage.localKey, config.storage.localKey, 'experiments do not share stored sessions');
for (let q = 1; q <= 16; q++) {
  assert.deepEqual(rot.trials.filter(t => t.family === q).map(t => t.left + '/' + t.right), ['sub/whole', 'sub/shape', 'whole/shape']);
  const a = rot.assets[`${q}-A`];
  for (const v of ['sub', 'whole', 'shape']) {
    const c = rot.assets[`${q}-${v}`];
    assert.ok(fs.existsSync(path.join(APP, 'rotation', c.src)) && c.widthMm === 41.33 && c.heightMm === 41.33);
    assert.equal(c.shape, a.shape); assert.equal(c.sub, a.sub);
    const db = (c.baseRot - a.baseRot + 360) % 360, ds = (c.subRot - a.subRot + 360) % 360;
    assert.deepEqual([db, ds], {sub: [0, 45], whole: [45, 45], shape: [45, 0]}[v], `question ${q} ${v}`);
    assert.equal(c.relationToReference, v);
  }
}
assert.ok(!Object.values(rot.assets).some(a => fs.readFileSync(path.join(APP, 'rotation', a.src), 'utf8').includes('#111')), 'pure black artwork');
for (const t of rot.trials) for (const reversed of [false, true]) {
  const left = reversed ? t.right : t.left, right = reversed ? t.left : t.right;
  const boxes = [[`${t.family}-A`, 'A'], [`${t.family}-${left}`, 'B'], [`${t.family}-${right}`, 'C']].map(([id, label]) => { const a = rot.assets[id]; const [x, y] = STAGE.positions[label]; return {x0: x - a.widthMm / 2, x1: x + a.widthMm / 2, y0: y - a.heightMm / 2, y1: y + a.heightMm / 2}; });
  for (const b of boxes) assert.ok(b.x0 > 0 && b.x1 < STAGE.width && b.y0 - LABEL.offsetAboveMm > 0 && b.y1 < STAGE.height, `rotation ${t.id} inside stage`);
  assert.ok(boxes[2].x0 - boxes[1].x1 >= 13.4);
}
for (let seed = 0; seed < 100; seed++) {
  const s = buildDesign(rotConfig.design, seed, rot.trials);
  assert.equal(s.sequence.length, 48); assert.ok(s.interleaved);
  assert.deepEqual(s.sequence.map(p => p.trial_id).sort(), rot.trials.map(t => t.id).sort());
}
const rotHtml = fs.readFileSync(path.join(APP, 'rotation/index.html'), 'utf8');
assert.ok(rotHtml.includes('../shared/style.css') && rotHtml.includes('main.js') && fs.existsSync(path.join(APP, 'rotation/main.js')));

// Deployed HTML and Netlify form registration
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
for (const source of ['shared/style.css', 'main.js']) assert.ok(html.includes(source) && fs.existsSync(path.join(APP, source)));
assert.throws(() => design.buildDesign(config.design, 1, []), /trials/);
assert.ok(html.includes(`name="${config.storage.formName}"`) && html.includes('data-netlify="true"'));
const storageSource = fs.readFileSync(path.join(APP, 'shared/storage.js'), 'utf8');
for (const field of [...storageSource.matchAll(/params\.set\('([a-z_-]+)'/g)].map(m => m[1])) assert.ok(html.includes(`name="${field}"`), 'form field registered: ' + field);
assert.ok(!html.includes('id="previous"') && !html.includes('id="next"'), 'no preview navigation');
assert.ok(!html.includes('id="verification"') && !/no photo|right or wrong|about .* minutes/i.test(html), 'pilot text trimmed');
assert.ok(config.experiment.id && config.storage.localKey, 'experiment identified');
console.log('Passed: experiment 1 (32 assets, 19 questions) and experiment 2 (57 files, 48 questions, relations verified), physical bounds in both left/right orders, interleaved sequences over 300 seeds (also across repetitions), design validation, zoom detection, CSV export and neutralisation, compact beacon record, Netlify form fields.');

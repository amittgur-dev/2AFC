import {assets} from './stimuli.js';
import {config} from './config.js';
import {CARD, STAGE, LABEL, pixelsPerMm, dimensions, fits, requiredPixels, changedScreen, zoomSuspected} from './geometry.js';
import {buildDesign, allAssetIds} from './design.js';
import {loadSession, saveSession, clearSession, storageAvailable, randomId, trialsToCsv, submitSession, beaconSession, download} from './storage.js';

const $ = id => document.getElementById(id);
const KEY = config.storage.localKey;
const SECTIONS = ['information', 'calibration', 'verification', 'instructions', 'experiment', 'complete'];
const now = () => new Date().toISOString();
const perf = () => (globalThis.performance?.now ? performance.now() : Date.now());
const DECODE_TIMEOUT_MS = 8000;  // a decode that never settles after the image has loaded is treated as a failure
const IMAGE_RETRY_MS = 1500;     // pause before re-presenting after a failed load

let mode = 'information';
let session = null;      // persisted record (see docs/EXPERIMENT_DATA.md)
let scale = 0;           // CSS pixels per millimetre from the card match
let fingerprint = null;  // reported screen/window properties at calibration
let current = null;      // the presentation on screen: {index, attempts, interruptions, onsetPerf, onsetIso, ready, token}
let resumeAfterCalibration = false;
let decodedAssets = null; // Promise resolving when every SVG is decoded
let itiTimer = 0;
let submitting = false;
let starting = false;
let calibrationGeneration = 0; // bumped by every calibrate(); lets start() notice a recalibration during preload

// ---------- environment & session records ----------
const snapshot = () => ({
  dpr: devicePixelRatio, screenWidth: screen.width, screenHeight: screen.height, visualScale: window.visualViewport?.scale ?? 1,
  innerWidth, outerWidth, fullscreen: !!document.fullscreenElement,
});
function environment() {
  const mq = q => (globalThis.matchMedia ? matchMedia(q).matches : null);
  return {
    timestamp: now(), device_pixel_ratio: devicePixelRatio,
    screen_width: screen.width, screen_height: screen.height, screen_avail_width: screen.availWidth, screen_avail_height: screen.availHeight,
    inner_width: innerWidth, inner_height: innerHeight, outer_width: outerWidth, outer_height: outerHeight,
    visual_viewport_scale: window.visualViewport?.scale ?? 1, fullscreen: !!document.fullscreenElement,
    user_agent: navigator.userAgent, language: navigator.language, color_depth: screen.colorDepth,
    max_touch_points: navigator.maxTouchPoints ?? null, pointer_coarse: mq('(pointer: coarse)'), hover_none: mq('(hover: none)'),
  };
}
function persist() { if (session) session.storage_available = saveSession(KEY, session); }
function logEvent(type, data = {}) {
  if (!session) return;
  session.events.push({type, at: now(), t: Math.round(perf()), presentation_index: current?.index ?? null, ...data});
  persist();
}
function urlIdentity() {
  const url = new URL(location.href);
  const participant_id = config.participant.idParams.map(k => url.searchParams.get(k)).find(Boolean) ?? null;
  const url_parameters = {};
  for (const k of config.participant.passthroughParams) if (url.searchParams.has(k)) url_parameters[k] = url.searchParams.get(k);
  return {participant_id, url_parameters};
}
function newSession() {
  const seed = (globalThis.crypto?.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 2 ** 32)) >>> 0;
  const built = buildDesign(config.design, seed);
  return {
    schema_version: 1, session_id: randomId(), ...urlIdentity(),
    protocol_version: config.protocolVersion, stimulus_set_version: config.stimulusSetVersion, layout_version: config.layoutVersion,
    consent_version: config.study.consentVersion,
    design: {...config.design, seed, interleaved: built.interleaved}, sequence: built.sequence,
    stage_mm: STAGE, label_mm: LABEL, card_mm: CARD,
    started_at: now(), consented_at: null, ended_at: null, completion_status: 'in_progress',
    storage_available: storageAvailable(),
    calibration: null, calibration_history: [], environment_at_start: environment(),
    trials: [], events: [], submissions: [],
  };
}
// A stored session may be continued only if it was produced by this exact
// configuration and belongs to the participant named in the URL.
function resumable(existing) {
  if (!existing || existing.schema_version !== 1) return false;
  if (existing.protocol_version !== config.protocolVersion || existing.stimulus_set_version !== config.stimulusSetVersion || existing.layout_version !== config.layoutVersion) return false;
  const stored = {...existing.design}; delete stored.seed; delete stored.interleaved;
  if (JSON.stringify(stored) !== JSON.stringify(config.design)) return false;
  const {participant_id} = urlIdentity();
  if (participant_id && existing.participant_id !== participant_id) return false;
  return true;
}
const design = () => session?.design ?? config.design;

// ---------- screens ----------
function show(next) {
  mode = next;
  for (const id of SECTIONS) $(id).hidden = id !== next;
  checkFit();
}
// The notice element of the screen the participant is looking at.
function notice(text) {
  const target = {calibration: 'calibration-notice', verification: 'verification-notice', instructions: 'instructions-notice', experiment: 'fit-message'}[mode];
  if (target) $(target).textContent = text;
}
function updateCard(value) {
  const max = Math.min(850, innerWidth - 40);
  const w = Math.max(100, Math.min(max, Number(value) || 324));
  $('card-size').max = max; $('card-size').min = Math.min(180, max); $('card-size').value = w;
  $('card').style.width = w + 'px';
  $('card').style.height = w * CARD.height / CARD.width + 'px';
  $('card').style.borderRadius = w * 3.18 / CARD.width + 'px';
}
function calibrate(message = '', reason = 'recalibration') {
  if (mode === 'experiment') { resumeAfterCalibration = true; interrupt(reason); }
  calibrationGeneration++;
  clearTimeout(itiTimer);
  fingerprint = null;
  $('calibration-notice').textContent = message;
  show('calibration');
  updateCard($('card-size').value);
}
function confirmCard() {
  const width = $('card').getBoundingClientRect().width;
  scale = pixelsPerMm(width);
  fingerprint = snapshot();
  const record = {card_width_px: width, pixels_per_mm: scale, at: now(), environment: environment()};
  session.calibration = record; session.calibration_history.push(record); persist();
  $('one-mm').style.width = 40 * scale + 'px'; $('one-mm').style.height = scale + 'px';
  $('ruler').style.width = 50 * scale + 'px';
  show('verification');
}
function describeFit() {
  const need = requiredPixels(scale);
  return 'Available space: ' + Math.floor(innerWidth) + ' × ' + Math.floor(innerHeight) + ' pixels. At your calibration the study needs ' + need.width + ' × ' + need.height + '.';
}
function checkFit() {
  const blockedBefore = !$('fit-overlay').hidden;
  const blocked = mode === 'experiment' && !fits(scale, innerWidth, innerHeight);
  $('fit-overlay').hidden = !blocked;
  $('experiment').inert = blocked;
  if (blocked) {
    $('fit-message').textContent = describeFit() + ' ' + (document.fullscreenElement ? 'You are already in full screen. If the card match is correct, a larger display is needed.' : 'Try full screen, or make the browser window larger.');
    if (!blockedBefore) interrupt('insufficient-space');
  } else if (blockedBefore && mode === 'experiment' && current) {
    represent();
  }
  if (mode === 'instructions') $('instructions-notice').textContent = scale && !fits(scale, innerWidth, innerHeight) ? describeFit() + ' Use full screen or a larger window before starting; the objects are never shrunk to fit.' : '';
  document.querySelectorAll('.fullscreen').forEach(b => { b.disabled = !!document.fullscreenElement; b.textContent = document.fullscreenElement ? 'Already full screen' : 'Full screen'; });
}
async function fullscreen() {
  try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); }
  catch {
    const mac = /Mac|iPad|iPhone/.test(navigator.platform || '') || /Macintosh/.test(navigator.userAgent);
    const text = 'Full screen is unavailable here. Use your browser’s full-screen command' + (mac ? '' : ' (often F11)') + ' or open this page in its own tab.';
    notice(mode === 'experiment' ? describeFit() + ' ' + text : text);
  }
}
// Calibration is invalidated by a zoom or screen change. Chrome, Edge and
// Firefox change devicePixelRatio on page zoom; Safari does not, so a change
// of the viewport width at an unchanged window width is also treated as zoom.
function environmentChanged() {
  if (fingerprint) {
    const after = snapshot();
    if (changedScreen(fingerprint, after) || zoomSuspected(fingerprint, after)) {
      if (['verification', 'instructions', 'experiment'].includes(mode)) calibrate('The screen or zoom changed. Please match the card again.', 'screen-change');
      else fingerprint = null;
      return;
    }
    fingerprint = {...fingerprint, innerWidth: after.innerWidth, outerWidth: after.outerWidth, fullscreen: after.fullscreen};
  }
  if (mode === 'calibration') updateCard($('card-size').value);
  checkFit();
}

// ---------- images ----------
// Resolves true when the image has loaded and decoded, false on a load error
// or when decoding does not settle. The network fetch itself is not timed:
// slow connections just take longer.
function loadImage(img) {
  return new Promise(resolve => {
    let settled = false, timer = 0;
    const done = ok => { if (!settled) { settled = true; clearTimeout(timer); resolve(ok); } };
    const decode = () => {
      timer = setTimeout(() => done(false), DECODE_TIMEOUT_MS);
      (img.decode ? img.decode() : Promise.resolve()).then(() => done(true), () => done(false));
    };
    img.addEventListener('error', () => done(false), {once: true});
    if (img.complete && img.naturalWidth !== 0) decode();
    else img.addEventListener('load', decode, {once: true});
  });
}
// Loads and decodes every stimulus once. Resolves true on success; on failure
// the message is shown on the visible screen and the participant can retry.
function preload() {
  if (decodedAssets) return decodedAssets;
  notice('Loading objects…');
  $('start').disabled = true;
  decodedAssets = Promise.all(allAssetIds().map(id => { const img = new Image(); img.src = assets[id].src; return loadImage(img).then(ok => ok ? null : id); })).then(results => {
    const failed = results.filter(Boolean);
    $('start').disabled = false;
    if (failed.length) { notice('Some objects could not be loaded. Check your connection, then press ' + (mode === 'instructions' ? 'Start' : 'Looks right') + ' to try again.'); logEvent('preload-failed', {failed}); decodedAssets = null; return false; }
    notice('');
    return true;
  });
  return decodedAssets;
}

// ---------- trials ----------
function object(assetId, label) {
  const asset = assets[assetId];
  const size = dimensions(asset, scale);
  const el = document.createElement(label === 'A' ? 'div' : 'button');
  el.className = 'object' + (label === 'A' ? ' reference' : '');
  el.style.width = size.width + 'px'; el.style.height = size.height + 'px';
  const [x, y] = STAGE.positions[label];
  el.style.left = x * scale + 'px'; el.style.top = y * scale + 'px';
  el.dataset.asset = assetId; el.dataset.widthMm = asset.widthMm; el.dataset.heightMm = asset.heightMm;
  const text = document.createElement('span');
  text.className = 'label'; text.textContent = label;
  text.style.top = -LABEL.offsetAboveMm * scale + 'px'; text.style.fontSize = LABEL.fontSizeMm * scale + 'px';
  const img = document.createElement('img');
  img.src = asset.src; img.alt = ''; img.draggable = false;
  el.append(text, img);
  if (label === 'A') el.setAttribute('aria-label', 'Reference A');
  else {
    el.type = 'button'; el.tabIndex = -1; // keyboard responses go through the arrow keys only
    el.setAttribute('aria-label', 'Choose ' + label);
    el.addEventListener('click', e => choose(label === 'B' ? 'left' : 'right', e.detail === 0 ? 'keyboard' : 'pointer'));
  }
  return el;
}
function interrupt(type) {
  if (!current) return;
  current.interruptions.push({type, at: now(), after_onset_ms: current.ready ? Math.round(perf() - current.onsetPerf) : null});
  current.ready = false;
  $('stage').classList.add('blank');
  logEvent('interruption', {interruption: type});
}
// Draw the presentation at session.trials.length. Response timing starts in
// the animation frame that first paints the objects, after every image has
// loaded and decoded.
async function present() {
  clearTimeout(itiTimer);
  const index = session.trials.length;
  if (index >= session.sequence.length) return finish();
  const p = session.sequence[index];
  if (!current || current.index !== index) current = {index, attempts: 0, interruptions: [], ready: false};
  current.attempts++; current.ready = false;
  const token = current.token = Symbol();
  const stage = $('stage');
  stage.replaceChildren();
  stage.classList.add('blank');
  stage.style.width = STAGE.width * scale + 'px'; stage.style.height = STAGE.height * scale + 'px';
  const nodes = [object(p.reference_asset_id, 'A'), object(p.left_asset_id, 'B'), object(p.right_asset_id, 'C')];
  stage.append(...nodes);
  $('progress').textContent = `${index + 1} / ${session.sequence.length}`;
  $('trial-notice').textContent = '';
  const wasBlocked = !$('fit-overlay').hidden; // a block that began during the inter-trial blank, when nothing could record it
  show('experiment');
  if (!$('fit-overlay').hidden) { if (wasBlocked) interrupt('insufficient-space'); return; }
  const loaded = await Promise.all(nodes.map(n => loadImage(n.querySelector('img'))));
  if (current?.token !== token || mode !== 'experiment' || !$('fit-overlay').hidden) return;
  if (loaded.some(ok => !ok)) {
    interrupt('image-error');
    $('trial-notice').textContent = 'Loading objects… If this message stays, check your connection.';
    itiTimer = setTimeout(present, IMAGE_RETRY_MS);
    return;
  }
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (current?.token !== token || mode !== 'experiment' || !$('fit-overlay').hidden) return;
  stage.classList.remove('blank');
  requestAnimationFrame(() => {
    if (current?.token !== token) return;
    current.onsetPerf = perf(); current.onsetIso = now(); current.ready = true;
  });
}
function represent() { if (current) present(); }
function choose(side, method) {
  if (mode !== 'experiment' || !current?.ready || !$('fit-overlay').hidden) return;
  const responsePerf = perf();
  const p = session.sequence[current.index];
  const mm = id => assets[id];
  session.trials.push({
    ...p,
    chosen_side: side, chosen_label: side === 'left' ? 'B' : 'C', chosen_condition: side === 'left' ? p.left_condition : p.right_condition,
    chosen_asset_id: side === 'left' ? p.left_asset_id : p.right_asset_id,
    response_method: method,
    reaction_time_ms: Math.round((responsePerf - current.onsetPerf) * 10) / 10,
    stimulus_onset_iso: current.onsetIso, response_iso: now(),
    attempts: current.attempts, interruptions: current.interruptions,
    pixels_per_mm: scale, viewport: {inner_width: innerWidth, inner_height: innerHeight, fullscreen: !!document.fullscreenElement},
    reference_width_mm: mm(p.reference_asset_id).widthMm, reference_height_mm: mm(p.reference_asset_id).heightMm,
    left_width_mm: mm(p.left_asset_id).widthMm, left_height_mm: mm(p.left_asset_id).heightMm,
    right_width_mm: mm(p.right_asset_id).widthMm, right_height_mm: mm(p.right_asset_id).heightMm,
  });
  current = null;
  if (session.trials.length >= session.sequence.length) markComplete();
  persist();
  $('stage').classList.add('blank');
  itiTimer = setTimeout(present, design().interTrialIntervalMs);
}
async function start() {
  if (starting) return;
  if (!fingerprint || changedScreen(fingerprint, snapshot())) return calibrate('The screen or zoom changed. Please match the card again.', 'screen-change');
  starting = true;
  const generation = calibrationGeneration;
  $('to-instructions').disabled = true;
  let loaded = false;
  try { loaded = await preload(); } finally { starting = false; $('to-instructions').disabled = false; }
  if (generation !== calibrationGeneration) return; // the participant recalibrated while loading
  if (!loaded) return;
  resumeAfterCalibration = false;
  if (!session.first_trial_at) { session.first_trial_at = now(); persist(); }
  present();
}

// ---------- completion & submission ----------
// A beacon's delivery cannot be observed, so only a fetch response counts as a
// confirmed send.
const confirmedSend = () => session.submissions.some(s => s.ok && !String(s.status).startsWith('beacon'));
function markComplete() {
  if (session.completion_status === 'complete') return;
  session.completion_status = 'complete'; session.ended_at = now(); session.environment_at_end = environment();
}
async function finish() {
  current = null;
  markComplete(); persist();
  show('complete');
  if (confirmedSend()) showSaved(); else await submit('complete');
}
function showSaved(alreadyDone = false) {
  const code = config.completion.code || session.session_id;
  $('submit-status').textContent = alreadyDone ? 'You have already completed this study. Thank you.'
    : config.storage.mode === 'local' ? 'Your responses are complete. Please download the file below and send it to the researcher.' : 'Your responses have been saved.';
  $('completion-code').hidden = false; $('completion-code').textContent = 'Completion code: ' + code;
  if (config.completion.redirectUrl) { $('redirect-link').hidden = false; $('redirect-link').href = config.completion.redirectUrl; }
  $('complete-note').textContent = 'You can close this page.';
  $('retry-submit').hidden = true;
  $('download-json').hidden = $('download-csv').hidden = !config.storage.allowDownload;
}
async function submit(status) {
  if (submitting) return;
  submitting = true;
  $('retry-submit').disabled = true;
  $('download-json').hidden = true; $('download-csv').hidden = true; $('redirect-link').hidden = true; $('completion-code').hidden = true;
  $('submit-status').textContent = config.storage.mode === 'local' ? '' : 'Saving your responses…';
  const result = await submitSession(session, config, {status});
  session.submissions.push({...result, status_sent: status, attempt: session.submissions.length + 1, at: now()});
  persist();
  submitting = false;
  $('retry-submit').disabled = false;
  if (result.ok) { showSaved(); return; }
  $('submit-status').textContent = 'Your responses could not be sent (' + result.status + '). Please try again, or download the file and send it to the researcher' + (config.study.contactEmail ? ' at ' + config.study.contactEmail : '') + '.';
  $('retry-submit').hidden = false;
  $('download-json').hidden = false; $('download-csv').hidden = false;
  $('complete-note').textContent = session.storage_available ? 'Your responses remain stored in this browser until they have been sent.' : 'This browser cannot store the responses, so please download the file before closing the page.';
}
// Interim record on leaving mid-study (only after at least one response; a
// completed record is sent as 'complete' if the final send has not happened).
function leaving() {
  if (!session || !config.storage.submitPartialOnLeave) return;
  if (session.trials.length === 0 || confirmedSend()) return;
  const status = session.completion_status === 'complete' ? 'complete' : 'abandoned';
  const result = beaconSession(session, config, status);
  session.submissions.push({...result, status_sent: status, attempt: session.submissions.length + 1, at: now()});
  persist();
}

// ---------- wiring ----------
function init() {
  const url = new URL(location.href);
  if (url.searchParams.get('reset') === '1') clearSession(KEY);
  const existing = loadSession(KEY);
  if (resumable(existing)) {
    session = existing;
    session.storage_available = storageAvailable();
    if (session.completion_status === 'complete') {
      show('complete');
      if (confirmedSend()) showSaved(true); else submit('complete');
      return;
    }
    $('resume-notice').hidden = false;
    $('resume-notice').textContent = `Welcome back. You have answered ${session.trials.length} of ${session.sequence.length} screens. Continue to carry on where you left off; your screen needs to be matched again first.`;
    $('consent').checked = true;
    logEvent('resumed');
  } else {
    session = newSession();
    persist();
  }
  $('study-title').textContent = config.study.title; document.title = config.study.title;
  $('duration').textContent = String(config.study.durationMinutes);
  $('trial-count').textContent = String(session.sequence.length);
  $('pid-note').textContent = session.participant_id ? ' Your responses are stored under the participant identifier in your study link.' : '';
  $('storage-note').textContent = session.storage_available ? '' : 'This browser does not allow the page to store progress, so please do not reload or close it until you have finished.';
  $('consent-row').hidden = !config.study.requireConsentCheckbox;
  $('begin').disabled = config.study.requireConsentCheckbox && !$('consent').checked;
  const contact = [config.study.researcher, config.study.institution].filter(Boolean).join(', ');
  $('contact-line').textContent = [contact && 'This study is run by ' + contact + '.', config.study.ethicsReference && 'Ethics reference: ' + config.study.ethicsReference + '.', config.study.contactEmail && 'Questions: ' + config.study.contactEmail + '.'].filter(Boolean).join(' ');
  $('version-line').textContent = 'Protocol ' + config.protocolVersion + ' · stimulus set ' + config.stimulusSetVersion;
  updateCard(324);
  show('information');
}

$('consent').addEventListener('change', e => { $('begin').disabled = !e.target.checked; });
$('begin').onclick = () => { if (!session.consented_at) session.consented_at = now(); logEvent('consented'); calibrate(); };
$('card-size').addEventListener('input', e => updateCard(e.target.value));
$('smaller').onclick = () => updateCard(Number($('card-size').value) - 1);
$('larger').onclick = () => updateCard(Number($('card-size').value) + 1);
$('confirm-card').onclick = confirmCard;
$('adjust-again').onclick = () => calibrate();
$('to-instructions').onclick = () => { if (resumeAfterCalibration || session.trials.length) { start(); } else { show('instructions'); preload(); } };
$('verification-notice').textContent = '';
$('start').onclick = start;
$('recalibrate').onclick = () => calibrate();
$('fit-calibrate').onclick = () => calibrate();
$('retry-submit').onclick = () => submit('complete');
$('download-json').onclick = () => download(`line-similarity-${session.session_id}.json`, JSON.stringify(session, null, 2), 'application/json');
$('download-csv').onclick = () => download(`line-similarity-${session.session_id}.csv`, trialsToCsv(session), 'text/csv');
document.querySelectorAll('.fullscreen').forEach(b => b.onclick = fullscreen);
window.addEventListener('resize', environmentChanged);
window.visualViewport?.addEventListener('resize', environmentChanged);
document.addEventListener('fullscreenchange', environmentChanged);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (mode === 'experiment') interrupt('hidden'); return; }
  const token = current?.token;
  environmentChanged(); // may itself re-present when a fit block has just cleared
  if (mode === 'experiment' && current && !current.ready && current.token === token && $('fit-overlay').hidden) represent();
});
window.addEventListener('focus', environmentChanged);
window.addEventListener('pagehide', leaving);
document.addEventListener('keydown', e => {
  if (mode !== 'experiment' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const {left, right} = design().keys;
  if (left.includes(e.key)) { e.preventDefault(); choose('left', 'keyboard'); }
  else if (right.includes(e.key)) { e.preventDefault(); choose('right', 'keyboard'); }
});
// Read-only view of the running state for tests and debugging. It cannot
// calibrate the screen or answer a question.
globalThis.lineSimilarityState = () => ({
  mode, calibrated: !!fingerprint, pixelsPerMm: scale || null,
  session_id: session?.session_id, participant_id: session?.participant_id, completed: session?.trials.length ?? 0, total: session?.sequence.length ?? 0,
  presentation: current ? session.sequence[current.index] : null, ready: !!current?.ready, attempts: current?.attempts ?? 0,
  interruptions: current?.interruptions.map(i => i.type) ?? [], storage_available: session?.storage_available ?? null,
});
try { init(); }
catch (e) {
  $('resume-notice').hidden = false;
  $('resume-notice').textContent = 'This study is not configured correctly: ' + (e?.message ?? e) + '. Please tell the researcher.';
  $('begin').disabled = true;
  show('information');
}

import {assets} from './stimuli.js';
import {config} from './config.js';
import {CARD, STAGE, LABEL, pixelsPerMm, dimensions, fits, requiredPixels, changedScreen} from './geometry.js';
import {buildSequence, allAssetIds} from './design.js';
import {loadSession, saveSession, clearSession, randomId, trialsToCsv, submitSession, download} from './storage.js';

const $ = id => document.getElementById(id);
const KEY = config.storage.localKey;
const SECTIONS = ['information', 'calibration', 'verification', 'instructions', 'experiment', 'complete'];
const now = () => new Date().toISOString();
const perf = () => (globalThis.performance?.now ? performance.now() : Date.now());

let mode = 'information';
let session = null;      // persisted record (see docs/EXPERIMENT_DATA.md)
let scale = 0;           // CSS pixels per millimetre from the card match
let fingerprint = null;  // reported screen properties at calibration
let current = null;      // the presentation on screen: {index, attempts, interruptions, onsetPerf, onsetIso, ready}
let resumeAfterCalibration = false;
let decodedAssets = null; // Promise resolving when every SVG is decoded
let itiTimer = 0;

// ---------- environment & session records ----------
const snapshot = () => ({dpr: devicePixelRatio, screenWidth: screen.width, screenHeight: screen.height, visualScale: window.visualViewport?.scale ?? 1});
function environment() {
  return {
    timestamp: now(), device_pixel_ratio: devicePixelRatio,
    screen_width: screen.width, screen_height: screen.height, screen_avail_width: screen.availWidth, screen_avail_height: screen.availHeight,
    inner_width: innerWidth, inner_height: innerHeight, visual_viewport_scale: window.visualViewport?.scale ?? 1,
    fullscreen: !!document.fullscreenElement, user_agent: navigator.userAgent, language: navigator.language, color_depth: screen.colorDepth,
  };
}
function persist() { if (session) saveSession(KEY, session); }
function logEvent(type, data = {}) {
  if (!session) return;
  session.events.push({type, at: now(), t: Math.round(perf()), presentation_index: current?.index ?? null, ...data});
  persist();
}
function newSession() {
  const url = new URL(location.href);
  const participant_id = config.participant.idParams.map(k => url.searchParams.get(k)).find(Boolean) ?? null;
  const url_parameters = {};
  for (const k of config.participant.passthroughParams) if (url.searchParams.has(k)) url_parameters[k] = url.searchParams.get(k);
  const seed = (globalThis.crypto?.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 2 ** 32)) >>> 0;
  return {
    schema_version: 1, session_id: randomId(), participant_id, url_parameters,
    protocol_version: config.protocolVersion, stimulus_set_version: config.stimulusSetVersion, layout_version: config.layoutVersion,
    consent_version: config.study.consentVersion,
    design: {...config.design, seed}, sequence: buildSequence(config.design, seed),
    stage_mm: STAGE, label_mm: LABEL, card_mm: CARD,
    started_at: now(), consented_at: null, ended_at: null, completion_status: 'in_progress',
    calibration: null, calibration_history: [], environment_at_start: environment(),
    trials: [], events: [], submissions: [],
  };
}

// ---------- screens ----------
function show(next) {
  mode = next;
  for (const id of SECTIONS) $(id).hidden = id !== next;
  checkFit();
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
    const text = 'Full screen is unavailable here. Use your browser’s full-screen command (often F11) or open this page in its own tab.';
    $('calibration-notice').textContent = text;
    if (mode === 'experiment') $('fit-message').textContent = describeFit() + ' ' + text;
  }
}
function environmentChanged() {
  if (fingerprint && changedScreen(fingerprint, snapshot())) {
    calibrate('The screen or zoom changed. Please match the card again.', 'screen-change');
    return;
  }
  if (mode === 'calibration') updateCard($('card-size').value);
  checkFit();
}

// ---------- preloading ----------
function preload() {
  if (decodedAssets) return decodedAssets;
  $('preload-status').textContent = 'Loading objects…';
  $('start').disabled = true;
  decodedAssets = Promise.all(allAssetIds().map(id => new Promise(resolve => {
    const img = new Image();
    img.onload = () => (img.decode ? img.decode() : Promise.resolve()).then(resolve, resolve);
    img.onerror = () => resolve('error:' + id);
    img.src = assets[id].src;
  }))).then(results => {
    const failed = results.filter(r => typeof r === 'string');
    if (failed.length) { $('preload-status').textContent = 'Some objects could not be loaded. Check your connection and reload the page.'; logEvent('preload-failed', {failed}); return false; }
    $('preload-status').textContent = '';
    $('start').disabled = false;
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
  else { el.type = 'button'; el.setAttribute('aria-label', 'Choose ' + label); el.addEventListener('click', () => choose(label === 'B' ? 'left' : 'right', 'pointer')); }
  return el;
}
function interrupt(type) {
  if (!current) return;
  current.interruptions.push({type, at: now(), after_onset_ms: current.ready ? Math.round(perf() - current.onsetPerf) : null});
  current.ready = false;
  logEvent('interruption', {interruption: type});
}
// Draw the presentation at session.trials.length. Response timing starts only
// after every image is decoded and two frames have been painted.
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
  show('experiment');
  await Promise.all(nodes.map(n => { const img = n.querySelector('img'); return img.decode ? img.decode().catch(() => {}) : Promise.resolve(); }));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (current?.token !== token || mode !== 'experiment' || !$('fit-overlay').hidden) return;
  stage.classList.remove('blank');
  current.onsetPerf = perf(); current.onsetIso = now(); current.ready = true;
}
function represent() { if (current) present(); }
function choose(side, method) {
  if (mode !== 'experiment' || !current?.ready || !$('fit-overlay').hidden) return;
  const responsePerf = perf();
  const p = session.sequence[current.index];
  const chosen_condition = side === 'left' ? p.left_condition : p.right_condition;
  const mm = id => assets[id];
  session.trials.push({
    ...p,
    chosen_side: side, chosen_label: side === 'left' ? 'B' : 'C', chosen_condition,
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
  persist();
  $('stage').classList.add('blank');
  itiTimer = setTimeout(present, config.design.interTrialIntervalMs);
}
function start() {
  if (!fingerprint || changedScreen(fingerprint, snapshot())) return calibrate('The screen or zoom changed. Please match the card again.', 'screen-change');
  resumeAfterCalibration = false;
  if (!session.first_trial_at) { session.first_trial_at = now(); persist(); }
  present();
}

// ---------- completion & submission ----------
async function finish() {
  current = null;
  if (session.completion_status !== 'complete') { session.completion_status = 'complete'; session.ended_at = now(); session.environment_at_end = environment(); persist(); }
  show('complete');
  await submit('complete');
}
async function submit(status) {
  const code = config.completion.code || session.session_id;
  $('retry-submit').hidden = true; $('download-json').hidden = true; $('download-csv').hidden = true; $('redirect-link').hidden = true; $('completion-code').hidden = true;
  $('submit-status').textContent = config.storage.mode === 'local' ? '' : 'Saving your responses…';
  const result = await submitSession(session, config, {status});
  session.submissions.push({...result, status_sent: status, at: now()});
  persist();
  if (result.ok) {
    $('submit-status').textContent = config.storage.mode === 'local' ? 'Your responses are complete. Please download the file below and send it to the researcher.' : 'Your responses have been saved.';
    $('completion-code').hidden = false; $('completion-code').textContent = 'Completion code: ' + code;
    if (config.completion.redirectUrl) { $('redirect-link').hidden = false; $('redirect-link').href = config.completion.redirectUrl; }
    $('complete-note').textContent = 'You can close this page.';
  } else {
    $('submit-status').textContent = 'Your responses could not be sent (' + result.status + '). Please try again, or download the file and send it to the researcher' + (config.study.contactEmail ? ' at ' + config.study.contactEmail : '') + '.';
    $('retry-submit').hidden = false;
    $('complete-note').textContent = 'Your responses remain stored in this browser until they have been sent.';
  }
  if (config.storage.allowDownload || !result.ok) { $('download-json').hidden = false; $('download-csv').hidden = false; }
}
function leaving() {
  if (!session || !config.storage.submitPartialOnLeave) return;
  if (session.completion_status !== 'in_progress' || session.trials.length === 0) return;
  session.submissions.push({status_sent: 'abandoned', status: 'beacon-attempted', at: now()}); persist();
  submitSession(session, config, {status: 'abandoned', beacon: true});
}

// ---------- wiring ----------
function init() {
  const url = new URL(location.href);
  if (url.searchParams.get('reset') === '1') clearSession(KEY);
  const existing = loadSession(KEY);
  if (existing && existing.protocol_version === config.protocolVersion && existing.schema_version === 1) {
    session = existing;
    if (session.completion_status === 'complete') {
      show('complete');
      const sent = session.submissions.some(s => s.ok);
      if (sent) {
        $('submit-status').textContent = 'You have already completed this study. Thank you.';
        $('completion-code').hidden = false; $('completion-code').textContent = 'Completion code: ' + (config.completion.code || session.session_id);
        if (config.completion.redirectUrl) { $('redirect-link').hidden = false; $('redirect-link').href = config.completion.redirectUrl; }
        if (config.storage.allowDownload) { $('download-json').hidden = false; $('download-csv').hidden = false; }
      } else submit('complete');
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
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (mode === 'experiment') interrupt('hidden'); } else environmentChanged(); });
window.addEventListener('focus', environmentChanged);
window.addEventListener('pagehide', leaving);
document.addEventListener('keydown', e => {
  if (mode !== 'experiment' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const {left, right} = config.design.keys;
  if (left.includes(e.key)) { e.preventDefault(); choose('left', 'keyboard'); }
  else if (right.includes(e.key)) { e.preventDefault(); choose('right', 'keyboard'); }
});
// Read-only view of the running state for tests and debugging. It cannot
// calibrate the screen or answer a question.
globalThis.lineSimilarityState = () => ({
  mode, calibrated: !!fingerprint, pixelsPerMm: scale || null,
  session_id: session?.session_id, completed: session?.trials.length ?? 0, total: session?.sequence.length ?? 0,
  presentation: current ? session.sequence[current.index] : null, ready: !!current?.ready, attempts: current?.attempts ?? 0,
});
init();

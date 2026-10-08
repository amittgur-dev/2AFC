// Persistence and submission. Sessions are saved to localStorage after every
// response so a reload or crash loses at most the current trial, and are sent
// to the configured destination at completion (and, optionally, on leaving).

export function loadSession(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function saveSession(key, session) {
  try { localStorage.setItem(key, JSON.stringify(session)); return true; } catch { return false; }
}
export function clearSession(key) {
  try { localStorage.removeItem(key); } catch {}
}
// Whether this browser lets the page persist anything (false in some private
// modes or when site data is blocked).
export function storageAvailable() {
  try { const k = '__line-similarity-probe__'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch { return false; }
}

export function randomId(length = 16) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(length);
  (globalThis.crypto ?? {getRandomValues: a => a.map(() => Math.random() * 256)}).getRandomValues(bytes);
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
}

const TRIAL_COLUMNS = [
  'experiment_id', 'session_id', 'participant_id', 'protocol_version', 'stimulus_set_version', 'layout_version',
  'presentation_index', 'trial_id', 'family_id', 'family_name', 'group', 'repetition_index',
  'reference_asset_id', 'left_asset_id', 'right_asset_id', 'left_condition', 'right_condition', 'side_assignment',
  'chosen_side', 'chosen_condition', 'chosen_asset_id', 'response_method', 'reaction_time_ms',
  'stimulus_onset_iso', 'response_iso', 'attempts', 'interruptions', 'pixels_per_mm',
  'reference_width_mm', 'reference_height_mm', 'left_width_mm', 'left_height_mm', 'right_width_mm', 'right_height_mm',
];
// Text that starts with = + - @ tab or CR is prefixed with an apostrophe so a
// spreadsheet does not evaluate it as a formula (URL-supplied ids reach the CSV).
const csvCell = v => {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export function trialsToCsv(session) {
  const rows = session.trials.map(t => ({
    experiment_id: session.experiment_id, session_id: session.session_id, participant_id: session.participant_id,
    protocol_version: session.protocol_version, stimulus_set_version: session.stimulus_set_version, layout_version: session.layout_version,
    ...t, interruptions: t.interruptions?.length ? t.interruptions : '',
  }));
  return [TRIAL_COLUMNS.join(','), ...rows.map(r => TRIAL_COLUMNS.map(c => csvCell(r[c])).join(','))].join('\n') + '\n';
}

// Browsers cap keepalive fetches and sendBeacon payloads at 64 KiB in total.
export const BEACON_LIMIT_BYTES = 60000;
// A smaller record for the beacon path: the trials and identifiers, without
// the per-trial copies of the presentation fields and without the sequence
// (which buildDesign(design, seed) reproduces) or the event log.
export function compactRecord(session, status) {
  const {sequence, events, ...rest} = session;
  const seqKeys = new Set(Object.keys(sequence[0] ?? {}));
  const trials = session.trials.map(t => Object.fromEntries(Object.entries(t).filter(([k]) => k === 'presentation_index' || k === 'trial_id' || !seqKeys.has(k))));
  return {...rest, trials, completion_status: status, compact: true, event_count: events.length};
}
function formBody(session, config, status, record = {...session, completion_status: status}) {
  const params = new URLSearchParams();
  params.set('form-name', config.storage.formName);
  params.set('experiment_id', session.experiment_id ?? '');
  params.set('session_id', session.session_id);
  params.set('participant_id', session.participant_id ?? '');
  params.set('protocol_version', session.protocol_version);
  params.set('stimulus_set_version', session.stimulus_set_version);
  params.set('completion_status', status);
  params.set('trials_completed', String(session.trials.length));
  params.set('trials_total', String(session.sequence.length));
  params.set('started_at', session.started_at ?? '');
  params.set('ended_at', session.ended_at ?? '');
  params.set('pixels_per_mm', String(session.calibration?.pixels_per_mm ?? ''));
  params.set('payload', JSON.stringify(record));
  return params.toString();
}

// Smallest record for the beacon path: identifiers, calibration summary and
// one compact row per trial. Everything else is derivable or diagnostic.
export function minimalRecord(session, status) {
  const c = compactRecord(session, status);
  const {calibration_history, environment_at_start, environment_at_end, ...rest} = c;
  return {
    ...rest, minimal: true,
    calibration: c.calibration ? {card_width_px: c.calibration.card_width_px, pixels_per_mm: c.calibration.pixels_per_mm, at: c.calibration.at} : null,
    trials: c.trials.map(t => ({
      presentation_index: t.presentation_index, trial_id: t.trial_id, chosen_side: t.chosen_side, chosen_condition: t.chosen_condition, chosen_asset_id: t.chosen_asset_id,
      response_method: t.response_method, reaction_time_ms: t.reaction_time_ms, response_iso: t.response_iso, attempts: t.attempts, interruption_count: t.interruptions?.length ?? 0,
    })),
  };
}
// ---------- Supabase (per-experiment tables, see supabase/migrations) ----------
// One row per send for the *_sessions table.
export function sessionRow(session, status, record = {...session, completion_status: status}) {
  return {
    session_id: session.session_id, attempt: session.submissions.length + 1,
    experiment_id: session.experiment_id, experiment_name: session.experiment_name ?? null, participant_id: session.participant_id ?? null,
    url_parameters: session.url_parameters ?? null,
    protocol_version: session.protocol_version, stimulus_set_version: session.stimulus_set_version, layout_version: session.layout_version,
    submitted_status: status, completion_status: session.completion_status,
    trials_completed: session.trials.length, trials_total: session.sequence.length,
    started_at: session.started_at ?? null, consented_at: session.consented_at ?? null, first_trial_at: session.first_trial_at ?? null, ended_at: session.ended_at ?? null,
    pixels_per_mm: session.calibration?.pixels_per_mm ?? null, card_width_px: session.calibration?.card_width_px ?? null,
    design: session.design ?? null, calibration: session.calibration ?? null,
    environment_at_start: session.environment_at_start ?? null, environment_at_end: session.environment_at_end ?? null,
    storage_available: session.storage_available ?? null,
    age: session.demographics?.age ?? null, gender: session.demographics?.gender ?? null,
    record,
  };
}
// One row per answered screen for the *_trials table. `essential` drops the
// diagnostic columns so a leaving-page send stays small.
export function trialRows(session, {essential = false} = {}) {
  return session.trials.map(t => ({
    session_id: session.session_id, experiment_id: session.experiment_id, participant_id: session.participant_id ?? null,
    presentation_index: t.presentation_index, trial_id: t.trial_id, family_id: t.family_id, family_name: t.family_name ?? null, group_name: t.group ?? null, repetition_index: t.repetition_index ?? 0,
    reference_asset_id: t.reference_asset_id, left_asset_id: t.left_asset_id, right_asset_id: t.right_asset_id,
    left_condition: t.left_condition, right_condition: t.right_condition, side_assignment: t.side_assignment,
    chosen_side: t.chosen_side, chosen_label: t.chosen_label, chosen_condition: t.chosen_condition, chosen_asset_id: t.chosen_asset_id,
    response_method: t.response_method, reaction_time_ms: t.reaction_time_ms,
    stimulus_onset_at: t.stimulus_onset_iso, response_at: t.response_iso, attempts: t.attempts,
    interruptions: essential ? (t.interruptions?.length ? t.interruptions.map(i => i.type) : null) : (t.interruptions ?? null),
    pixels_per_mm: t.pixels_per_mm,
    ...(essential ? {} : {
      viewport: t.viewport ?? null,
      reference_width_mm: t.reference_width_mm, reference_height_mm: t.reference_height_mm,
      left_width_mm: t.left_width_mm, left_height_mm: t.left_height_mm, right_width_mm: t.right_width_mm, right_height_mm: t.right_height_mm,
    }),
  }));
}
function supabaseConfigured(config) { const sb = config.storage.supabase; return !!(sb && sb.url && sb.anonKey && sb.sessionsTable && sb.trialsTable); }
// Sends rows to the database function record_rows(p_table, p_rows), which
// inserts them with the owner's rights and ignores rows that already exist.
// The anon key has no direct table access (see supabase/migrations).
function supabaseInsert(config, table, rows, {keepalive = false} = {}) {
  const sb = config.storage.supabase;
  const url = sb.url.replace(/\/+$/, '') + '/rest/v1/rpc/record_rows';
  const body = JSON.stringify({p_table: table, p_rows: rows});
  // A classic anon key is a JWT and also goes in the Authorization header;
  // a newer publishable key (sb_publishable_...) goes in apikey only.
  const jwt = /^eyJ/.test(sb.anonKey);
  return {promise: fetch(url, {method: 'POST', keepalive, body, headers: {
    apikey: sb.anonKey, ...(jwt ? {Authorization: 'Bearer ' + sb.anonKey} : {}), 'Content-Type': 'application/json', Prefer: 'return=minimal',
  }}), bytes: body.length};
}
async function supabaseSubmit(session, config, status) {
  const sb = config.storage.supabase;
  let bytes = 0;
  const s = supabaseInsert(config, sb.sessionsTable, [sessionRow(session, status)]);
  bytes += s.bytes;
  const r1 = await s.promise;
  if (!r1.ok) return {ok: false, status: 'supabase-sessions-' + r1.status, detail: await r1.text().catch(() => ''), bytes};
  const rows = trialRows(session);
  if (rows.length) {
    const t = supabaseInsert(config, sb.trialsTable, rows);
    bytes += t.bytes;
    const r2 = await t.promise;
    if (!r2.ok) return {ok: false, status: 'supabase-trials-' + r2.status, detail: await r2.text().catch(() => ''), bytes};
  }
  return {ok: true, status: 'supabase', bytes};
}
// Leaving-page send: keepalive fetches (they carry the apikey header, which
// sendBeacon cannot). All keepalive bodies in flight share the 64 KiB cap, so
// the session row carries a compact record only if it fits, and the trial
// rows carry the essential columns.
function supabaseBeacon(session, config, status) {
  const sb = config.storage.supabase;
  const rows = trialRows(session, {essential: true});
  const trialsBody = JSON.stringify(rows);
  const size = text => new Blob([text]).size;
  if (size(trialsBody) + 2000 > BEACON_LIMIT_BYTES) return {ok: false, status: 'keepalive-too-large'};
  let record = null, label = 'keepalive-no-record';
  for (const [candidate, name] of [[compactRecord(session, status), 'keepalive-compact'], [minimalRecord(session, status), 'keepalive-minimal']]) {
    if (size(JSON.stringify(candidate)) + size(trialsBody) + 2000 <= BEACON_LIMIT_BYTES) { record = candidate; label = name; break; }
  }
  supabaseInsert(config, sb.sessionsTable, [sessionRow(session, status, record)], {keepalive: true}).promise.catch(() => {});
  if (rows.length) supabaseInsert(config, sb.trialsTable, rows, {keepalive: true}).promise.catch(() => {});
  return {ok: true, status: label, bytes: trialsBody.length};
}

function destination(config) {
  const mode = config.storage.mode;
  if (mode === 'local') return {skip: {ok: true, status: 'local', detail: 'Local-only mode; nothing sent.'}};
  if (mode === 'supabase') return supabaseConfigured(config) ? {target: 'supabase', mode} : {skip: {ok: false, status: 'unconfigured', detail: 'storage.supabase url, anonKey or table names are empty'}};
  if (mode === 'netlify-forms') return {target: location.pathname, mode};
  if (mode === 'endpoint') return config.storage.endpoint ? {target: config.storage.endpoint, mode} : {skip: {ok: false, status: 'unconfigured', detail: 'storage.endpoint is empty'}};
  return {skip: {ok: false, status: 'unknown-mode', detail: mode}};
}
const encode = (session, config, status, record, mode) => mode === 'netlify-forms'
  ? {body: formBody(session, config, status, record), type: 'application/x-www-form-urlencoded'}
  : {body: JSON.stringify(record), type: 'application/json'};

// Sends the session while the page is being left, synchronously, with
// navigator.sendBeacon (64 KiB cap). Tries the full record, then the compact
// and minimal ones; above the limit nothing is sent and the record stays in
// localStorage for the next visit. Returns {ok, status, bytes}; never throws.
// Every result carries unconfirmed: true because delivery cannot be observed;
// a later confirmed send (fetch with a response) is still needed.
export function beaconSession(session, config, status) {
  const {skip, target, mode} = destination(config);
  if (skip) return {...skip, unconfirmed: true};
  try {
    if (mode === 'supabase') return {...supabaseBeacon(session, config, status), unconfirmed: true};
    if (!navigator.sendBeacon) return {ok: false, status: 'beacon-unsupported', unconfirmed: true};
    for (const [record, label] of [[{...session, completion_status: status}, 'beacon'], [compactRecord(session, status), 'beacon-compact'], [minimalRecord(session, status), 'beacon-minimal']]) {
      const {body, type} = encode(session, config, status, record, mode);
      if (new Blob([body]).size > BEACON_LIMIT_BYTES) continue;
      const sent = navigator.sendBeacon(target, new Blob([body], {type}));
      return {ok: sent, status: sent ? label : label + '-failed', bytes: body.length, unconfirmed: true};
    }
    return {ok: false, status: 'beacon-too-large', unconfirmed: true};
  } catch (e) {
    return {ok: false, status: 'beacon-error', detail: String(e?.message ?? e), unconfirmed: true};
  }
}
// Sends the full session with a normal fetch (no size cap). Resolves to
// {ok, status, detail, bytes}; never throws.
export async function submitSession(session, config, {status = 'complete', beacon = false} = {}) {
  if (beacon) return beaconSession(session, config, status);
  const {skip, target, mode} = destination(config);
  if (skip) return skip;
  try {
    if (mode === 'supabase') return await supabaseSubmit(session, config, status);
    const {body, type} = encode(session, config, status, {...session, completion_status: status}, mode);
    const res = await fetch(target, {method: 'POST', headers: {'Content-Type': type}, body});
    return {ok: res.ok, status: String(res.status), detail: res.ok ? '' : await res.text().catch(() => ''), bytes: body.length};
  } catch (e) {
    return {ok: false, status: 'network-error', detail: String(e?.message ?? e)};
  }
}

export function download(filename, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type}));
  a.download = filename;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

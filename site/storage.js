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
  'session_id', 'participant_id', 'protocol_version', 'stimulus_set_version', 'layout_version',
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
    session_id: session.session_id, participant_id: session.participant_id,
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

// Sends the session. Resolves to {ok, status, detail}. Never throws.
// With beacon: true (used on pagehide) the request must be small: the full
// record is tried first, then the compact one; above the limit nothing is
// sent and the record stays in localStorage for the next visit.
export async function submitSession(session, config, {status = 'complete', beacon = false} = {}) {
  const mode = config.storage.mode;
  if (mode === 'local') return {ok: true, status: 'local', detail: 'Local-only mode; nothing sent.'};
  const target = mode === 'netlify-forms' ? location.pathname : mode === 'endpoint' ? config.storage.endpoint : null;
  if (mode === 'endpoint' && !target) return {ok: false, status: 'unconfigured', detail: 'storage.endpoint is empty'};
  if (!target) return {ok: false, status: 'unknown-mode', detail: mode};
  const encode = record => mode === 'netlify-forms'
    ? {body: formBody(session, config, status, record), type: 'application/x-www-form-urlencoded'}
    : {body: JSON.stringify(record), type: 'application/json'};
  try {
    if (beacon) {
      if (!navigator.sendBeacon) return {ok: false, status: 'beacon-unsupported'};
      for (const [record, label] of [[{...session, completion_status: status}, 'beacon'], [compactRecord(session, status), 'beacon-compact']]) {
        const {body, type} = encode(record);
        if (new Blob([body]).size > BEACON_LIMIT_BYTES) continue;
        const sent = navigator.sendBeacon(target, new Blob([body], {type}));
        return {ok: sent, status: sent ? label : label + '-failed', bytes: body.length};
      }
      return {ok: false, status: 'beacon-too-large'};
    }
    const {body, type} = encode({...session, completion_status: status});
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

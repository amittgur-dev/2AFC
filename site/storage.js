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
const csvCell = v => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
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

function formBody(session, config, status) {
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
  params.set('payload', JSON.stringify({...session, completion_status: status}));
  return params.toString();
}

// Sends the session. Resolves to {ok, status, detail}. Never throws.
export async function submitSession(session, config, {status = 'complete', beacon = false} = {}) {
  const mode = config.storage.mode;
  if (mode === 'local') return {ok: true, status: 'local', detail: 'Local-only mode; nothing sent.'};
  try {
    if (mode === 'netlify-forms') {
      const body = formBody(session, config, status);
      const url = location.pathname;
      if (beacon && navigator.sendBeacon) {
        const sent = navigator.sendBeacon(url, new Blob([body], {type: 'application/x-www-form-urlencoded'}));
        return {ok: sent, status: sent ? 'beacon' : 'beacon-failed'};
      }
      const res = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body, keepalive: true});
      return {ok: res.ok, status: String(res.status), detail: res.ok ? '' : await res.text().catch(() => '')};
    }
    if (mode === 'endpoint') {
      if (!config.storage.endpoint) return {ok: false, status: 'unconfigured', detail: 'storage.endpoint is empty'};
      const body = JSON.stringify({...session, completion_status: status});
      if (beacon && navigator.sendBeacon) {
        const sent = navigator.sendBeacon(config.storage.endpoint, new Blob([body], {type: 'application/json'}));
        return {ok: sent, status: sent ? 'beacon' : 'beacon-failed'};
      }
      const res = await fetch(config.storage.endpoint, {method: 'POST', headers: {'Content-Type': 'application/json'}, body, keepalive: true});
      return {ok: res.ok, status: String(res.status), detail: res.ok ? '' : await res.text().catch(() => '')};
    }
    return {ok: false, status: 'unknown-mode', detail: mode};
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

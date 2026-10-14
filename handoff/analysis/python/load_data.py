#!/usr/bin/env python3
"""Load, clean and annotate the exported Supabase tables of one experiment.

Works on CSV exports (Supabase Table Editor / SQL Editor download, or
supabase/pull_supabase.py) and on the JSON files pull_supabase.py writes.
Only pandas is required.

Command line:
  python3 load_data.py --exp 1 --sessions lines_with_edges_sessions.csv \
      --trials lines_with_edges_trials.csv --stimuli ../stimuli/exp1_lines_with_edges --out clean/
  python3 load_data.py --exp 2 --sessions similarity_with_rotation_sessions.csv \
      --trials similarity_with_rotation_trials.csv --stimuli ../stimuli/exp2_similarity_with_rotation --out clean/

writes <out>/sessions_clean.csv, <out>/trials_clean.csv and <out>/sends_all.csv
and prints a summary. Use --all-sessions to keep every complete session of a
participant instead of the earliest one. Pass the *_sessions table, not the
*_latest_sessions view: the script picks the latest attempt itself (both work).

As a module:
  from load_data import load_table, clean, attach_stimuli
  sessions = load_table('lines_with_edges_sessions.csv')
  trials = load_table('lines_with_edges_trials.csv')
  s, t, report = clean(sessions, trials)
  t = attach_stimuli(t, 1, '../stimuli/exp1_lines_with_edges')
"""
import argparse
import json
import os
import sys

import pandas as pd

JSON_COLUMNS = {'url_parameters', 'design', 'calibration', 'environment_at_start', 'environment_at_end', 'record', 'interruptions', 'viewport'}
BOOL_COLUMNS = {'storage_available'}
TIME_COLUMNS = {'created_at', 'started_at', 'consented_at', 'first_trial_at', 'ended_at', 'stimulus_onset_at', 'response_at'}
INT_COLUMNS = {'attempt', 'trials_completed', 'trials_total', 'age', 'presentation_index', 'family_id', 'repetition_index', 'attempts'}
FLOAT_COLUMNS = {'pixels_per_mm', 'card_width_px', 'reaction_time_ms', 'reference_width_mm', 'reference_height_mm',
                 'left_width_mm', 'left_height_mm', 'right_width_mm', 'right_height_mm'}


def _parse_json(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, (dict, list)):
        return v
    if isinstance(v, str):
        if v == '':
            return None
        return json.loads(v)
    return v


def _parse_bool(v):
    if isinstance(v, bool):
        return v
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    return {'t': True, 'f': False, 'true': True, 'false': False, '1': True, '0': False, '': None}[str(v).strip().lower()]


def load_table(path):
    """Read a *_sessions / *_trials / *_latest_sessions export (CSV or JSON) with typed columns."""
    if path.endswith('.json'):
        with open(path, encoding='utf-8') as f:
            df = pd.DataFrame(json.load(f))
    else:
        df = pd.read_csv(path, dtype=str, keep_default_na=False, na_values=[], encoding='utf-8')
        df = df.replace({'': None})
    for c in df.columns:
        if c in JSON_COLUMNS:
            df[c] = df[c].map(_parse_json)
        elif c in BOOL_COLUMNS:
            df[c] = df[c].map(_parse_bool)
        elif c in TIME_COLUMNS:
            df[c] = pd.to_datetime(df[c], utc=True, format='ISO8601')
        elif c in INT_COLUMNS:
            df[c] = pd.to_numeric(df[c], errors='coerce').astype('Int64')
        elif c in FLOAT_COLUMNS:
            df[c] = pd.to_numeric(df[c], errors='coerce')
    return df


def latest_attempts(sessions):
    """One row per session_id: the last send (highest attempt). Same as the *_latest_sessions view."""
    if 'attempt' not in sessions.columns:
        return sessions.copy()
    return sessions.sort_values(['session_id', 'attempt']).drop_duplicates('session_id', keep='last')


def clean(sessions, trials, one_per_participant=True):
    """Return (sessions_clean, trials_clean, report).

    sessions_clean: completed sessions (last attempt per session is 'complete',
      every screen answered), one per participant (earliest complete session of
      that participant code) unless one_per_participant is False.
    trials_clean: the answered screens of those sessions, with pair_type,
      unchosen_condition and an `interrupted` flag (not excluded: decide the rule).
    """
    report = {}
    report['session_rows'] = len(sessions)
    latest = latest_attempts(sessions)
    report['sessions'] = len(latest)
    report['abandoned_sessions'] = int((latest['submitted_status'] == 'abandoned').sum())
    complete = latest[(latest['submitted_status'] == 'complete') & (latest['completion_status'] == 'complete')
                      & (latest['trials_completed'] == latest['trials_total'])].copy()
    report['complete_sessions'] = len(complete)
    complete = complete.sort_values('started_at')
    report['participants'] = int(complete['participant_id'].nunique())
    if one_per_participant:
        before = len(complete)
        complete = complete.drop_duplicates('participant_id', keep='first')
        report['repeat_sessions_dropped'] = before - len(complete)
    # Convenience columns from the JSON blobs.
    complete['seed'] = complete['design'].map(lambda d: d.get('seed') if isinstance(d, dict) else None)
    complete['interleaved'] = complete['design'].map(lambda d: d.get('interleaved') if isinstance(d, dict) else None)
    complete['participant_id_source'] = complete['record'].map(lambda r: r.get('participant_id_source') if isinstance(r, dict) else None)
    complete['compact_record'] = complete['record'].map(lambda r: bool(r.get('compact')) if isinstance(r, dict) else None)
    complete['minimal_record'] = complete['record'].map(lambda r: bool(r.get('minimal')) if isinstance(r, dict) else None)
    env = complete['environment_at_start'].map(lambda e: e if isinstance(e, dict) else {})
    for k in ['user_agent', 'device_pixel_ratio', 'screen_width', 'screen_height', 'inner_width', 'inner_height', 'max_touch_points', 'language']:
        complete[k] = env.map(lambda e, k=k: e.get(k))
    complete['trial_phase_seconds'] = (complete['ended_at'] - complete['first_trial_at']).dt.total_seconds()

    t = trials[trials['session_id'].isin(complete['session_id'])].copy()
    t = t.merge(complete[['session_id', 'age', 'gender']] if 'age' in complete.columns else complete[['session_id']], on='session_id', how='left')
    t['pair_type'] = [('-'.join(sorted([a, b])) if isinstance(a, str) and isinstance(b, str) else None) for a, b in zip(t['left_condition'], t['right_condition'])]
    t['unchosen_condition'] = [r if s == 'left' else l for s, l, r in zip(t['chosen_side'], t['left_condition'], t['right_condition'])]
    n_int = t['interruptions'].map(lambda v: len(v) if isinstance(v, list) else 0)
    t['interrupted'] = (t['attempts'].fillna(1) > 1) | (n_int > 0)
    t['interruption_types'] = t['interruptions'].map(lambda v: ','.join(i['type'] if isinstance(i, dict) else str(i) for i in v) if isinstance(v, list) and v else '')
    t = t.sort_values(['participant_id', 'session_id', 'presentation_index'])
    report['trials'] = len(t)
    report['interrupted_trials'] = int(t['interrupted'].sum())
    report['trials_without_viewport'] = int(t['viewport'].isna().sum()) if 'viewport' in t.columns else None
    counts = t.groupby('session_id').size()
    short = complete.set_index('session_id')['trials_total']
    report['sessions_with_missing_trial_rows'] = int((counts.reindex(short.index).fillna(0) < short).sum())
    return complete, t, report


def attach_stimuli(trials, exp, stimuli_dir):
    """Join stimulus metadata (assets.csv of the handoff's stimuli folder) for the chosen, left and right objects."""
    assets = pd.read_csv(os.path.join(stimuli_dir, 'assets.csv'), dtype=str, keep_default_na=False)
    if exp == 1:
        cols = ['asset_id', 'condition_code', 'notation', 'body_operation', 'edge_operation', 'total_width_mm', 'total_height_mm']
    else:
        cols = ['asset_id', 'stimulus', 'relation_to_reference', 'description', 'shape', 'sub_shape', 'base_rotation', 'sub_rotation', 'figure_width_mm', 'figure_height_mm']
    meta = assets[cols]
    out = trials
    for role in ['chosen', 'left', 'right']:
        renamed = meta.rename(columns={c: (f'{role}_{c}' if c != 'asset_id' else f'{role}_asset_id') for c in cols})
        out = out.merge(renamed, on=f'{role}_asset_id', how='left')
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--exp', type=int, choices=[1, 2], required=True)
    ap.add_argument('--sessions', required=True, help='*_sessions export (CSV or JSON)')
    ap.add_argument('--trials', required=True, help='*_trials export (CSV or JSON)')
    ap.add_argument('--stimuli', help="the handoff's stimuli/exp<N>_... folder (adds stimulus metadata)")
    ap.add_argument('--out', default='clean')
    ap.add_argument('--all-sessions', action='store_true', help='keep every complete session of a participant')
    a = ap.parse_args()
    sessions = load_table(a.sessions)
    trials = load_table(a.trials)
    s, t, report = clean(sessions, trials, one_per_participant=not a.all_sessions)
    if a.stimuli:
        t = attach_stimuli(t, a.exp, a.stimuli)
    os.makedirs(a.out, exist_ok=True)
    s_out = s.drop(columns=[c for c in ['record', 'design', 'calibration', 'environment_at_start', 'environment_at_end', 'url_parameters'] if c in s.columns])
    s_out.to_csv(os.path.join(a.out, 'sessions_clean.csv'), index=False)
    t_out = t.copy()
    for c in ['interruptions', 'viewport']:
        if c in t_out.columns:
            t_out[c] = t_out[c].map(lambda v: json.dumps(v) if v is not None and not (isinstance(v, float) and pd.isna(v)) else '')
    t_out.to_csv(os.path.join(a.out, 'trials_clean.csv'), index=False)
    sends = sessions[[c for c in ['session_id', 'attempt', 'participant_id', 'submitted_status', 'completion_status', 'trials_completed', 'trials_total', 'started_at', 'ended_at', 'created_at'] if c in sessions.columns]]
    sends.sort_values(['participant_id', 'started_at', 'attempt'] if 'attempt' in sends.columns else ['participant_id']).to_csv(os.path.join(a.out, 'sends_all.csv'), index=False)
    for k, v in report.items():
        print(f'{k}: {v}')
    print(f'wrote {a.out}/sessions_clean.csv ({len(s_out)} rows), {a.out}/trials_clean.csv ({len(t_out)} rows), {a.out}/sends_all.csv ({len(sends)} rows)')


if __name__ == '__main__':
    sys.exit(main())

-- Tables for the two 2AFC experiments. Run once in the Supabase SQL editor
-- (Dashboard -> SQL Editor -> New query -> paste -> Run). Safe to re-run.
--
-- One pair of tables per experiment:
--   lines_with_edges_sessions / lines_with_edges_trials
--   similarity_with_rotation_sessions / similarity_with_rotation_trials
-- plus a *_latest_sessions view per experiment.
--
-- sessions: append-only, one row per send (attempt). The app sends a row at
--   completion and, if the participant leaves early, an interim row flagged
--   'abandoned'. Use the *_latest_sessions view (latest attempt per
--   session_id) for analysis. `record` holds the full session JSON.
-- trials: exactly one row per answered screen (unique on session_id +
--   presentation_index; re-sends are ignored). Reaction time is
--   reaction_time_ms, measured from stimulus onset.
--
-- Security: row level security is on; the browser (anon key) may only
-- INSERT. Nothing can be read, changed or deleted with the anon key. Read the
-- data in the dashboard or with the service role key.

do $$
declare p text;
begin
  foreach p in array array['lines_with_edges', 'similarity_with_rotation'] loop
    execute format($f$
      create table if not exists %I (
        id uuid primary key default gen_random_uuid(),
        created_at timestamptz not null default now(),
        session_id text not null,
        attempt integer not null,
        experiment_id text not null,
        experiment_name text,
        participant_id text,
        url_parameters jsonb,
        protocol_version text,
        stimulus_set_version text,
        layout_version text,
        submitted_status text not null check (submitted_status in ('complete', 'abandoned')),
        completion_status text,
        trials_completed integer,
        trials_total integer,
        started_at timestamptz,
        consented_at timestamptz,
        first_trial_at timestamptz,
        ended_at timestamptz,
        pixels_per_mm double precision,
        card_width_px double precision,
        design jsonb,
        calibration jsonb,
        environment_at_start jsonb,
        environment_at_end jsonb,
        storage_available boolean,
        record jsonb,
        unique (session_id, attempt)
      )$f$, p || '_sessions');

    execute format($f$
      create table if not exists %I (
        id bigint generated always as identity primary key,
        created_at timestamptz not null default now(),
        session_id text not null,
        experiment_id text not null,
        participant_id text,
        presentation_index integer not null,
        trial_id text not null,
        family_id integer,
        family_name text,
        group_name text,
        repetition_index integer,
        reference_asset_id text,
        left_asset_id text,
        right_asset_id text,
        left_condition text,
        right_condition text,
        side_assignment text,
        chosen_side text,
        chosen_label text,
        chosen_condition text,
        chosen_asset_id text,
        response_method text,
        reaction_time_ms double precision,
        stimulus_onset_at timestamptz,
        response_at timestamptz,
        attempts integer,
        interruptions jsonb,
        pixels_per_mm double precision,
        viewport jsonb,
        reference_width_mm double precision,
        reference_height_mm double precision,
        left_width_mm double precision,
        left_height_mm double precision,
        right_width_mm double precision,
        right_height_mm double precision,
        unique (session_id, presentation_index)
      )$f$, p || '_trials');

    -- The browser may only insert. (Insert ... on conflict do nothing needs no
    -- select privilege, which is why re-sends can be ignored safely.)
    execute format('alter table %I enable row level security', p || '_sessions');
    execute format('alter table %I enable row level security', p || '_trials');
    execute format('drop policy if exists anon_insert on %I', p || '_sessions');
    execute format('drop policy if exists anon_insert on %I', p || '_trials');
    execute format('create policy anon_insert on %I for insert to anon with check (experiment_id is not null)', p || '_sessions');
    execute format('create policy anon_insert on %I for insert to anon with check (experiment_id is not null)', p || '_trials');
    execute format('revoke select, update, delete on %I from anon, authenticated', p || '_sessions');
    execute format('revoke select, update, delete on %I from anon, authenticated', p || '_trials');
    execute format('create index if not exists %I on %I (session_id)', p || '_trials_session_idx', p || '_trials');
    execute format('create index if not exists %I on %I (session_id)', p || '_sessions_session_idx', p || '_sessions');

    -- Latest attempt per session, for analysis. Not readable with the anon key.
    execute format('create or replace view %I with (security_invoker = true) as select distinct on (session_id) * from %I order by session_id, attempt desc', p || '_latest_sessions', p || '_sessions');
    execute format('revoke all on %I from anon, authenticated', p || '_latest_sessions');
  end loop;
end $$;

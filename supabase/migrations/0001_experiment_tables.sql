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
--   session_id) for analysis. `record` holds the full session JSON; `age` and
--   `gender` are the participant's answers where the study asks for them.
-- trials: exactly one row per answered screen (unique on session_id +
--   presentation_index; re-sends are ignored). Reaction time is
--   reaction_time_ms, measured from stimulus onset.
--
-- Security: the browser (anon key) has NO access to the tables. It can only
-- call record_rows(table, rows), which inserts and ignores duplicates. Nothing
-- can be read, changed or deleted with the anon key. Read the data in the
-- dashboard or with the service role key.

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
        age integer,
        gender text,
        record jsonb,
        unique (session_id, attempt)
      )$f$, p || '_sessions');
    -- Columns added after the first version (no-ops on a fresh install).
    execute format('alter table %I add column if not exists age integer', p || '_sessions');
    execute format('alter table %I add column if not exists gender text', p || '_sessions');

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

    -- No direct access for the API roles; row level security on as well.
    -- (An earlier version of this file granted anon an insert policy; drop it.)
    execute format('alter table %I enable row level security', p || '_sessions');
    execute format('alter table %I enable row level security', p || '_trials');
    execute format('drop policy if exists anon_insert on %I', p || '_sessions');
    execute format('drop policy if exists anon_insert on %I', p || '_trials');
    execute format('revoke all on %I from anon, authenticated', p || '_sessions');
    execute format('revoke all on %I from anon, authenticated', p || '_trials');
    execute format('create index if not exists %I on %I (session_id)', p || '_trials_session_idx', p || '_trials');
    execute format('create index if not exists %I on %I (session_id)', p || '_sessions_session_idx', p || '_sessions');

    -- Latest attempt per session, for analysis. Not readable with the anon key.
    execute format('create or replace view %I with (security_invoker = true) as select distinct on (session_id) * from %I order by session_id, attempt desc', p || '_latest_sessions', p || '_sessions');
    execute format('revoke all on %I from anon, authenticated', p || '_latest_sessions');
  end loop;
end $$;

-- The one entry point for the browser: inserts rows into one of the four
-- tables and ignores rows that already exist (same session + attempt, or same
-- session + presentation). Runs with the owner's rights, so the anon key
-- needs no table privileges. Returns the number of rows inserted.
create or replace function public.record_rows(p_table text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cols text;
  n integer;
begin
  if p_table not in ('lines_with_edges_sessions', 'lines_with_edges_trials', 'similarity_with_rotation_sessions', 'similarity_with_rotation_trials') then
    raise exception 'record_rows: unknown table %', p_table using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 500 then
    raise exception 'record_rows: p_rows must be a non-empty array of at most 500 rows' using errcode = '22023';
  end if;
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
    where table_schema = 'public' and table_name = p_table and column_name not in ('id', 'created_at');
  execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict do nothing', p_table, cols, cols, p_table) using p_rows;
  get diagnostics n = row_count;
  return n;
end
$$;
revoke all on function public.record_rows(text, jsonb) from public;
grant execute on function public.record_rows(text, jsonb) to anon, authenticated;

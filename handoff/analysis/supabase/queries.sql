-- Analysis queries for the two 2AFC experiments. Each statement stands on its
-- own: paste one into the Supabase SQL Editor (Dashboard -> SQL Editor -> New
-- query), run it, and download the result as CSV. Replace the prefix
-- lines_with_edges with similarity_with_rotation for the second experiment;
-- the two experiments have identical columns. Validated against the schema in
-- schema.sql on PostgreSQL 16.
--
-- Vocabulary: a SESSION is one run of the study in one browser (session_id).
-- The *_sessions table is append-only: one row per send, so a session that
-- was abandoned and later finished has two rows (attempt 1, 2). The
-- *_latest_sessions view keeps the last attempt per session. A PARTICIPANT is
-- the 8-digit code typed on the first page (participant_id); in the pilot a
-- reload starts a new session, so one participant can have several sessions.

-- 1. Clean sessions: the last attempt of every session that was completed,
--    one per participant (the earliest complete session of that code).
--    Drop the "distinct on" line to keep every complete session.
select distinct on (participant_id)
  session_id, participant_id, started_at, ended_at,
  extract(epoch from (ended_at - first_trial_at)) as trial_phase_seconds,
  trials_completed, trials_total, age, gender,
  pixels_per_mm, card_width_px,
  (design->>'seed')::bigint as seed, (design->>'interleaved')::boolean as interleaved,
  environment_at_start->>'user_agent' as user_agent,
  (environment_at_start->>'device_pixel_ratio')::numeric as device_pixel_ratio,
  (environment_at_start->>'screen_width')::int as screen_width,
  (environment_at_start->>'screen_height')::int as screen_height,
  (environment_at_start->>'max_touch_points')::int as max_touch_points,
  record->>'participant_id_source' as participant_id_source,
  coalesce((record->>'compact')::boolean, false) as compact_record,
  coalesce((record->>'minimal')::boolean, false) as minimal_record,
  protocol_version, stimulus_set_version, created_at
from lines_with_edges_latest_sessions
where submitted_status = 'complete' and completion_status = 'complete'
  and trials_completed = trials_total
order by participant_id, started_at;

-- 2. Clean trials: every answered screen of the clean sessions above, with
--    the unchosen condition, the pair type and an "interrupted" flag.
--    Keep the flag in the output and decide the exclusion rule in the analysis.
with clean_sessions as (
  select distinct on (participant_id) session_id, participant_id, started_at, age, gender
  from lines_with_edges_latest_sessions
  where submitted_status = 'complete' and completion_status = 'complete' and trials_completed = trials_total
  order by participant_id, started_at
)
select
  t.session_id, t.participant_id, s.age, s.gender,
  t.presentation_index, t.trial_id, t.family_id, t.family_name, t.group_name, t.repetition_index,
  t.reference_asset_id, t.left_asset_id, t.right_asset_id, t.left_condition, t.right_condition, t.side_assignment,
  least(t.left_condition, t.right_condition) || '-' || greatest(t.left_condition, t.right_condition) as pair_type,
  t.chosen_side, t.chosen_condition,
  case when t.chosen_side = 'left' then t.right_condition else t.left_condition end as unchosen_condition,
  t.chosen_asset_id, t.response_method, t.reaction_time_ms,
  t.stimulus_onset_at, t.response_at,
  t.attempts, t.interruptions,
  (coalesce(t.attempts, 1) > 1 or coalesce(jsonb_array_length(t.interruptions), 0) > 0) as interrupted,
  t.pixels_per_mm
from lines_with_edges_trials t
join clean_sessions s using (session_id)
order by t.participant_id, t.session_id, t.presentation_index;

-- 3. Choice proportions per question (all complete sessions, uninterrupted
--    screens): how often each condition was chosen as more similar.
with clean_sessions as (
  select distinct on (participant_id) session_id
  from lines_with_edges_latest_sessions
  where submitted_status = 'complete' and completion_status = 'complete' and trials_completed = trials_total
  order by participant_id, started_at
)
select trial_id, family_name, group_name,
  least(left_condition, right_condition) || '-' || greatest(left_condition, right_condition) as pair_type,
  count(*) as n_responses,
  count(*) filter (where chosen_condition = greatest(left_condition, right_condition)) as n_chose_second,
  round(avg((chosen_condition = greatest(left_condition, right_condition))::int)::numeric, 3) as p_chose_second,
  greatest(left_condition, right_condition) as second_condition,
  round(percentile_cont(0.5) within group (order by reaction_time_ms)::numeric, 1) as median_rt_ms
from lines_with_edges_trials
where session_id in (select session_id from clean_sessions)
  and coalesce(attempts, 1) = 1 and coalesce(jsonb_array_length(interruptions), 0) = 0
group by trial_id, family_name, group_name, least(left_condition, right_condition), greatest(left_condition, right_condition)
order by min(family_id), trial_id;
-- Note: "second" is the alphabetically later condition of the pair (E < L < P
-- in experiment 1; shape < sub < whole in experiment 2). Recode as needed.

-- 4. Side bias and response method per participant.
select participant_id, session_id,
  count(*) as n,
  round(avg((chosen_side = 'left')::int)::numeric, 3) as p_left,
  round(avg((response_method = 'keyboard')::int)::numeric, 3) as p_keyboard,
  round(percentile_cont(0.5) within group (order by reaction_time_ms)::numeric, 1) as median_rt_ms,
  min(reaction_time_ms) as min_rt_ms, max(reaction_time_ms) as max_rt_ms,
  sum((coalesce(attempts, 1) > 1)::int) as n_interrupted
from lines_with_edges_trials
group by participant_id, session_id
order by participant_id, session_id;

-- 5. Every send, for auditing: which sessions were abandoned, resent, or
--    arrived as compact/minimal records.
select session_id, attempt, participant_id, submitted_status, completion_status,
  trials_completed, trials_total, started_at, ended_at, created_at,
  coalesce((record->>'compact')::boolean, false) as compact_record,
  coalesce((record->>'minimal')::boolean, false) as minimal_record,
  jsonb_array_length(coalesce(record->'submissions', '[]'::jsonb)) as earlier_submissions
from lines_with_edges_sessions
order by participant_id, started_at, attempt;

-- 6. Trial rows that were first delivered by the leaving-page send: they lack
--    viewport and the *_mm columns (a later full send cannot replace them).
--    The full trial objects are in record->'trials' of the session row.
select session_id, participant_id, count(*) as n_rows_without_viewport
from lines_with_edges_trials
where viewport is null
group by session_id, participant_id
order by participant_id;

-- 7. Reconstruct trial rows from the session record (for sessions whose
--    trial rows are missing or essential-only). Full records only; compact
--    records lack the presentation fields (join them from record->'sequence'
--    or from stimuli/comparisons.csv on trial_id and side_assignment).
select s.session_id, s.participant_id,
  (t->>'presentation_index')::int as presentation_index, t->>'trial_id' as trial_id,
  t->>'left_condition' as left_condition, t->>'right_condition' as right_condition, t->>'side_assignment' as side_assignment,
  t->>'chosen_side' as chosen_side, t->>'chosen_condition' as chosen_condition,
  (t->>'reaction_time_ms')::double precision as reaction_time_ms, t->>'response_method' as response_method,
  (t->>'attempts')::int as attempts, t->'interruptions' as interruptions,
  t->'viewport' as viewport
from lines_with_edges_latest_sessions s, jsonb_array_elements(s.record->'trials') as t
where s.submitted_status = 'complete'
order by s.participant_id, s.session_id, presentation_index;

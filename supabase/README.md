# Supabase storage

Both experiments record to Supabase through the project's REST API, directly
from the participant's browser with the anon (publishable) key. That key has
no access to the tables themselves; it can only call the database function
`record_rows(table, rows)`, which inserts and ignores duplicates. Nothing can
be read, changed or deleted with it.

## One-time setup

1. In the Supabase dashboard open **SQL Editor → New query**, paste the whole
   of `migrations/0001_experiment_tables.sql` and run it. It creates, for each
   experiment, a `*_sessions` and a `*_trials` table and a `*_latest_sessions`
   view:
   - `lines_with_edges_sessions`, `lines_with_edges_trials`, `lines_with_edges_latest_sessions`
   - `similarity_with_rotation_sessions`, `similarity_with_rotation_trials`, `similarity_with_rotation_latest_sessions`

   It is safe to run again.
2. The project URL and publishable (anon) key are in `site/1/config.js` and
   `site/2/config.js` (`storage.supabase.url`, `storage.supabase.anonKey`)
   with `storage.mode: 'supabase'`. If the key is ever rotated, update both
   files and push; Netlify redeploys.
3. Run through each experiment once and check **Table Editor** for the rows.

## What is stored

- `*_trials`: one row per answered screen, unique on `session_id` +
  `presentation_index`. Columns include the question (`trial_id`,
  `family_id`, `family_name`), what was shown where (`left_condition`,
  `right_condition`, asset ids, `side_assignment`), the answer
  (`chosen_side`, `chosen_condition`, `chosen_asset_id`, `response_method`),
  `reaction_time_ms` (from stimulus onset, monotonic clock), timestamps,
  `attempts` and `interruptions`, and the calibration (`pixels_per_mm`).
- `*_sessions`: one row per send (`attempt`), with the participant id,
  versions, design (including the randomisation `seed`), calibration,
  environment and the full session JSON in `record`. A participant who leaves
  mid-study produces a row with `submitted_status = 'abandoned'`; completion
  produces `'complete'`. Use `*_latest_sessions` (latest attempt per session)
  for analysis.

Re-sends are harmless: trial rows that already exist are ignored, and session
rows are append-only. See `../docs/EXPERIMENT_DATA.md` for every field.

## Useful queries

```sql
-- choices per question, experiment 1
select trial_id, chosen_condition, count(*) from lines_with_edges_trials group by 1, 2 order by 1, 2;

-- median reaction time per relation, experiment 2
select chosen_condition, percentile_cont(0.5) within group (order by reaction_time_ms) as median_rt_ms
from similarity_with_rotation_trials group by 1;

-- completed sessions only
select * from lines_with_edges_latest_sessions where submitted_status = 'complete';
```

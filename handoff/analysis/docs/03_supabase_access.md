# 3. Getting the data out of Supabase

Project: `https://yrgwlvqkqgqxcfcyxkta.supabase.co` (dashboard:
https://supabase.com/dashboard/project/yrgwlvqkqgqxcfcyxkta). Schema `public`.

| Experiment | Tables | View |
|---|---|---|
| 1, Lines with edges | `lines_with_edges_sessions`, `lines_with_edges_trials` | `lines_with_edges_latest_sessions` |
| 2, Similarity with rotation | `similarity_with_rotation_sessions`, `similarity_with_rotation_trials` | `similarity_with_rotation_latest_sessions` |

Who can read them: anyone logged into the project's dashboard, and any
program holding the project's **secret key** (`sb_secret_...`) or legacy
**service_role** key. The **publishable key** (`sb_publishable_...`, the
"anon" key) that is visible in the study's web pages cannot read anything:
the tables are protected by row level security with no policies, and that key
can only call the insert function. So an analysis environment needs either an
export made from the dashboard, or the secret key.

## Option A: export files from the dashboard (no key needed)

1. Dashboard -> **Table Editor** -> open a table (for example
   `lines_with_edges_trials`). Use the grid's export option (labelled
   "Export" / "Download as CSV" in the current dashboard) to download the whole
   table. Repeat for the four tables (the two views are optional: the loader
   derives them).
2. Or Dashboard -> **SQL Editor** -> New query -> paste one statement from
   `supabase/queries.sql` (or simply `select * from lines_with_edges_trials
   order by id;`) -> Run -> download the result as CSV. Statements 1 and 2 of
   `queries.sql` give analysis-ready clean sessions and clean trials
   directly. If the editor caps the number of rows it shows or downloads, use
   option B.

The dashboard writes JSON columns (`record`, `design`, `calibration`,
`environment_*`, `interruptions`, `viewport`, `url_parameters`) as JSON text
inside the CSV cell; `python/load_data.py` parses them.

## Option B: `supabase/pull_supabase.py` (needs the secret key)

1. Dashboard -> **Project Settings** -> **API Keys**. On the "Secret keys"
   tab create or reveal a secret key (`sb_secret_...`); or on the "Legacy API
   keys" tab copy the `service_role` key (a long string starting with
   `eyJ...`). Both bypass row level security: treat them like a password.
2. Run, on any computer with Python 3 (no packages needed):

   ```sh
   python3 supabase/pull_supabase.py --url https://yrgwlvqkqgqxcfcyxkta.supabase.co --key sb_secret_... --out export/
   ```

   or put the values in `SUPABASE_URL` and `SUPABASE_KEY`. It writes
   `<table>.csv` and `<table>.json` for all six objects (or `--tables a,b`),
   paging 1000 rows at a time. The script refuses the publishable key and
   explains a 401/403 (wrong key) or 404 (tables not created).
3. Do not commit the key, do not leave it in a notebook, and revoke it in the
   dashboard when the analysis is done. If the analysis runs in a hosted
   session (such as a Claude session with internet access), prefer running
   the script locally and uploading the files; a key pasted into a chat
   should be rotated afterwards.

## Option C: work in the SQL Editor only

Everything in `supabase/queries.sql` can run in the SQL Editor as is (change
the prefix for experiment 2). It covers clean sessions and trials, choice
proportions per question, side bias and response method per participant, an
audit of every send, and the reconstruction of trial rows from `record`.

## Reading the exports

```sh
cd python
python3 load_data.py --exp 1 --sessions ../export/lines_with_edges_sessions.csv \
    --trials ../export/lines_with_edges_trials.csv \
    --stimuli ../stimuli/exp1_lines_with_edges --out ../clean/exp1
python3 load_data.py --exp 2 --sessions ../export/similarity_with_rotation_sessions.csv \
    --trials ../export/similarity_with_rotation_trials.csv \
    --stimuli ../stimuli/exp2_similarity_with_rotation --out ../clean/exp2
```

Each run prints counts (sends, sessions, abandoned, complete, participants,
repeat sessions dropped, trials, interrupted trials, trials missing rows) and
writes `sessions_clean.csv`, `trials_clean.csv` (one row per screen with
`pair_type`, `unchosen_condition`, `interrupted`, demographics, and the
stimulus metadata of the chosen, left and right objects) and `sends_all.csv`
(every send, for auditing). The functions `load_table`, `clean` and
`attach_stimuli` can be imported instead. The JSON files from option B load
the same way (pass the `.json` paths). Both file forms were tested on the
example rows (`examples/`).

Type notes when reading the CSVs yourself: booleans appear as `true`/`false`
(dashboard, script) or `t`/`f` (psql); timestamps are ISO 8601 in UTC with
either `T` or a space; empty cells are nulls; JSON cells are JSON text.

## Sanity checks after an export

- Row counts match the dashboard's counts for each table.
- Every clean session has exactly `trials_total` trial rows
  (`sessions_with_missing_trial_rows: 0`).
- `pixels_per_mm` is plausible (roughly 3.5 to 8 on laptops and monitors;
  values far outside mean a wrong card match).
- `started_at` of the earliest real participant is after the links were sent
  out; earlier rows and known test codes are the researcher's trial runs.
- Each participant code appears in both experiments if both studies were
  completed (join on `participant_id`).

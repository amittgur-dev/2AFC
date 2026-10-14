# Analysis handoff: two online 2AFC similarity experiments

Prepared 14 October 2026 for the analysis of the data collected by the two
online experiments built in this repository (`amittgur-dev/2afc`). It is
written so that an analysis session (for example with Claude) can work from
this folder alone: what was shown, how the data were recorded, how to get the
tables out of Supabase, and how to read them.

Researcher: Amit Gur (Amit.Gur@UAntwerpen.be). No participant data is included;
the `examples/` rows were produced by an automated browser.

## The two experiments

| | Experiment 1 | Experiment 2 |
|---|---|---|
| Name (internal) | Lines with edges | Similarity with rotation |
| `experiment_id` in the data | `exp1-lines-with-edges` | `exp2-similarity-with-rotation` |
| Study site | https://2afc-study-1.netlify.app/ | https://2afc-study-2.netlify.app/ |
| Screens per participant | 19 | 48 |
| Supabase tables | `lines_with_edges_sessions`, `lines_with_edges_trials` (view `lines_with_edges_latest_sessions`) | `similarity_with_rotation_sessions`, `similarity_with_rotation_trials` (view `similarity_with_rotation_latest_sessions`) |
| Extra pages | consent, age and gender, instructions | none (pilot: one-line instructions) |

Both are two-alternative forced-choice (2AFC) similarity tasks: a reference
object A at the top of the screen, two comparison objects B (left) and C
(right) below it, and the question "Which is more similar to A?". Objects are
drawn at their true physical size after the participant calibrates the screen
with a bank card. The order of the screens and the left/right placement of the
two comparisons are randomised per participant and recorded. Each response is
stored with its reaction time. There is no right answer and nothing is scored.

## Where to start

1. `docs/01_experiments_and_design.md`: what the stimuli are, what each
   screen compared, how the order and sides were randomised, how timing works.
2. `docs/03_supabase_access.md`: how to export the tables (dashboard or
   `supabase/pull_supabase.py` with a secret key). The browser's public key
   cannot read the tables.
3. `python/load_data.py`: turns an export into clean per-session and per-trial
   tables (latest attempt per session, completed sessions only, one session per
   participant code, pair type, unchosen condition, interruption flag,
   stimulus metadata). `docs/02_data_dictionary.md` explains every column.
4. `docs/04_analysis_notes.md`: suggested analyses, exclusion rules and
   pitfalls.

## Contents

```
README.md                       this file
docs/
  01_experiments_and_design.md  stimuli, questions, procedure, randomisation, timing, calibration
  02_data_dictionary.md         every column of the Supabase tables and the record JSON
  03_supabase_access.md         exporting the data; keys; sanity checks
  04_analysis_notes.md          analysis plan, exclusion rules, pitfalls
stimuli/
  exp1_lines_with_edges/        32 SVGs (assets/), assets.csv (one row per object, with the
                                researcher's B/E notation and sizes in mm), comparisons.csv and
                                trials.csv (the 19 questions), measurements.csv, families.json,
                                layout.json, stimuli-notation.xlsx, questions-by-reference.pdf,
                                STIMULUS_SPECIFICATION.md
  exp2_similarity_with_rotation/ 57 SVGs (assets/), assets.csv (one row per object as used in a
                                question: asset_id, stimulus file, rotations), stimuli.csv,
                                comparisons.csv (the 48 questions), the designer's manifest and
                                README, questions-by-reference.pdf
supabase/
  schema.sql                    the tables, view and insert function as created in Supabase
  queries.sql                   analysis queries, validated on PostgreSQL 16 against this schema
  pull_supabase.py              downloads every table to CSV + JSON (needs a secret key)
python/
  load_data.py                  pandas loader/cleaner (CSV or JSON exports); requirements.txt
examples/
  *.csv                         the six tables as exported after two automated runs of each
                                study (one run abandoned after four screens, then restarted)
  raw/*.json                    the same rows exactly as the app posted them, plus posts.json
app-source/
  reproduce_sequence.mjs        rebuilds a session's presentation order from its design seed
  design.js, stimuli-1.js, stimuli-2.js, config-1.js, config-2.js, storage.js, geometry.js
  EXPERIMENT_DATA.md            the app's own data dictionary (the record JSON)
previews/                       screenshots of the first page, calibration, instructions and
                                three trial screens of each study
```

## Facts that matter for the analysis

- **Participants are 8-digit codes they made up** on the first page
  (`participant_id`, `participant_id_source = 'typed'`), or a code carried in
  the link (`?pid=`, `'url'`). People were asked to use the same code in both
  studies, so the two data sets join on `participant_id`. No list ties codes to
  names unless people shared their code with the researcher.
- **Every visit is a new session** (pilot setting). A person who reloaded or
  came back appears with several `session_id`s; the earlier, unfinished ones
  are flagged `abandoned`. Pick one complete session per code (the loader and
  `queries.sql` take the earliest).
- **The sessions table is append-only**: one row per send. Use the
  `*_latest_sessions` view or the loader, which keep the last attempt of each
  session.
- **Which object was where is recorded per screen**: `left_condition` /
  `right_condition` and `side_assignment` (`canonical` or `reversed` relative
  to `comparisons.csv`); `chosen_condition` is what matters, `chosen_side`
  lets you check side bias.
- **Reaction time** (`reaction_time_ms`) runs from the frame in which the three
  decoded images were painted to the response; no deadline; one response per
  screen; 500 ms blank between screens.
- **Interrupted screens were re-presented** (`attempts > 1`, `interruptions`
  non-empty) with timing restarted; decide whether to keep them.
- **Age and gender exist only in experiment 1** (`age`, `gender`: `male`,
  `female`, `non-binary`).
- Rows created before the study links were sent to colleagues (14 October
  2026) are the researcher's own test runs; the Lines tables were to be
  emptied before dissemination. Check `created_at` and the participant codes.

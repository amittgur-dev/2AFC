# 2. Data dictionary

Each experiment writes to its own pair of tables plus a view; the two pairs
have identical columns. Replace the prefix for experiment 2.

| Object | One row per | Notes |
|---|---|---|
| `lines_with_edges_sessions` | send (`session_id` + `attempt`) | append-only; a session sent twice has two rows |
| `lines_with_edges_trials` | answered screen (`session_id` + `presentation_index`) | unique; a row that already exists is never replaced |
| `lines_with_edges_latest_sessions` (view) | session | the row with the highest `attempt` per `session_id` |

The browser inserts through one database function, `record_rows(table, rows)`
(see `supabase/schema.sql`); duplicates are silently ignored (`on conflict do
nothing`). The browser's key can only call that function, so nothing can be
read, changed or deleted from the participant side.

## How rows come to exist

- **Completion.** When the last response is given, the app sends one session
  row (`submitted_status = 'complete'`) and all trial rows (full columns). If
  that request fails the participant sees a retry button; a retry adds a new
  session row (`attempt` + 1) and the trial rows are ignored as duplicates.
- **Leaving early.** If the participant leaves the page after at least one
  response and before the completion send was confirmed, the browser fires a
  best-effort send on the way out: a session row with `submitted_status =
  'abandoned'` (or `'complete'` if the last response had already been given)
  whose `record` is a *compact* or *minimal* version (below), plus
  *essential* trial rows for the screens answered so far: the same columns
  without `viewport` and the `*_mm` columns, and with `interruptions` reduced
  to a list of type names (or null). Nothing is sent for people who leave
  before their first response.
- **Pilot setting: every visit starts a new session.** A reload mid-study
  therefore leaves an `abandoned` session behind and starts a fresh
  `session_id` for the same participant code. (With session memory on, a
  reload resumes the same session and the later completion send adds
  `attempt` 2 for the same `session_id`; trial rows that arrived first as
  essential rows then keep their reduced form, because existing rows are
  never replaced. The full trial objects are always inside `record.trials` of
  the complete session row.)

## `*_sessions` columns

| Column | Type | Meaning |
|---|---|---|
| `id` | uuid | row id (server) |
| `created_at` | timestamptz | server time of the insert |
| `session_id` | text | 16-character random id made when the page first loaded; the key between the two tables |
| `attempt` | integer | send number within the session (1, 2, ...) |
| `experiment_id`, `experiment_name` | text | `exp1-lines-with-edges` / "Lines with edges", `exp2-similarity-with-rotation` / "Similarity with rotation" |
| `participant_id` | text | the 8-digit code typed on the first page, or the code from the link (`?pid=`, `?PROLIFIC_PID=`, `?participant=`); null only if the study allowed anonymous runs (it did not) |
| `url_parameters` | jsonb | copies of `STUDY_ID`, `SESSION_ID`, `source` if they were in the link; `{}` otherwise |
| `protocol_version`, `stimulus_set_version`, `layout_version` | text | versions in force (see doc 1) |
| `submitted_status` | text | what this send claimed: `complete` or `abandoned` |
| `completion_status` | text | state of the session when sent: `in_progress` or `complete` |
| `trials_completed`, `trials_total` | integer | screens answered / screens in the session (19 or 48) |
| `started_at` | timestamptz | first page loaded (participant's clock, UTC) |
| `consented_at` | timestamptz | consent checkbox confirmed (experiment 1) or Continue pressed on the first page (experiment 2) |
| `first_trial_at` | timestamptz | first screen presented |
| `ended_at` | timestamptz | last response given; null in an abandoned row |
| `pixels_per_mm` | double | calibration in force at the send (`card_width_px / 85.60`) |
| `card_width_px` | double | matched card width in CSS pixels |
| `design` | jsonb | the randomisation settings plus `seed` (integer) and `interleaved` (boolean); the deployed settings are `controlPosition: random, randomizeTrialOrder: true, avoidConsecutiveSameFamily: true, sideAssignment: random, repetitions: 1, interTrialIntervalMs: 500` and the accepted `keys` |
| `calibration` | jsonb | latest calibration: `card_width_px`, `pixels_per_mm`, `at`, and the `environment` snapshot taken then |
| `environment_at_start`, `environment_at_end` | jsonb | device snapshot at page load and at completion (below); `environment_at_end` is null in abandoned rows |
| `storage_available` | boolean | whether the browser allowed localStorage (false: the participant was warned not to reload) |
| `age` | integer | experiment 1 only, 18 to 120; null in experiment 2 |
| `gender` | text | experiment 1 only: `male`, `female`, `non-binary`; null in experiment 2 |
| `record` | jsonb | the session record (below): full in a completion send, compact in a leaving-page send |

### Environment snapshot (`environment_at_start`, `environment_at_end`, `calibration.environment`)

`timestamp`, `device_pixel_ratio`, `screen_width`, `screen_height`,
`screen_avail_width`, `screen_avail_height`, `inner_width`, `inner_height`,
`outer_width`, `outer_height`, `visual_viewport_scale`, `fullscreen`,
`user_agent`, `language`, `color_depth`, `max_touch_points`, `pointer_coarse`,
`hover_none`. Diagnostic only; none of it enters the physical size
computation. iPads report a Macintosh user agent: use `max_touch_points > 1`
to tell them apart. Phones cannot run the study (the stage does not fit).

### The `record` JSON (full version, sent at completion)

| Key | Meaning |
|---|---|
| `schema_version` | 1 |
| `experiment_id`, `experiment_name`, `session_id`, `participant_id`, `participant_id_source` (`typed` or `url`), `url_parameters` | as above |
| `protocol_version`, `stimulus_set_version`, `layout_version`, `consent_version` | versions |
| `design` | as the column |
| `sequence` | the assigned order: one object per screen with `presentation_index`, `trial_id`, `family_id`, `family_name`, `group`, `repetition_index`, `reference_asset_id`, `left_asset_id`, `right_asset_id`, `left_condition`, `right_condition`, `side_assignment` |
| `stage_mm`, `label_mm`, `card_mm` | layout constants (220 x 120 mm stage, label offset and font size, card 85.60 x 53.98 mm) |
| `started_at`, `consented_at`, `first_trial_at`, `ended_at`, `completion_status`, `storage_available` | as the columns |
| `demographics` | experiment 1: `{age, gender, at}`; absent or null in experiment 2 |
| `calibration`, `calibration_history` | latest calibration and every calibration performed (recalibrations after a zoom or screen change add entries) |
| `environment_at_start`, `environment_at_end` | as the columns |
| `trials` | one object per answered screen: the sequence fields above plus the trial fields below, with `interruptions` as objects `{type, at, after_onset_ms}`, `viewport {inner_width, inner_height, fullscreen}` and the six `*_mm` sizes; timestamps are named `stimulus_onset_iso` and `response_iso` here |
| `events` | timeline: `consented`, `demographics`, `resumed`, `interruption` (with the interruption type), `preload-failed`; each with `at`, `t` (ms since page load) and `presentation_index` |
| `submissions` | the sends made *before* this one (`status_sent`, `attempt`, `ok`, `status`, `bytes`, `at`, `unconfirmed`); empty in a first successful completion send |

**Compact record** (`record.compact = true`): what every leaving-page send
carries (browsers cap such sends at 64 KiB, so the full record is never sent
that way): no `sequence` and no `events` (`event_count` instead); `trials` keep
`presentation_index`, `trial_id` and the response fields but not the
repeated presentation fields (conditions, asset ids, side). Join those from
`record`-less sources: the trial rows of the same session, or
`comparisons.csv` plus `side_assignment`, or rebuild the sequence from
`design.seed` with `app-source/reproduce_sequence.mjs`.

**Minimal record** (`record.minimal = true`): used instead when even the
compact record would not fit (from about 70 answered screens, so not expected
here; beyond that the row carries `record = null`): additionally no `calibration_history`,
`environment_at_*`; `calibration` reduced to three fields; `trials` reduced to
`presentation_index`, `trial_id`, `chosen_side`, `chosen_condition`,
`chosen_asset_id`, `response_method`, `reaction_time_ms`, `response_iso`,
`attempts`, `interruption_count`.

## `*_trials` columns

| Column | Type | Meaning |
|---|---|---|
| `id` | bigint | row number (identity, starts at 1 after the table was emptied with `restart identity`) |
| `created_at` | timestamptz | server time of the insert |
| `session_id`, `experiment_id`, `participant_id` | text | as in the sessions table |
| `presentation_index` | integer | 0-based position of the screen in this participant's order |
| `trial_id` | text | question id: experiment 1 `family.pair` (`0.1` to `8.1`), experiment 2 `question.pair` (`1.1` to `16.3`) |
| `family_id` | integer | experiment 1: family 0 to 8; experiment 2: question 1 to 16 |
| `family_name` | text | object name (experiment 1) or reference name such as "Square of squares" (experiment 2) |
| `group_name` | text | experiment 1: `Control`, `Bi-directional`, `Uni-directional`; experiment 2: `squares and diamonds`, `triangles`, `squares and triangles`, `diamonds and triangles` |
| `repetition_index` | integer | always 0 (one presentation of each screen) |
| `reference_asset_id` | text | `<family>-A` |
| `left_asset_id`, `right_asset_id` | text | the objects shown as B (left) and C (right), e.g. `3-E` / `3-P`, `7-whole` / `7-sub`; look them up in `stimuli/.../assets.csv` |
| `left_condition`, `right_condition` | text | experiment 1: `E`, `L`, `P`; experiment 2: `sub`, `whole`, `shape` |
| `side_assignment` | text | `canonical` (left = first comparison in `comparisons.csv`) or `reversed` |
| `chosen_side` | text | `left` or `right` |
| `chosen_label` | text | `B` (left) or `C` (right) |
| `chosen_condition` | text | the condition of the chosen object (the primary dependent variable) |
| `chosen_asset_id` | text | the chosen object |
| `response_method` | text | `pointer` (click or tap on the object) or `keyboard` (arrow or letter key) |
| `reaction_time_ms` | double | from stimulus onset to the response, 0.1 ms resolution (doc 1, Timing) |
| `stimulus_onset_at`, `response_at` | timestamptz | wall-clock copies (participant's clock) |
| `attempts` | integer | how many times this screen was drawn; > 1 means it was interrupted and re-presented, with timing restarted |
| `interruptions` | jsonb | full rows: list of `{type, at, after_onset_ms}`; essential rows: list of type names or null. Types: `hidden` (tab hidden), `insufficient-space` (window too small), `screen-change` (zoom, device pixel ratio or screen changed, forcing recalibration), `recalibration` (participant pressed Recalibrate), `image-error` (an image failed to load) |
| `pixels_per_mm` | double | calibration in force for this response |
| `viewport` | jsonb | `{inner_width, inner_height, fullscreen}` at the response; null in essential rows |
| `reference_width_mm`, `reference_height_mm`, `left_width_mm`, `left_height_mm`, `right_width_mm`, `right_height_mm` | double | physical size of each displayed object (null in essential rows; constant per asset, see `assets.csv`) |

## Cleaning rules used by `supabase/queries.sql` and `python/load_data.py`

1. Latest attempt per `session_id` (the `*_latest_sessions` view).
2. Keep sessions with `submitted_status = 'complete'`, `completion_status =
   'complete'` and `trials_completed = trials_total`.
3. One session per `participant_id`: the earliest complete one by
   `started_at` (`--all-sessions` in the loader keeps all; decide what a
   repeat run means for your question).
4. Trials of those sessions only; add `pair_type` (the two conditions in
   alphabetical order, e.g. `E-P`, `sub-whole`), `unchosen_condition`, and
   `interrupted` (`attempts > 1` or any interruption). Interrupted screens
   are flagged, not removed.
5. Check that every clean session has `trials_total` trial rows (the loader
   reports `sessions_with_missing_trial_rows`); if not, rebuild from
   `record.trials` (query 7).

## Example rows

`examples/` holds the six tables exported from a local copy of the schema
after two automated runs of each study. In experiment 1 the first
participant (`11223344`) answered four screens, one of them interrupted by a
hidden tab (`attempts = 2`, `interruptions = ["hidden"]`), left (an
`abandoned` session with a compact record and four essential trial rows,
`viewport` empty), then started again and completed; the second participant
(`55667788`) completed in one go; both completed experiment 2. Reaction
times are those of a script, not of people. `examples/raw/*.json` are the
same rows exactly as posted by the app (before the server added `id` and
`created_at`); `posts.json` shows the ten `record_rows` calls in order.

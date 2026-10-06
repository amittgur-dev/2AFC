# Data dictionary — what the experiment records

No participant data is included in this repository. This describes the record
produced by `site/app.js` (schema_version 1).

One **session record** is produced per participant. It is saved to the
browser's localStorage after every response (for reload/crash recovery) and
sent to the configured destination at completion, plus an interim copy flagged
`abandoned` if the participant leaves early (`storage.submitPartialOnLeave`).

## Session fields

| Field | Meaning |
|---|---|
| `schema_version` | 1 |
| `session_id` | Random 16-character code generated on first load. Shown as the completion code unless `completion.code` is set. |
| `participant_id` | First matching URL parameter from `participant.idParams` (`pid`, `PROLIFIC_PID`, `participant`), else null. |
| `url_parameters` | Verbatim copies of `participant.passthroughParams` present in the URL (e.g. `STUDY_ID`, `SESSION_ID`). |
| `protocol_version`, `stimulus_set_version`, `layout_version`, `consent_version` | From `config.js`. |
| `design` | The `config.design` block plus the random `seed`. `buildSequence(design, seed)` reproduces `sequence`. |
| `sequence` | The assigned presentation order (see presentation fields below), fixed at session creation. |
| `stage_mm`, `label_mm`, `card_mm` | The physical layout constants in force. |
| `started_at`, `consented_at`, `first_trial_at`, `ended_at` | ISO timestamps. |
| `completion_status` | `in_progress`, `complete`; a submitted record may also carry `abandoned` (interim copy). |
| `calibration` | Latest `{card_width_px, pixels_per_mm, at, environment}`. `pixels_per_mm = card_width_px / 85.60`. |
| `calibration_history` | Every calibration performed, including after reloads or screen changes. |
| `environment_at_start`, `environment_at_end` | Device pixel ratio, screen and window size, visual-viewport scale, fullscreen state, user agent, language, colour depth. Diagnostic only; none of these is used to compute physical size. |
| `trials` | One record per answered presentation (below). |
| `events` | Timeline of `consented`, `resumed`, `interruption`, `preload-failed`. |
| `submissions` | Every send attempt with its result. |

## Presentation fields (in `sequence` and copied into each trial)

| Field | Meaning |
|---|---|
| `presentation_index` | 0-based position in the assigned order. |
| `trial_id` | Question id from `data/trials.json` (family.pair, e.g. `3.2`). |
| `family_id`, `family_name`, `group` | 0 control; 1–4 bi-directional; 5–8 uni-directional. |
| `repetition_index` | 0 unless `design.repetitions > 1`. |
| `reference_asset_id` | Always `<family>-A`. |
| `left_asset_id`, `right_asset_id` | Actual objects shown at B (left) and C (right). |
| `left_condition`, `right_condition` | `E`, `L` or `P` (endpoint-only / main-part extension / proportional enlargement). |
| `side_assignment` | `canonical` (as in `data/trials.json`) or `reversed`. |

## Trial fields

| Field | Meaning |
|---|---|
| `chosen_side` | `left` or `right`. |
| `chosen_label` | `B` or `C`. |
| `chosen_condition`, `chosen_asset_id` | Resolved from the side. There is no correctness column by design. |
| `response_method` | `pointer` (click/tap) or `keyboard`. |
| `reaction_time_ms` | `performance.now()` at response minus stimulus onset, 0.1 ms resolution. Onset is taken after all three SVGs are decoded and two animation frames have been painted. |
| `stimulus_onset_iso`, `response_iso` | Wall-clock timestamps. |
| `attempts` | How many times this presentation was drawn. >1 means it was interrupted and re-presented, with timing restarted. |
| `interruptions` | List of `{type, at, after_onset_ms}`; types `hidden` (tab hidden), `insufficient-space`, `screen-change` (zoom/DPR/screen size changed), `recalibration` (participant pressed Recalibrate). |
| `pixels_per_mm` | Calibration in force for this response. |
| `viewport` | Window size and fullscreen state at response. |
| `reference_*_mm`, `left_*_mm`, `right_*_mm` | Physical width/height of each displayed asset. |

## CSV export

`storage.trialsToCsv` flattens one row per trial with the session identifiers
and versions repeated on each row. Column order is `TRIAL_COLUMNS` in
`site/storage.js`. The `interruptions` cell is JSON.

## Netlify Forms submission fields

`form-name`, `session_id`, `participant_id`, `protocol_version`,
`stimulus_set_version`, `completion_status`, `trials_completed`,
`trials_total`, `started_at`, `ended_at`, `pixels_per_mm`, and `payload`
(the complete session record as JSON). Parse `payload` for analysis; the other
fields exist so the Netlify dashboard is readable.

## Handling of invalidated and interrupted trials

Define before analysis. The record keeps everything needed to filter: drop or
flag trials with `attempts > 1` or non-empty `interruptions`; exclude sessions
with `completion_status != 'complete'`; when both an `abandoned` and a
`complete` record share a `session_id`, keep the complete one.

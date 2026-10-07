# Data dictionary — what the experiment records

No participant data is included in this repository. This describes the record
produced by `site/app.js` (schema_version 1).

One **session record** is produced per participant. It is saved to the
browser's localStorage after every response (for reload/crash recovery) and
sent to the configured destination at completion. If the participant leaves
after answering at least one screen but before the final record was
confirmed sent, an interim copy is sent on the way out
(`storage.submitPartialOnLeave`), flagged `abandoned`, or `complete` if the
last response had already been given (for example leaving during the final
blank interval). Nothing is sent for dropouts before the first response, and
every reload or navigation mid-study sends one interim copy; all copies share
the `session_id`. The interim copy is sent with the browser's beacon
mechanism, which is limited to 64 KiB. The full record is tried first; if it
is too large (from about 38 answered screens) a `compact: true` record is
sent: the same trials without the repeated presentation fields, without
`sequence` (reproducible from `design.seed`) and without `events`. If that is
still too large (from about 70 answered screens) a `minimal: true` record is
sent: one short row per trial, a three-field calibration summary and no
environment snapshots. Beyond that nothing is sent (`beacon-too-large`) and
the record waits in the browser for a later visit.

## Session fields

| Field | Meaning |
|---|---|
| `schema_version` | 1 |
| `session_id` | Random 16-character code generated on first load. Shown as the completion code unless `completion.code` is set. |
| `participant_id` | First matching URL parameter from `participant.idParams` (`pid`, `PROLIFIC_PID`, `participant`), else null. |
| `url_parameters` | Verbatim copies of `participant.passthroughParams` present in the URL (e.g. `STUDY_ID`, `SESSION_ID`). |
| `protocol_version`, `stimulus_set_version`, `layout_version`, `consent_version` | From `config.js`. |
| `design` | The `config.design` block plus the random `seed` and `interleaved` (true/false: whether the no-consecutive-family constraint was met over the shuffled segments; null when it was not requested; a deliberate leading control block under `controlPosition: 'first'` does not count against it). `buildDesign(design, seed)` reproduces `sequence`. The app reads the inter-trial interval and response keys from this block, so the record describes what was run even if `config.js` changed later. |
| `sequence` | The assigned presentation order (see presentation fields below), fixed at session creation. |
| `stage_mm`, `label_mm`, `card_mm` | The physical layout constants in force. |
| `started_at`, `consented_at`, `first_trial_at`, `ended_at` | ISO timestamps. |
| `completion_status` | `in_progress`, `complete`; a submitted record may also carry `abandoned` (interim copy). The record becomes `complete` the moment the last response is given, before the final blank interval. |
| `storage_available` | Whether the browser allowed localStorage. When false the participant was warned not to reload, and a failed send cannot be retried later. |
| `calibration` | Latest `{card_width_px, pixels_per_mm, at, environment}`. `pixels_per_mm = card_width_px / 85.60`. |
| `calibration_history` | Every calibration performed, including after reloads or screen changes. |
| `environment_at_start`, `environment_at_end` | Device pixel ratio, screen, window (inner and outer) size, visual-viewport scale, fullscreen state, user agent, language, colour depth, `max_touch_points`, `pointer_coarse` and `hover_none`. Diagnostic only; none of these is used to compute physical size. iPads report a Macintosh user agent, so use `max_touch_points > 1` with a Macintosh user agent to identify them. |
| `trials` | One record per answered presentation (below). |
| `events` | Timeline of `consented`, `resumed`, `interruption`, `preload-failed`. |
| `submissions` | Every send attempt: `status_sent` (`complete`/`abandoned`), `attempt` number, `ok`, `status` (HTTP status for fetches; `beacon`, `beacon-compact`, `beacon-minimal`, `*-failed`, `beacon-too-large`, `beacon-unsupported` for the leaving path; `network-error`), `bytes`, `at`. A beacon's delivery cannot be observed, so `ok: true` there means only that the browser accepted it, and the app still sends the full record by fetch at completion or on the next visit. |

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
| `reaction_time_ms` | `performance.now()` at response minus stimulus onset, stored rounded to 0.1 ms. Actual timer precision depends on the browser (typically 1 ms in Firefox and Safari, finer in Chrome). Onset is taken in the animation frame that first paints the objects, after all three SVGs have loaded and decoded and two blank frames have passed, so it precedes the physical appearance by at most one display refresh. |
| `stimulus_onset_iso`, `response_iso` | Wall-clock timestamps. |
| `attempts` | How many times this presentation was drawn. >1 means it was interrupted and re-presented, with timing restarted. |
| `interruptions` | List of `{type, at, after_onset_ms}`; types `hidden` (tab hidden), `insufficient-space`, `screen-change` (zoom/DPR/screen size changed), `recalibration` (participant pressed Recalibrate), `image-error` (an SVG failed to load or decode; the screen stayed blank and loading was retried). After any interruption the presentation is drawn again with timing restarted, so `attempts` increases. |
| `pixels_per_mm` | Calibration in force for this response. |
| `viewport` | Window size and fullscreen state at response. |
| `reference_*_mm`, `left_*_mm`, `right_*_mm` | Physical width/height of each displayed asset. |

## CSV export

`storage.trialsToCsv` flattens one row per trial with the session identifiers
and versions repeated on each row. Column order is `TRIAL_COLUMNS` in
`site/storage.js`. The `interruptions` cell is JSON. String cells that begin
with `=`, `+`, `-`, `@`, tab or CR (in practice only a URL-supplied
`participant_id`) are written with a leading apostrophe so spreadsheets do not
evaluate them as formulas; the JSON record holds the unmodified value.

## Netlify Forms submission fields

`form-name`, `session_id`, `participant_id`, `protocol_version`,
`stimulus_set_version`, `completion_status`, `trials_completed`,
`trials_total`, `started_at`, `ended_at`, `pixels_per_mm`, and `payload`
(the complete session record as JSON). Parse `payload` for analysis; the other
fields exist so the Netlify dashboard is readable.

## Handling of invalidated and interrupted trials

Define before analysis. The record keeps everything needed to filter: drop or
flag trials with `attempts > 1` or non-empty `interruptions`; exclude sessions
with `completion_status != 'complete'`.

## Deduplication

Several records can share one `session_id`: interim `abandoned` copies from
each reload, a `complete` copy sent by beacon if the participant left before
the completion fetch returned, and more than one `complete` copy if a send
reached the server but its response was lost and the participant pressed
"Try sending again" or reopened the page. Procedure: group by `session_id`;
among records with `completion_status = 'complete'` prefer a full one (no
`compact` flag) with the latest `submissions[*].at`, falling back to a
`compact`/`minimal` one (reconstruct `sequence` with
`buildDesign(design, design.seed)` if needed); discard every `abandoned`
record for that session. Several `session_id`s with the same `participant_id`
indicate a repeat visit from a different browser or after a reset; check
`started_at`.

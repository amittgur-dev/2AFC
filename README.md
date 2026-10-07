# Line-similarity 2AFC experiment

A calibrated, browser-based two-alternative forced-choice study, deployed as its own static Netlify site. On each
screen a reference object **A** appears above two comparison objects **B**
(left) and **C** (right); the participant chooses the one that looks more
similar to A. Objects are rendered at fixed physical sizes after the
participant matches a bank card to an on-screen outline.

| Where | What |
|---|---|
| `site/` | The source of both studies. `site/shared/` is the runner (app, design, storage, geometry, styles); `site/1/` is Lines with edges and `site/2/` is Similarity with rotation. Each study is deployed as its own Netlify project with its own address; `tools/build_site.mjs` assembles one study plus the runner into `dist/`. No dependencies. |
| `site/1/config.js`, `site/2/config.js` | Every study setting a researcher changes: protocol version, design (order, counterbalancing, repetitions), participant-ID parameters, storage destination, completion code/redirect, study text fields. |
| `docs/`, `data/`, `tools/`, `tests/` | Researcher materials: data dictionary, stimulus specification, data files and the stimulus spreadsheet, data-check/export tools, Node and real-browser tests. |

The app was built from the ChatGPT handoff of 2026-10-05 (`data/handoff-manifest.json`
lists that package's checksums). The accepted artwork and the 220 × 120 mm
triangle layout are unchanged. On 2026-10-07 the line families (1–6) were
rescaled to full master size so that every thin line is 1 mm × 40 mm like the
control; see the note at the top of `docs/STIMULUS_SPECIFICATION.md`. The
historical `legacy-workspace/` of that package (5 MB of PDF build scripts and
QA renders) is not in this repository; keep the original zip if you need it.

## Deploy on Netlify: one project per study

The two studies are separate links built from the same repository. Each
Netlify project runs `node tools/build_site.mjs` (from `netlify.toml`), which
copies one study folder plus `site/shared/` into `dist/` and publishes that,
so each study sits at the root of its own address, with nothing nested under
the other. The projects are named `2AFC-STUDY-1` and `2AFC-STUDY-2`:

| Study | Netlify project | Address |
|---|---|---|
| Lines with edges | `2AFC-STUDY-1` | <https://2afc-study-1.netlify.app/> |
| Similarity with rotation | `2AFC-STUDY-2` | <https://2afc-study-2.netlify.app/> |

A personal link adds the participant code: `https://2afc-study-2.netlify.app/?pid=CODE`. Which study a project builds comes from
the environment variable `STUDY` (`1` by default, `2` for the rotation study).
Every push to the default branch redeploys both projects.

- **Study 1 (Lines with edges):** the existing project needs no change
  beyond a neutral name, since `STUDY` defaults to 1.
- **Study 2 (Similarity with rotation):** Netlify → **Add new project →
  Import an existing project → GitHub → this repository**. On the configure
  page open **Add environment variables** and add `STUDY` = `2`; the build
  command and publish directory come from `netlify.toml`. Deploy.
- Give both projects neutral names, since the name is the domain participants
  see: Project configuration → General → Project details → Change project
  name. (Older Netlify docs say "site" where the dashboard now says
  "project".)

For a quick check without Git, build locally (`npm run build` or
`npm run build:study2`) and drag the resulting `dist` folder onto
<https://app.netlify.com/drop>.

## Run and test

```sh
npm run serve        # http://localhost:8000/1/ and /2/ from the source tree (any static server works; file:// does not)
npm run build        # assemble study 1 into dist/ as Netlify deploys it (npm run build:study2 for study 2)
npm test             # Node checks: geometry, bounds, sequence construction, export
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run test:browser
                     # real Chromium flow test; set SCREENSHOTS=dir to save screenshots
npm run check:data   # data/ matches site/1/stimuli.js and the SVGs
npm run build:sheet  # rebuilds data/stimuli-notation.xlsx and the CSV copies (needs openpyxl: pip install -r requirements-optional.txt)
npm run build:pdf    # rebuilds data/questions-by-reference.pdf, all 19 questions at physical size grouped by reference (needs Playwright)
```

The browser test needs Playwright with Chromium (`npm i -D playwright &&
npx playwright install chromium`, or point `PLAYWRIGHT_MODULE` at an existing
install). The tests cannot check physical size; see the pre-launch checklist
below.

Append `?reset=1` to the URL to discard the session stored in that browser
and start afresh (useful while testing; a returning participant otherwise
resumes or sees their completion code).

## Two experiments, one app

The runner (calibration, interleaving, counterbalancing, timing, storage) is
shared code in `site/shared/`. Each experiment is a numbered folder with four
small files and its artwork: `index.html`, `main.js`, `config.js` (names the
experiment via `experiment.id`; every session and submission carries it),
`stimuli.js` (asset sizes and the questions) and `assets/`. Folders are
numbered rather than named, and each study is deployed as its own Netlify
project (see below), so a link says nothing about the study. To scaffold a
third:

```sh
node tools/new_experiment.mjs 3 exp3-<short-id> "<Experiment name>"
```

then drop the SVGs into `site/3/assets/`, fill `site/3/stimuli.js` in the
same shape as experiment 1's, and review `site/3/config.js`. Because the
runner is identical, the data sets are directly comparable.

### Experiment 2: Similarity with rotation (`site/2/`)

Built from the designer's handoff of 2026-10-07 (`data/rotation/handoff-*`,
57 SVGs). Sixteen handoff questions each have a reference and three
comparisons that differ from it by a 45° rotation of the sub-shapes only
(`sub`), of the whole object (`whole`) or of the base shape only (`shape`);
the relation is computed from each stimulus's base/sub-shape rotation, not
from the handoff's B/C/D letters. Each question yields three 2AFC screens
(sub vs whole, sub vs shape, whole vs shape): 48 in all, interleaved like
experiment 1, no control question. Every image is the handoff's 512 px square
shown at 41.33 mm (the designer's calibrated size), centred on the rotation
centre so the three objects align; the fill was normalised from #111 to pure
black. `python3 tools/build_rotation_stimuli.py` regenerates
`site/2/stimuli.js`, the assets and `data/rotation/{stimuli,comparisons}.csv`;
`npm run build:pdf:rotation` makes `data/rotation/questions-by-reference.pdf`.

## Participant flow

1. **Information** — the pilot text: "Similarity judgment", one sentence of
   instructions, Continue. (Set `study.requireConsentCheckbox: true` to add
   a consent checkbox.)
2. **Calibration** — match a card to the outline; pixels per mm = matched
   width / 85.60. The separate 1 mm ruler check was removed at the
   researcher's request; every thin line in the study is 1 mm thick.
3. **Instructions** — one sentence; all SVGs are preloaded and decoded here.
   If the window is too small for the stage at this calibration, a notice says
   how many pixels are needed.
4. **Trials** — one response each, by click/tap on B or C or the ← / →
   (also b / c) keys. Timing starts in the frame that first paints the three
   decoded images. A 500 ms blank follows each response. No back navigation.
   If the window becomes too small, the tab is hidden, or an image fails to
   load, the screen goes blank, responses are blocked, and the trial is drawn
   again with timing restarted once the problem clears (slow connections
   simply take longer to load; a failed download shows a retry message); a zoom or screen
   change forces recalibration (Safari's zoom is detected from the viewport
   width since it does not change the device pixel ratio). Objects are never
   scaled to fit.
5. **Completion** — in the pilot configuration just "Finished. Thank you.":
   nothing is sent and nothing is shown. With `storage.mode` set to
   `netlify-forms` or `endpoint` the record is sent and, if
   `completion.showCode` is on, a completion code (the session id unless
   `completion.code` is set) plus optional download buttons and return link
   appear; if sending fails, the participant can retry or download the
   JSON/CSV to email.

Each response is saved to localStorage immediately. In the pilot
(`participant.rememberSession: false`) every visit starts a fresh session, so
the researcher can run through it repeatedly from the same browser. With
`rememberSession: true` a reload resumes at the next unanswered screen after
recalibration, with the same assigned order, provided the stored session was
made by the same experiment, protocol, stimulus set and design and belongs to
the participant id in the URL; a finished participant sees the completion
page again. Browsers that block storage get a warning not to reload.

## Protocol decisions (working defaults — confirm before recruiting)

These were unresolved in the handoff. The defaults below are implemented and
switchable in `config.js`; the researcher's instruction that all questions be
mixed together is reflected in the first three rows.

| Decision | Default | Alternatives in `config.js` |
|---|---|---|
| Trial order | Fully interleaved: all 19 questions shuffled per participant with a recorded seed, and no two consecutive screens from the same object family. | `randomizeTrialOrder: false` (fixed order from `data/trials.json`); `avoidConsecutiveSameFamily: false`. |
| Control placement | Mixed in with the other questions. | `controlPosition: 'first'` or `'excluded'`. |
| Left/right placement | Random per presentation (recorded coin flip), 19 screens. | `sideAssignment: 'fixed'` (canonical order) or `'both'` (every pair in both orders, 38 screens). |
| Repetitions | 1 | `repetitions: 2` presents the whole set twice (interleaving applied within each pass). |
| Practice trials | None. | Not implemented; the control can serve as a warm-up by setting `controlPosition: 'first'`. |
| Timing | No response deadline; 500 ms blank between screens; RT from onset. | `interTrialIntervalMs`. |
| Response input | Click/tap or keyboard; method recorded. | `design.keys`. |
| Breaks | None (19 screens, a few minutes). | — |
| Consent / instructions | Minimal pilot text, no checkbox, no duration or "no right or wrong" sentence. | `study.requireConsentCheckbox`, text fields in `study`, and the HTML in `index.html`. |
| Session memory | Off for the pilot: every visit is a new session. | `participant.rememberSession: true` for real data collection. |
| Participant ID | From `?pid=`, `?PROLIFIC_PID=` or `?participant=`; otherwise a random session id. `STUDY_ID`, `SESSION_ID`, `source` pass through. A stored session is resumed only for the same participant id. | `participant.idParams`, `participant.passthroughParams`. |
| Completion / return | "Finished. Thank you." only; no code, no redirect. | `completion.showCode`, `completion.code`, `completion.redirectUrl`. |
| Dropout handling | An interim record flagged `abandoned` is sent when a participant leaves after at least one response (each reload mid-study sends one; dedupe by session id). Dropouts before the first response leave no server-side trace. Partial data also stays in the browser so they can resume. | `storage.submitPartialOnLeave: false`. |
| Data destination | Supabase tables per experiment (`storage.mode: 'supabase'`; see `supabase/README.md`). Until the project URL and anon key are filled in the mode is `'local'` and nothing is sent. | `'netlify-forms'` (set up below), `'endpoint'` with a JSON POST URL, or `'local'`; `storage.allowDownload: true` for a download button. |
| Fullscreen | Offered, not required. | — |
| Font | System Optima where installed, otherwise Segoe UI / Arial; labels are only A, B, C. | — |
| Screen size | Blocked when the stage does not fit; most laptops fit (about 1157 × 704 CSS px at 5.1 px/mm). Phones and small tablets cannot run it. Large iPads in landscape can; they are not blocked but are identifiable in the data (`max_touch_points`). | — |

Not implemented and not decided here: recruitment platform, viewing distance
(uncontrolled; the protocol must specify it separately if needed), and the
analysis of interrupted trials (see the data dictionary).

## Participant codes: known to you, anonymous in the data

For a run with colleagues, give each person a code and a personal link. Only
the code reaches the experiment and the database (`participant_id`); the list
that ties codes to names stays on your computer.

```sh
python3 tools/make_participant_links.py names.txt --out participants-private.xlsx
```

`names.txt` has one name (or email) per line. The output lists, per person, a
six-character code and two links (`https://2afc-study-1.netlify.app/?pid=CODE`
for Lines with edges, `https://2afc-study-2.netlify.app/?pid=CODE` for
Similarity with rotation; `--site1`/`--site2` for other addresses), both
carrying the same code so the two data sets can be joined on
`participant_id`. The file is
private: `participants-private*` is git-ignored, and you share only each
person's links. Re-run with `--existing participants-private.csv` to add
people while keeping earlier codes, or `--codes-only 10` for codes without
names.

Alternatively, and this is how the pilot is set up, send everyone the bare
study links and let each person make up their own code: the first page asks
for an 8-digit number and tells them to use the same number in both studies
(`participant.requireCode`, `participant.codePattern`). Then no list ties
codes to people unless they tell you their number; the price is that the join
between the two studies depends on them typing the same number twice. The
record notes whether the code came from the link or was typed
(`participant_id_source`). What else is stored about a person: screen
and window sizes, device pixel ratio, browser user agent and language, and
touch capability. None of that is a name, but a user agent plus screen size
can be distinctive in a small group, so keep the mapping file and the
database access equally private.

## Data storage with Supabase

The intended destination. `supabase/README.md` has the three setup steps:
run `supabase/migrations/0001_experiment_tables.sql` in the SQL editor, put
the project URL and anon key into both `config.js` files, set
`storage.mode: 'supabase'`. Each experiment writes to its own pair of tables
(`lines_with_edges_*`, `similarity_with_rotation_*`): one row per answered
screen with the reaction time, and one row per session with the full record.

## Data storage with Netlify Forms (alternative)

The deployed `site/1/index.html` contains a hidden form named
`line-similarity-responses`; the app posts to it with the fields listed in
`docs/EXPERIMENT_DATA.md`. The complete session record is in the `payload`
field as JSON.

Setup, once:

1. In the Netlify dashboard open the site, then **Forms** (Site configuration →
   Forms) and **enable form detection**. Then trigger a deploy (push a commit,
   or **Deploys → Trigger deploy**); the form only registers on a deploy made
   after detection is enabled.
2. After the deploy, **Forms** lists `line-similarity-responses`. Run through
   the study once yourself and confirm the submission appears. Check the
   **Spam** tab as well: large JSON payloads are sometimes classed as spam by
   Netlify's filter, and can be marked as verified from there.
3. Export submissions as CSV from the form's page, or read them through the
   Netlify API. Parse the `payload` column.

Limits: the free Forms tier accepts 100 submissions per month across the
project. Each completed participant uses one submission, plus one for each
abandoned interim record (each reload mid-study sends one). For a larger run
switch `storage.mode` to `'endpoint'` and provide a receiver. See the
deduplication procedure in `docs/EXPERIMENT_DATA.md`.

## Stimulus notation spreadsheet

`data/stimuli-notation.xlsx` (and the `stimuli-notation.csv` /
`comparisons-notation.csv` copies) describe every object and comparison in
the researcher's notation: **B** = body (main part), **E** = edges (endpoint
components), **ext** = extension (length doubled, thickness unchanged),
**enl** = enlargement (every dimension doubled). The reference is `B E`; the
comparison conditions are `Bext E` (L), `Benl Eenl` (P) and, for the
endpoint-only condition, `B Eenl` for the arrow, circles and abstract
endpoint but `B Eext` for the red segments and the vertical end lines, where
the specification says the edge is lengthened at unchanged thickness. The
control has no edges (`B`, `Bext`, `Benl`). Dimensions come from
`data/measurements.csv`.

## Before recruiting

The handoff's cautions still apply. No human physical-size validation or
cross-browser validation has been performed.

- Open the deployed page on each target device type. Physically match a card,
  then check the control question's 1 mm line with a ruler.
- Switch on data collection: `storage.mode: 'supabase'` with the project URL
  and anon key, `participant.rememberSession: true` for real participants,
  and `completion.showCode` if a platform needs a code.
- Inspect every stimulus (19 screens; use `?reset=1` to repeat).
- Exercise browser zoom (including Safari), full screen, window resizing,
  tab switching and monitor switching; confirm recalibration prompts, the
  fit block, and that a trial interrupted by a tab switch is drawn again.
- Test keyboard and mouse/trackpad responses and that no double response is
  possible.
- Complete a session and confirm the submission arrives in Netlify Forms and
  that the downloaded JSON/CSV open correctly.
- Fill in `study.institution`, `study.researcher`, `study.contactEmail` and
  `study.ethicsReference` in `config.js`, set `completion.code` or
  `completion.redirectUrl` if a platform needs them, and bump
  `protocolVersion` whenever the design changes (a changed protocol version
  also discards any in-progress session stored in a participant's browser).

## Files

- `site/shared/` — the runner: `app.js` flow, `design.js` sequence construction, `storage.js` persistence/submission/CSV, `geometry.js` physical layout, `style.css`.
- `site/` root — experiment 1: `index.html`, `main.js`, `config.js` settings, `stimuli.js` asset dimensions and the 19 questions, `assets/`.
- `tools/new_experiment.mjs` — scaffolds another experiment folder.
- `docs/STIMULUS_SPECIFICATION.md` — transformations and dimensions (authoritative).
- `docs/EXPERIMENT_DATA.md` — data dictionary of the records produced.
- `docs/PROVENANCE.md` — revision history of the artwork.
- `data/trials.json`, `trials.csv` — the 19 questions in canonical order with condition codes.
- `data/assets.json`, `measurements.csv` — physical dimensions per SVG (total bounds and main-part dimensions separately).
- `data/families.json`, `layout.json` — family metadata and the stage layout.
- `data/pdf-source-crop-map.json` + `pdf-history/stimuli-2afc-review.pdf` — source of the non-control SVGs; `tools/export_stimuli.py` regenerates them (needs PyMuPDF).
- `previews/` — offline renders of the train and lamp layout from the handoff, plus headless-Chromium screenshots of the control and train screens from the browser test.
- `tests/` — `test.mjs` (Node) and `browser-test.mjs` (Playwright).

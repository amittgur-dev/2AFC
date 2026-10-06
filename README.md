# Line-similarity 2AFC experiment

A calibrated, browser-based two-alternative forced-choice study, deployed as its own static Netlify site. On each
screen a reference object **A** appears above two comparison objects **B**
(left) and **C** (right); the participant chooses the one that looks more
similar to A. Objects are rendered at fixed physical sizes after the
participant matches a bank card to an on-screen outline.

| Where | What |
|---|---|
| `site/` | The deployable app: plain HTML/CSS/JS modules and 32 SVG stimuli. No build step, no dependencies. Netlify publishes this folder as the site root. |
| `site/config.js` | Every study setting a researcher changes: protocol version, design (order, counterbalancing, repetitions), participant-ID parameters, storage destination, completion code/redirect, study text fields. |
| `docs/`, `data/`, `tools/`, `tests/` | Researcher materials: data dictionary, stimulus specification, data files and the stimulus spreadsheet, data-check/export tools, Node and real-browser tests. |

The app was built from the ChatGPT handoff of 2026-10-05 (`data/handoff-manifest.json`
lists that package's checksums). The accepted artwork, the calibrated
dimensions and the 220 × 120 mm triangle layout are unchanged. The
historical `legacy-workspace/` of that package (5 MB of PDF build scripts and
QA renders) is not in this repository; keep the original zip if you need it.

## Deploy on Netlify

The repository is a static site with no build. `netlify.toml` sets the
publish directory to `site`, adds a no-index header and disables caching so a
config change is picked up on the next load.

Either connect the repository: Netlify → **Add new site → Import an existing
project → GitHub → this repository**; accept the detected settings (no build
command, publish directory `site`) and deploy. Every push to the default
branch redeploys.

Or, for a quick pilot without Git: drag the `site` folder onto
<https://app.netlify.com/drop>. Forms still work after enabling form
detection (below).

Then follow **Data storage with Netlify Forms** below once; the form only
registers on a deploy made after detection is enabled.

## Run and test

```sh
npm run serve        # http://localhost:8000  (any static server works; file:// does not)
npm test             # Node checks: geometry, bounds, sequence construction, export
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run test:browser
                     # real Chromium flow test; set SCREENSHOTS=dir to save screenshots
npm run check:data   # data/ matches site/stimuli.js and the SVGs
npm run build:sheet  # rebuilds data/stimuli-notation.xlsx and the CSV copies
```

The browser test needs Playwright with Chromium (`npm i -D playwright &&
npx playwright install chromium`, or point `PLAYWRIGHT_MODULE` at an existing
install). The tests cannot check physical size; see the pre-launch checklist
below.

Append `?reset=1` to the URL to discard the session stored in that browser
and start afresh (useful while testing; a returning participant otherwise
resumes or sees their completion code).

## Participant flow

1. **Information** — a few lines (the pilot has no consent checkbox; set
   `study.requireConsentCheckbox: true` to add one), Continue.
2. **Calibration** — match a card to the outline; pixels per mm = matched
   width / 85.60.
3. **Verification** — a 1 mm × 40 mm line and a 50 mm span for a ruler check.
4. **Instructions** — one sentence; all SVGs are preloaded and decoded here.
   If the window is too small for the stage at this calibration, a notice says
   how many pixels are needed.
5. **Trials** — one response each, by click/tap on B or C or the ← / →
   (also b / c) keys. Timing starts when the three images are decoded and
   painted. A 500 ms blank follows each response. No back navigation. If the
   window becomes too small, responses are blocked until space returns and the
   trial restarts; a zoom or screen change forces recalibration. Objects are
   never scaled to fit.
6. **Completion** — the record is sent; the participant sees a completion
   code (the session id unless `completion.code` is set) and optional
   download buttons and return link. If sending fails, they can retry or
   download the JSON/CSV to email.

Each response is saved to localStorage immediately. A reload resumes at the
next unanswered screen after recalibration, with the same assigned order.

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
| Consent / instructions | Minimal pilot text, no checkbox. | `study.requireConsentCheckbox`, text fields in `study`, and the HTML in `index.html`. |
| Participant ID | From `?pid=`, `?PROLIFIC_PID=` or `?participant=`; otherwise a random session id. `STUDY_ID`, `SESSION_ID`, `source` pass through. | `participant.idParams`, `participant.passthroughParams`. |
| Completion / return | Session id shown as the completion code; no redirect. | `completion.code`, `completion.redirectUrl`. |
| Dropout handling | An interim record flagged `abandoned` is sent when a participant leaves mid-study; partial data also stays in their browser so they can resume. | `storage.submitPartialOnLeave: false`. |
| Data destination | Netlify Forms on this site (below). | `storage.mode: 'endpoint'` with a JSON POST URL (e.g. a Netlify Function, Google Apps Script or your own server), or `'local'` (download only). |
| Fullscreen | Offered, not required. | — |
| Font | System Optima where installed, otherwise Segoe UI / Arial; labels are only A, B, C. | — |
| Screen size | Blocked when the stage does not fit; most laptops fit (about 1157 × 704 CSS px at 5.1 px/mm). Phones and small tablets cannot run it. | — |

Not implemented and not decided here: recruitment platform, viewing distance
(uncontrolled; the protocol must specify it separately if needed), and the
analysis of interrupted trials (see the data dictionary).

## Data storage with Netlify Forms

The deployed `site/index.html` contains a hidden form named
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
site. Each completed participant uses one submission, plus one for each
abandoned interim record. For a larger run switch `storage.mode` to
`'endpoint'` and provide a receiver.

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
  then check the 1 mm control line and the 50 mm span with a ruler.
- Inspect every stimulus (19 screens; use `?reset=1` to repeat).
- Exercise browser zoom, full screen, window resizing, tab switching and
  monitor switching; confirm recalibration prompts and the fit block.
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

- `site/` — the app. `app.js` flow, `design.js` sequence construction, `storage.js` persistence/submission/CSV, `geometry.js` physical layout, `stimuli.js` asset dimensions and the 19 questions, `config.js` settings.
- `docs/STIMULUS_SPECIFICATION.md` — transformations and dimensions (authoritative).
- `docs/EXPERIMENT_DATA.md` — data dictionary of the records produced.
- `docs/PROVENANCE.md` — revision history of the artwork.
- `data/trials.json`, `trials.csv` — the 19 questions in canonical order with condition codes.
- `data/assets.json`, `measurements.csv` — physical dimensions per SVG (total bounds and main-part dimensions separately).
- `data/families.json`, `layout.json` — family metadata and the stage layout.
- `data/pdf-source-crop-map.json` + `pdf-history/stimuli-2afc-review.pdf` — source of the non-control SVGs; `tools/export_stimuli.py` regenerates them (needs PyMuPDF).
- `previews/` — offline renders of the train and lamp layout from the handoff, plus headless-Chromium screenshots of the control and train screens from the browser test.
- `tests/` — `test.mjs` (Node) and `browser-test.mjs` (Playwright).

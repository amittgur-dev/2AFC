# 1. The experiments and their design

## The task

Each screen shows a reference object A centred near the top and two comparison
objects, B on the left and C on the right, with the question "Which is more
similar to A?". The participant clicks or taps B or C, or presses the left or
right arrow key (also `b` / `c`). One response per screen, no feedback, no
time limit, then a 500 ms blank and the next screen. Screenshots of real
screens are in `previews/`.

Everything is drawn at a known physical size. Before the task the participant
drags a slider until an outline matches a bank card (85.60 mm wide); the app
derives CSS pixels per millimetre (`pixels_per_mm = card_width_px / 85.60`)
and renders a 220 x 120 mm stage with A centred at (110, 30) mm, B at
(55, 77) mm and C at (165, 77) mm; labels sit 8 mm above each object. Objects
are never scaled to fit: if the window is too small the screen is blocked
until it fits. A zoom or screen change forces recalibration.

## Experiment 1: Lines with edges

`experiment_id = 'exp1-lines-with-edges'`, 19 screens, stimulus set
`2026-10-07-unit-lines-v2`.

Nine object families. In each, the reference A is a line-like body with (in
families 1 to 8) edge components at its end(s). The comparisons modify the
body and/or the edges:

| Code | Name | Researcher's notation | Body (main part) | Edges |
|---|---|---|---|---|
| A | reference | `B E` (control: `B`) | 40 mm long, 1 mm thick | as drawn |
| E | edge-only modification | `B Eenl` (families 1, 2, 5) or `B Eext` (families 3, 4) | unchanged | enlarged (every dimension doubled) or, for the red segments and vertical end lines, lengthened at unchanged thickness |
| L | extension | `Bext E` | 80 mm long, 1 mm thick (length doubled) | unchanged |
| P | proportional enlargement | `Benl Eenl` | 80 mm long, 2 mm thick (everything doubled) | enlarged |

`B` = body, `E` = edges, `ext` = extension (length doubled, thickness
unchanged), `enl` = enlargement (every dimension doubled). The snake, train and
lamp follow the same logic with their own sizes (snake body 40 x 2 mm; train
carriage 42 x 4.2 mm; lamp pole 30 x 0.75 mm, vertical); the exact dimensions
of every object are in `stimuli/exp1_lines_with_edges/assets.csv` and
`STIMULUS_SPECIFICATION.md`.

| Family | Object | Group | Screens (pairs compared) |
|---|---|---|---|
| 0 | Plain line (no edges) | Control | L vs P |
| 1 | Double-headed arrow | Bi-directional | E vs L, E vs P, L vs P |
| 2 | Circles at both ends | Bi-directional | E vs L, E vs P, L vs P |
| 3 | Colored (red) end segments | Bi-directional | E vs L, E vs P, L vs P |
| 4 | Short vertical end lines | Bi-directional | E vs L, E vs P, L vs P |
| 5 | One abstract right endpoint | Uni-directional | E vs L, E vs P, L vs P |
| 6 | Snake | Uni-directional | L vs P |
| 7 | Train | Uni-directional | L vs P |
| 8 | Lamp (vertical) | Uni-directional | L vs P |

Question ids (`trial_id`) are `family.pair`: `1.1` = arrow E vs L, `1.2` =
arrow E vs P, `1.3` = arrow L vs P, `6.1` = snake L vs P, and so on; the full
list with the canonical left/right order is
`stimuli/exp1_lines_with_edges/comparisons.csv`. Asset ids are
`family-condition` (`3-A`, `3-E`, `3-L`, `3-P`), matching the SVG file names.

Families 1 to 5 each contribute all three pairs of E, L and P, so within a
family the data form a complete paired-comparison design of the three
conditions. The control family has no edges and only L vs P.

Participant flow: first page (task description, 8-digit code), consent page
(checkbox), age and gender page, calibration, instructions in large type, the
19 screens, "Finished. Thank you." Duration 1 to 3 minutes.

## Experiment 2: Similarity with rotation

`experiment_id = 'exp2-similarity-with-rotation'`, 24 screens, stimulus set
`squares-diamonds-2026-10-31` (an earlier pilot used a 48-screen set,
`exp2-similarity-with-rotation-v2`, with triangles; tell the sets apart by
`stimulus_set_version`).

Eight questions. Each reference is a figure made of small squares: in
questions 1 to 4 a 4 x 4 texture of 16 small squares (`group_name =
'texture'`), in questions 5 to 8 four larger squares at the corners of a
square configuration (`group_name = 'four figurative parts'`). A square
rotated 45° is called a diamond; the question name gives the global
configuration and the local parts. Three comparisons differ from the
reference by one 45° rotation:

| Condition | Description shown in the PDF | What changed relative to A |
|---|---|---|
| `sub` | Sub-shapes rotated 45° | every small square rotated 45° in place; the arrangement unchanged |
| `whole` | Whole rotated 45° | the entire figure rotated 45° |
| `shape` | Global shape rotated 45° | the arrangement rotated 45°; the small squares keep their orientation |

Each question yields three screens (`trial_id` = `question.pair`): pairs in
the designer's letter order, B vs C, B vs D, C vs D, which in questions 1 to
4 means sub vs whole, sub vs shape, whole vs shape and in questions 5 to 8
shape vs whole, shape vs sub, whole vs sub (`trials.source` records the
letters). Asset ids are `question-condition` (`3-A`, `3-sub`, `3-whole`,
`3-shape`). Only eight drawings exist (`S001` to `S008`); square symmetry
makes the same drawing serve several questions in different roles, which
`stimuli/exp2_similarity_with_rotation/assets.csv` maps out.

| Question | Reference | Group |
|---|---|---|
| 1 | Square of squares | texture |
| 2 | Square of diamonds | texture |
| 3 | Diamond of squares | texture |
| 4 | Diamond of diamonds | texture |
| 5 | Square of squares | four figurative parts |
| 6 | Square of diamonds | four figurative parts |
| 7 | Diamond of squares | four figurative parts |
| 8 | Diamond of diamonds | four figurative parts |

Every image is a 42.64 mm square (the designer's calibrated size) with the
figure centred on its rotation centre, so A, B and C align; the figures
themselves are 24 to 36 mm wide (`figure_width_mm`). No control question.

Participant flow: the same as experiment 1 (welcome page, consent page,
calibration, instructions, the 24 screens, the final page with the Prolific
return); no age and gender page.

## Randomisation and counterbalancing (both experiments)

- All screens are shuffled per participant with a seeded random generator;
  the seed is in `design.seed` of the session row and the resulting order in
  `record.sequence` (and in `presentation_index` of every trial row).
- Shuffles with two consecutive screens from the same family (same object /
  same question) are rejected and repaired (`design.interleaved = true` when
  the constraint was met).
- Left/right placement of the two comparisons is a recorded coin flip per
  screen: `side_assignment = 'canonical'` means the order of `comparisons.csv`
  (first comparison on the left), `'reversed'` the opposite. `left_condition`,
  `right_condition`, `left_asset_id`, `right_asset_id` always say what was
  shown where.
- Each screen is shown once (`repetitions = 1`, `repetition_index = 0`).
- `app-source/reproduce_sequence.mjs <1|2> <seed> '<design json>'` rebuilds the
  order from the seed with the app's own code (needed only for sessions whose
  record is compact or minimal; see the data dictionary).

## Timing

`reaction_time_ms` is `performance.now()` at the response minus the stimulus
onset, rounded to 0.1 ms. Onset is the animation frame that first paints the
three objects, after all three SVGs were loaded and decoded and two blank
frames passed; it precedes the physical appearance by at most one display
refresh. Wall-clock copies are `stimulus_onset_at` and `response_at`. There
is no deadline. A screen that was interrupted (tab hidden, window too small,
zoom or screen change, recalibration, image failed to load) goes blank, blocks
responses and is drawn again with timing restarted once the problem clears;
`attempts` counts the drawings and `interruptions` lists what happened.

## Versions

`protocol_version 2026-10-06-v1`, `layout_version 2026-10-07-unit-lines-v2`,
`consent_version 2026-10-08-v2` (experiment 1), stimulus sets as above. Every
row carries these, so later changes can be told apart.

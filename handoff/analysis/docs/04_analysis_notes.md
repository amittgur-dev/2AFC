# 4. Analysis notes

These notes describe what the data can answer and the choices to make before
analysing. The research questions are stated as the design implies them;
confirm them with the researcher.

## Unit of analysis

One response per participant per screen (question). In experiment 1 every
participant answers each of the 19 questions once; in experiment 2 each of the
48. The dependent variable is `chosen_condition` (which transformation of the
reference was judged more similar), with `reaction_time_ms` as a secondary
measure. Responses are binary per screen; proportions arise across
participants. `pair_type` (from the loader or query 3) names the comparison.

## Experiment 1: Lines with edges

Each comparison asks whether similarity to the reference is preserved better
by one transformation than another:

| Pair | Contrast | A natural coding |
|---|---|---|
| L vs P (all nine families) | extension of the body only (`Bext E`) against proportional enlargement of everything (`Benl Eenl`) | `chose_P` = 1 if `chosen_condition = 'P'` |
| E vs L (families 1 to 5) | edge-only change against body extension | `chose_L` |
| E vs P (families 1 to 5) | edge-only change against proportional enlargement | `chose_P` |

Suggested analyses:

1. **Per question**: proportion choosing each condition with a binomial
   confidence interval and a test against 0.5 (query 3 gives the counts).
2. **Per family, scaling**: families 1 to 5 have all three pairs of E, L and
   P, a complete paired-comparison design. A Bradley-Terry or Thurstone Case V
   model gives each condition a position on a "similarity to A" scale per
   family, and the group-level transitivity can be checked (if L beats E and
   P beats L, does P beat E?).
3. **Across families**: does the L vs P preference differ between the control
   (no edges), the bi-directional families (edges at both ends), the
   uni-directional abstract family 5 and the familiar objects (snake, train,
   lamp)? A mixed-effects logistic regression of `chose_P` with a random
   intercept per participant and family as a fixed or random effect is the
   standard tool; with few participants, report proportions per family with
   intervals.
4. **Edge type**: among families 1 to 5, the E condition enlarges the edges in
   three families (arrow, circles, abstract endpoint: `B Eenl`) and lengthens
   them in two (red segments, vertical end lines: `B Eext`); the
   `chosen_notation` / `left_notation` / `right_notation` columns from
   `assets.csv` carry that distinction.
5. **Reaction time**: median per participant and pair type (log RT for
   models); compare pair types and families; relate to choice (faster
   responses for stronger preferences). Exclude interrupted screens and
   consider trimming extreme values (for example below 200 ms or above 10 s),
   stating the rule.
6. **Controls**: side bias (`chosen_side`, expected 0.5), effect of
   `response_method`, order effects (`presentation_index`), and whether the
   control question behaves as expected.

Demographics (`age`, `gender`) are available for every experiment 1
participant.

## Experiment 2: Similarity with rotation

Each of the 16 questions has three comparisons (sub, whole, shape) and all
three pairwise screens, so the same per-question scaling applies: estimate for
every question which rotation (of the sub-shapes, of the whole figure, of the
global shape only) preserves similarity best.

| Pair | Contrast |
|---|---|
| sub vs whole | rotating only the sub-shapes against rotating everything |
| sub vs shape | rotating only the sub-shapes against rotating only the global shape |
| whole vs shape | rotating everything against rotating only the global shape |

Structure to exploit: the four groups (`group_name`: squares and diamonds;
triangles; squares and triangles; diamonds and triangles), the base shape
and the sub-shape of each reference (`assets.csv`: `shape`, `sub_shape`),
and the fact that a reference with a rotated base (diamond, rotated triangle)
has comparisons whose bounding boxes are smaller rather than larger
(`figure_width_mm`). Note that some drawings appear in several questions in
different roles (for example S003 is the reference of question 3 and a
comparison in questions 1, 2 and 4), which is a feature of the design, not an
error. No demographics and no control question in this experiment.

## Joining the two experiments

Participants typed their own 8-digit code in both studies. Join on
`participant_id`; expect some codes present in only one experiment or typed
differently. Report the overlap.

## Exclusions and data quality

- Sessions: latest attempt, completed, one per code (doc 2). Report how many
  abandoned sessions and repeat runs there were.
- Test runs: rows created before dissemination and codes the researcher
  used for testing.
- Screens: flag `interrupted`; report results with and without them if they
  are more than a handful.
- Calibration: implausible `pixels_per_mm` means objects were not at the
  intended physical size; consider excluding or at least reporting.
- Device: `max_touch_points > 1` with a Macintosh user agent is an iPad;
  `response_method` distinguishes taps/clicks from keys.
- Very fast responses (well under 200 ms) are unlikely to be judgments.
- There are no attention checks or repeated screens, so consistency cannot be
  measured within a participant; reaction time and side bias are the
  available quality signals.

## Reporting

Number of participants per experiment (and in both), the per-question table
of proportions with intervals, the per-family or per-question scale values,
model estimates where used, and median reaction times. The stimulus PDFs in
`stimuli/` show every question in the researcher's grouping and can
illustrate the results.

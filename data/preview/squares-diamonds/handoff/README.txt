STIMULUS HANDOFF: ONLINE 2AFC SIMILARITY EXPERIMENT

CONTENTS AND EXPERIMENT
This ZIP contains only images/, stimuli.csv, questions.csv, and this README.txt.
There are 8 distinct vector images, 8 original questions, and exactly 3
comparison objects (B, C, D) per original question. questions.csv has 24 rows,
one per ORIGINAL comparison object; its rows are not already expanded trials.
The first four questions use a 4-by-4 texture of 16 small squares. The next
four use four larger squares as figurative parts, positioned at the vertices
of a square configuration. A square rotated 45 degrees is called a diamond.
The title describes the reference's global configuration and local parts.

SCREEN GENERATION AND ORDER
Read original questions in numeric order 1 through 8 (the order in the
original 8-page stimulus PDF). Within each question, preserve B, C, D order.
Generate each unordered comparison pair exactly once, in this order:
  Pair 1: original B versus original C.
  Pair 2: original B versus original D.
  Pair 3: original C versus original D.
There are N*(N-1)/2 screens per question; N=3 gives 3 screens, 24 in total.
Screen number = (question_number - 1)*3 + pair number.
On each screen, place the reference at the top, labeled A. Place the first
member of the pair below on the left, labeled B, and the second below on the
right, labeled C. Original comparison letters are source identities, not
permanent display labels. Draw labels in the experiment interface, outside
the images. This package does not randomize or counterbalance left/right
positions; if the experiment does so, retain and log the source identities.

GENERATION, GEOMETRY, AND SCALE
Original tool: "Similarity with rotation".
Original canvas name: "Stimuli Rutie & Amit_square/diamonds_texture and
figurative parts". The tool version was not supplied in the source export.
The provided SVG exports and manifest were processed with Python: their
polygon transforms were resolved into coordinates, symmetry-equivalent
drawings were deduplicated, and figure fills were changed from #111 to #000000.
No images were regenerated with AI. Geometry and relative object sizes were
preserved (coordinate rounding is at most 0.000001 original canvas unit).
Every SVG has a 512 x 512 nominal-pixel square canvas and a centered viewBox:
  -98.141333 -98.141333 196.282666 196.282666
ONE common scale for ALL files: 2.608483012963 image pixels per original
canvas unit. This is computed from 512 / 196.282666; the original manifest
rounded it to 2.608483. Do not crop, fit to visible figure bounds, or normalize
individual figures. Display every full square image canvas at the same size.
The object_scale parameter is part of the source design, not an independent
export scale: it is 1 for textures and 0.7748 for four figurative parts.
All figures are centered on (0,0), the base shape's rotation center. Flattening
transforms does not move that center. Backgrounds are white (#ffffff), figures
are pure black (#000000), and images contain no text or labels. SVG provides
exact vector edges with no baked-in raster anti-aliasing fringes. Browsers may
smooth vector edges during display; that rendering behavior is not an image
artifact and cannot be prohibited by the SVG file alone.
The largest vertex radius is 82.442925950 canvas units. Even under any
additional rigid rotation, it stays within the square with at least
7.997857% margin on each side (about 8%).

INTENDED VIEWING SIZE
The original designer's calibration was 4.603 canvas units per millimetre.
Each FULL image canvas should occupy 42.642334564 x 42.642334564 mm.
figure_width_mm and figure_height_mm give each visible figure's bounding-box
size at that common physical scale. Sizes are recalculated from the SVG
geometry, rather than copied from the source's two-decimal rounded values.
The nominal 512 pixels are SVG image coordinates, not a requirement to show
512 device pixels. For a participant-specific calibration of P CSS pixels
per millimetre, use image width and height = 42.642334564 * P CSS pixels.
Use the same P and image canvas size for every stimulus. Browser 100% zoom
or CSS millimetres alone do not guarantee a physical millimetre on a screen.
Check actual display size on the intended monitor or calibrate online.

NAMING AND DELIBERATE SHARING
Files are S001.svg through S008.svg. IDs follow the first occurrence of each
distinct drawing in the supplied source manifest, whose entries were ordered
S001 through S020. Handoff IDs are NEW compact IDs; do not confuse them with
source IDs. source_stimulus_ids records the complete original-to-handoff map.
A file field is a filename relative to images/; resolve it as images/<file>.
Square symmetry makes rotations differing by 90 degrees visually identical,
so 20 source parameter entries become 8 distinct images. Each visual drawing
has one file even when it appears as a reference in one question and a
comparison in another. Textures and four-part figures remain separate assets.
Canonical rotation fields in stimuli.csv use the first source representative.
Question deltas use original occurrence angles; they must NOT be recomputed
by subtracting the canonical image-row angles after deduplication. Exact
occurrence angles and original source IDs are retained in questions.csv notes.

RELATION LABELS (EXACT FIXED STRINGS)
Angles are in degrees. Positive rotation is clockwise on the screen, whose
y-axis points downward. All relations here are +45 degrees, unwrapped from
the source angles. Every source frame is screen.
"sub-shapes rotated 45°": base delta 0, sub delta +45. Rotate every local
square 45 degrees about its own center; keep the arrangement of centers fixed.
"whole rotated 45°": base delta +45, sub delta +45. Rotate the arrangement
of centers and every local square together 45 degrees about the base center.
"global shape rotated 45°": base delta +45, sub delta 0. Rotate the arrangement
of centers 45 degrees about the base center; keep local square orientations
fixed in screen coordinates.
These three labels exhaust all transformations in questions.csv. Identical
transformations use identical label text, regardless of comparison letter.
Do not add a further rotation to an image: each supplied file already depicts
the requested orientation; the deltas and labels describe its relationship.

STIMULI.CSV COLUMN DEFINITIONS
file: SVG filename relative to images/.
stimulus_id: unique handoff ID without extension.
base_shape: underlying global geometry before rotation (square).
sub_shape: local element geometry before rotation (square).
arrangement: texture = a 4-by-4 grid; vertices = four figurative parts at the
base configuration's corners.
density: texture grid count along one side (4); blank for vertices.
base_rotation_deg: canonical source rotation of the arrangement of centers.
sub_rotation_deg: canonical source absolute local-square orientation.
frame: screen means local angles stay screen-fixed when the base angle changes;
vertex would mean local angles rotate with the base. Only screen occurs here.
figure_width_px, figure_height_px: axis-aligned visible-figure bounding-box
width and height in nominal 512-canvas pixels, excluding blank margin.
figure_width_mm, figure_height_mm: the same bounds at intended physical size.
sub_shape_ratio: source local-shape size parameter (0.1237 or 0.52); it is
preserved as exported, not a browser image-width fraction. The resolved SVG
geometry is authoritative for exact dimensions.
object_scale: source object-level geometry multiplier, already baked into SVG.
element_count: number of local squares (16 for texture, 4 for vertices).
canvas_width_px, canvas_height_px: nominal SVG viewport size, both 512.
canvas_width_units, canvas_height_units: original canvas-unit extent of the
square viewBox, both 196.282666.
image_px_per_canvas_unit: common conversion from original units to image pixels.
canvas_width_mm, canvas_height_mm: intended physical size of the full canvas.
canvas_units_per_mm: original physical calibration, 4.603.
source_stimulus_ids: space-separated original manifest IDs sharing this drawing.
notes: explanation of canonical rotations and where occurrence angles are kept.

QUESTIONS.CSV COLUMN DEFINITIONS
question_number: original question index 1-8, in original stimulus-PDF order.
question_name: short reference name without the group suffix.
group: texture or four_figurative_parts; the question's presentation family.
reference_file: shared reference image for this original question, relative
to images/; its screen label is always A.
comparison_letter: original comparison identity B, C, or D; remap to B/C when
expanding a pair into a two-alternative screen.
comparison_file: image filename for that original comparison, relative to images/.
relation_to_reference: one of the three exact transformation labels above.
base_rotation_delta_deg: comparison minus reference source base angle.
sub_rotation_delta_deg: comparison minus reference source local angle.
notes: original source IDs and both occurrence-specific angle pairs, explaining
why canonical stimulus angles need not reproduce the source deltas.
Both CSV files use UTF-8, a header row, and comma-separated, quoted fields
where necessary. Empty density means not applicable, not zero.

VERIFICATION COMPLETED BEFORE PACKAGING
PASS: Every reference_file and comparison_file in questions.csv exists in images/.
PASS: Every file in images/ is referenced at least once in questions.csv.
PASS: No two image files are identical: all 8 have distinct byte hashes,
canonical polygon geometry, and rendered pixel hashes at 2048 x 2048.
PASS: Each question has exactly 3 comparisons; its reference and all 3
comparisons are visually distinct from each other after geometry deduplication.
PASS: Relation labels are consistent: each original (base delta, sub delta)
pair maps to exactly one fixed label, and each label to exactly one delta pair.
PASS: All 8 questions yield all three unique unordered pairs, hence 24 screens.
PASS: All images have the same square canvas, scale, white background, black
vector figure fills, centered rotation origin, and sufficient rotation margin.

CHECK BEFORE RUNNING
Confirm physical size on the actual display, equal CSS sizes for all image
canvases, no additional rotation or cropping, and no unintended image styling.
Confirm the experiment logs the original question, pair identities, actual
left/right placement, and choice. Display labels A/B/C outside the images.
This handoff specifies stimulus content and pairing; timing, randomization,
response keys, and participant instructions are not specified by the source.

QUESTIONS IN ORDER

1. Square of squares (texture); reference A: S001.svg
   B: S002.svg - sub-shapes rotated 45°
   C: S003.svg - whole rotated 45°
   D: S004.svg - global shape rotated 45°

2. Square of diamonds (texture); reference A: S002.svg
   B: S001.svg - sub-shapes rotated 45°
   C: S004.svg - whole rotated 45°
   D: S003.svg - global shape rotated 45°

3. Diamond of squares (texture); reference A: S004.svg
   B: S003.svg - sub-shapes rotated 45°
   C: S002.svg - whole rotated 45°
   D: S001.svg - global shape rotated 45°

4. Diamond of diamonds (texture); reference A: S003.svg
   B: S004.svg - sub-shapes rotated 45°
   C: S001.svg - whole rotated 45°
   D: S002.svg - global shape rotated 45°

5. Square of squares (four figurative parts); reference A: S005.svg
   B: S006.svg - global shape rotated 45°
   C: S007.svg - whole rotated 45°
   D: S008.svg - sub-shapes rotated 45°

6. Square of diamonds (four figurative parts); reference A: S008.svg
   B: S007.svg - global shape rotated 45°
   C: S006.svg - whole rotated 45°
   D: S005.svg - sub-shapes rotated 45°

7. Diamond of squares (four figurative parts); reference A: S006.svg
   B: S005.svg - global shape rotated 45°
   C: S008.svg - whole rotated 45°
   D: S007.svg - sub-shapes rotated 45°

8. Diamond of diamonds (four figurative parts); reference A: S007.svg
   B: S008.svg - global shape rotated 45°
   C: S005.svg - whole rotated 45°
   D: S006.svg - sub-shapes rotated 45°

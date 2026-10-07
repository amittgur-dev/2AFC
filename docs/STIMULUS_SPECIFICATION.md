# Stimulus specification

Revision 2026-10-07 (stimulus set `2026-10-07-unit-lines-v2`): at the
researcher's request families 1–6 are now rendered at the full measured master
size (scale 1.0 instead of 0.9), so every thin line is 1 mm thick and 40 mm
long, identical to the plain-line control. The SVG artwork is unchanged; only
the physical rendering size changed. The train (scale 0.6) and the lamp (scale
0.75) keep their previous sizes because at full size they do not fit the fixed
220 × 120 mm stage (the lamp P would be 102 mm tall, the train P 168 mm wide).
The tables below give the current sizes.

All quantities below are physical millimetres after calibration. data/measurements.csv contains every delivered asset's total width/height and main-part dimensions. SVG internal units are arbitrary drawing coordinates; render them using the JSON widthMm/heightMm values, not the SVG width attribute alone.

## Family mapping

| Current family | Earlier measured figure | Group | Object | Comparisons |
|---|---|---|---|---|
| 0 | new | Control | Plain line | L/P |
| 1 | 1 | Bi-directional | Double-headed arrow | E/L, E/P, L/P |
| 2 | 4 | Bi-directional | Circles | E/L, E/P, L/P |
| 3 | 5 | Bi-directional | Red segments | E/L, E/P, L/P |
| 4 | 6 | Bi-directional | Vertical end lines | E/L, E/P, L/P |
| 5 | 3 | Uni-directional | Abstract right endpoint only | E/L, E/P, L/P |
| 6 | 7.1 | Uni-directional | Snake | L/P |
| 7 | 7.2 | Uni-directional | Train | L/P |
| 8 | 7.3 | Uni-directional | Vertical lamp | L/P |

Trial IDs are family.pair, e.g. 1.1, 1.2, 1.3 and 7.1. A = reference, E = endpoint modification only, L = main-part extension, P = proportional enlargement. Display B/C are left/right labels. L and P are not necessarily the same TOTAL length: P also enlarges the endpoint components.

## Common shafts and endpoints (families 1–5)

| Variant | Main length | Main thickness | Thickness:length |
|---|---:|---:|---|
| A | 40 | 1 | 1:40 |
| E | 40 | 1 | 1:40 |
| L | 80 | 1 | 1:80 |
| P | 80 | 2 | 1:40 |

For arrow, circles and abstract endpoints, A/L endpoint bounding boxes are 5 × 5; E/P are 10 × 10. Matching bounding boxes does NOT mean equal area or equal perceived size across endpoint types. Main length is the central segment between endpoint bounding regions. Short underlaps join curved contours and are part of the accepted artwork; use the SVG rather than reconstructing it from a screenshot.

Each red segment is 2 long in A/L and 4 in E/P, sharing main thickness. Per-red-segment:black-length ratios: A 1:20, E 1:10, L 1:40, P 1:20. The ratio is for one red segment; summing both gives twice that red length.

Vertical endpoints have length/thickness: A 4/1; E 8/1; L 4/1; P 8/2. Endpoint-length:main-length ratios: 1:10, 1:5, 1:20, 1:10. Endpoint-thickness:length ratios: 1:4, 1:8, 1:4, 1:4. E lengthens a vertical line; it does not proportionally enlarge its thickness.

## Familiar objects

Snake body A = 40 × 2 (length × thickness), L = 80 × 2, P = 80 × 4. Ratios 1:20, 1:40, 1:20. Head A/L = 8 × 6; P = 16 × 12. There is a short tail taper but the body's central axis and long edges remain straight. No tongue.

Train windowed carriage A = 42 × 4.2, L = 84 × 4.2, P = 84 × 8.4. Ratios 1:10, 1:20, 1:10. Window counts A/L/P = 14/28/14. Window size A/L = 1.8 × 1.2; P = 3.6 × 2.4. Gaps A/L = 1.2; P = 2.4. Rear projection A/L = 0.6; P = 1.2. Connector A/L = 1.8; P = 3.6. Locomotive bounding width A/L = 6; P = 12. Carriage wheel positions move with the rear/front parts while their radius stays fixed in L. These dimensions refer to parts, not the total train bounds.

Lamp pole A = 30 high × 0.75 thick, L = 60 × 0.75, P = 60 × 1.5. Thickness:length = 1:40, 1:80, 1:40. Upper fixture bounding box A/L = 6 × 7.5; P = 12 × 15. Base A/L = 3.75 × 0.75; P = 7.5 × 1.5. Overall heights include both base and fixture.

## Calibration and layout

CSS pixels/mm = matched card outside width in CSS pixels / 85.60. Card height = width × 53.98 / 85.60. The 1 mm verification line is 40 mm long; the separate ruler span is 50 mm. Every asset's physical width and height is multiplied by that same conversion. Do not round those dimensions to integers before browser rendering.

The stage is 220 × 120, with centers A (110,30), B (55,77), C (165,77). Labels sit 8 above the object's top and have a 4.2 mm font size. Minimum gap between left/right artwork = 13.4, in the train pair. Tall upright lamps partly share vertical ranges across columns, but the objects and labels do not overlap. The app reserves 32 CSS pixels horizontally and 90 vertically for margins/controls in its fit check.

Legacy PDF pages are A4 landscape, 297 × 210 mm. Print at actual size for physical measurements; on-screen PDF “100%” is not a reliable physical calibration. The old PDF stage coordinates do not describe the latest web layout.

"""Build experiment 2 ("Similarity with Rotation") from the designer's handoff.

Reads data/rotation/handoff-manifest.csv and data/rotation/handoff-svg/*.svg,
writes site/rotation/assets/S0xx.svg (fill normalised to pure black),
site/rotation/stimuli.js, data/rotation/stimuli.csv and data/rotation/comparisons.csv.

Each handoff question has a reference A and three comparisons that differ from
A by a 45 degree rotation of: the sub-shapes only ('sub'), the whole object
('whole'), or the base shape only ('shape'). The relation is computed from the
baseRot/subRot parameters, not from the B/C/D letters. Every question yields
three 2AFC questions: sub vs whole, sub vs shape, whole vs shape.

Usage: python3 tools/build_rotation_stimuli.py   (from the repository root)
"""
from pathlib import Path
import csv, json, re
root = Path(__file__).resolve().parents[1]
src = root / 'data/rotation'
site = root / 'site/rotation'
(site / 'assets').mkdir(parents=True, exist_ok=True)

rows = list(csv.DictReader((src / 'handoff-manifest.csv').open()))
IMAGE_PX = 512
PX_PER_CANVAS_PX = float(rows[0]['image_px_per_canvas_px'])
DESIGNER_PX_PER_MM = 4.603  # from the handoff README: designer's calibrated screen at 100%
IMAGE_MM = round(IMAGE_PX / PX_PER_CANVAS_PX / DESIGNER_PX_PER_MM, 2)  # 41.33 mm square per image

stim = {r['stimulus']: r for r in rows}
# question -> {role: stimulus}
questions = {}
for r in rows:
    for use in r['used_in'].split():
        q, role = use.split(':')
        questions.setdefault(int(q[1:]), {})[role] = r['stimulus']
assert len(questions) == 16 and all(set(v) == {'A', 'B', 'C', 'D'} for v in questions.values()), questions

def relation(a, c):
    db = (int(c['baseRot']) - int(a['baseRot'])) % 360
    ds = (int(c['subRot']) - int(a['subRot'])) % 360
    if db == 0 and ds != 0: return 'sub', db, ds
    if db != 0 and ds == 0: return 'shape', db, ds
    if db != 0 and db == ds: return 'whole', db, ds
    raise ValueError(f'unexpected relation base {db} sub {ds} for {a["stimulus"]} -> {c["stimulus"]}')

for s in stim:
    svg = (src / 'handoff-svg' / stim[s]['file_svg']).read_text()
    assert svg.count('fill="#111"') > 0 and '<text' not in svg
    (site / 'assets' / f'{s}.svg').write_text(svg.replace('fill="#111"', 'fill="#000"'))

VARIANT_LABEL = {'A': 'reference', 'sub': 'sub-shapes rotated 45°', 'whole': 'whole object rotated 45°', 'shape': 'base shape rotated 45°'}
assets, trials, stim_rows, comp_rows = {}, [], [], []
for q in sorted(questions):
    a = stim[questions[q]['A']]
    name = f"{a['shape']} of {a['sub']}s"
    group = f"{a['shape']}-{a['sub']}"
    variants = {'A': a}
    for role in 'BCD':
        c = stim[questions[q][role]]
        rel, db, ds = relation(a, c)
        assert rel not in variants, (q, rel)
        variants[rel] = c
    assert set(variants) == {'A', 'sub', 'whole', 'shape'}, (q, variants.keys())
    for v, s in variants.items():
        rel, db, ds = ('A', 0, 0) if v == 'A' else relation(a, s)
        assets[f'{q}-{v}'] = {
            'src': f"assets/{s['stimulus']}.svg", 'widthMm': IMAGE_MM, 'heightMm': IMAGE_MM,
            'stimulus': s['stimulus'], 'shape': s['shape'], 'sub': s['sub'], 'density': int(s['density']),
            'baseRot': int(s['baseRot']), 'subRot': int(s['subRot']), 'frame': s['frame'],
            'figureWidthMm': float(s['figure_width_mm_on_screen']), 'figureHeightMm': float(s['figure_height_mm_on_screen']),
            'relationToReference': v, 'baseRotationDelta': db, 'subRotationDelta': ds,
            'description': f"{VARIANT_LABEL[v]} (base {s['baseRot']}°, sub-shapes {s['subRot']}°)",
            'dimensions': f"figure {float(s['figure_width_mm_on_screen']):g} × {float(s['figure_height_mm_on_screen']):g} mm in a {IMAGE_MM} mm image",
        }
        stim_rows.append({'question': q, 'variant': v, 'relation_to_reference': VARIANT_LABEL[v], 'base_rotation_delta': db, 'sub_rotation_delta': ds,
                          'stimulus': s['stimulus'], 'shape': s['shape'], 'sub_shape': s['sub'], 'density': s['density'], 'base_rotation': s['baseRot'], 'sub_rotation': s['subRot'],
                          'frame': s['frame'], 'figure_width_mm': s['figure_width_mm_on_screen'], 'figure_height_mm': s['figure_height_mm_on_screen'], 'image_mm': IMAGE_MM,
                          'handoff_role': 'A' if v == 'A' else [r for r in 'BCD' if questions[q][r] == s['stimulus']][0], 'svg': f"{s['stimulus']}.svg"})
    for i, (l, r) in enumerate([('sub', 'whole'), ('sub', 'shape'), ('whole', 'shape')], 1):
        trials.append({'id': f'{q}.{i}', 'family': q, 'name': name, 'group': group, 'left': l, 'right': r})
        comp_rows.append({'trial_id': f'{q}.{i}', 'question': q, 'name': name, 'group': group, 'reference': variants['A']['stimulus'],
                          'comparison_1': l, 'comparison_1_stimulus': variants[l]['stimulus'], 'comparison_2': r, 'comparison_2_stimulus': variants[r]['stimulus'],
                          'comparison': f'{VARIANT_LABEL[l]}  vs  {VARIANT_LABEL[r]}'})

header = '''// Experiment 2, "Similarity with Rotation" (internal name). Generated by
// tools/build_rotation_stimuli.py from data/rotation/handoff-manifest.csv.
// Every asset is one 512 px handoff image shown as a %s mm square (the
// designer's calibrated size: 512 / %s image px per canvas px / %s px per mm);
// figures are centred on their rotation centre inside the image, so all three
// objects align. Variants: A reference; sub = sub-shapes rotated 45 degrees;
// whole = whole object rotated 45 degrees; shape = base shape rotated 45 degrees.
''' % (IMAGE_MM, PX_PER_CANVAS_PX, DESIGNER_PX_PER_MM)
(site / 'stimuli.js').write_text(header + 'export const assets = ' + json.dumps(assets, indent=2, ensure_ascii=False) + ';\nexport const trials = ' + json.dumps(trials, indent=2, ensure_ascii=False) + ';\n')
with (src / 'stimuli.csv').open('w', newline='') as f:
    w = csv.DictWriter(f, stim_rows[0].keys()); w.writeheader(); w.writerows(stim_rows)
with (src / 'comparisons.csv').open('w', newline='') as f:
    w = csv.DictWriter(f, comp_rows[0].keys()); w.writeheader(); w.writerows(comp_rows)
print(f'{len(questions)} questions -> {len(trials)} 2AFC questions, {len(assets)} asset entries over {len(stim)} files, image size {IMAGE_MM} mm')

"""Build experiment 2 ("Similarity with Rotation") from the designer's handoff.

Reads data/rotation/handoff-manifest.csv and data/rotation/handoff-svg/*.svg,
writes site/2/assets/S0xx.svg (fill normalised to pure black),
site/2/stimuli.js, data/rotation/stimuli.csv and data/rotation/comparisons.csv.

Each handoff question has a reference A and three comparisons that differ from
A by a 45 degree rotation of: the sub-shapes only ('sub'), the whole object
('whole'), or the base shape only ('shape'). The relation is computed from the
baseRot/subRot parameters, not from the B/C/D letters. Every question yields
three 2AFC questions: sub vs whole, sub vs shape, whole vs shape.

Questions are numbered and named in the researcher's order (ORDER below) by
the reference's effective shapes: a square base at 45 degrees is a diamond, a
triangle sub-shape at 180 degrees is downward pointing. The handoff question
number is kept as `source` on every trial and in the CSV files.

Usage: python3 tools/build_rotation_stimuli.py   (from the repository root)
"""
from pathlib import Path
import csv, json, re
root = Path(__file__).resolve().parents[1]
src = root / 'data/rotation'
site = root / 'site/2'
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

# Effective (as seen) name of a shape token at a rotation, for the references.
def effective(shape, rot):
    rot %= 360
    if shape == 'square': return {0: 'square', 45: 'diamond', 90: 'square'}[rot]
    if shape == 'diamond': return {0: 'diamond', 45: 'square'}[rot]
    if shape == 'triangle': return {0: 'upward pointing triangle', 180: 'downward pointing triangle'}[rot]
    if shape == 'up-triangle': return {0: 'upward pointing triangle', 180: 'downward pointing triangle'}[rot]
    if shape == 'down-triangle': return {0: 'downward pointing triangle', 180: 'upward pointing triangle'}[rot]
    raise ValueError((shape, rot))

UP, DOWN = 'upward pointing triangle', 'downward pointing triangle'
# Researcher's order of the 16 questions as (base, sub-shape) effective names.
ORDER = [
    ('square', 'square'), ('square', 'diamond'), ('diamond', 'diamond'), ('diamond', 'square'),
    (UP, UP), (UP, DOWN), (DOWN, DOWN), (DOWN, UP),
    ('square', UP), ('square', DOWN), (UP, 'square'), (DOWN, 'square'),
    ('diamond', UP), ('diamond', DOWN), (UP, 'diamond'), (DOWN, 'diamond'),
]
GROUP = {('square', 'square'): 'squares and diamonds', ('square', 'diamond'): 'squares and diamonds', ('diamond', 'diamond'): 'squares and diamonds', ('diamond', 'square'): 'squares and diamonds',
         (UP, UP): 'triangles', (UP, DOWN): 'triangles', (DOWN, DOWN): 'triangles', (DOWN, UP): 'triangles',
         ('square', UP): 'squares and triangles', ('square', DOWN): 'squares and triangles', (UP, 'square'): 'squares and triangles', (DOWN, 'square'): 'squares and triangles',
         ('diamond', UP): 'diamonds and triangles', ('diamond', DOWN): 'diamonds and triangles', (UP, 'diamond'): 'diamonds and triangles', (DOWN, 'diamond'): 'diamonds and triangles'}

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

# Every comparison differs from the reference by one 45 degree rotation; the
# handoff's absolute angles (e.g. 180 -> 225) are kept as data only.
VARIANT_LABEL = {'A': 'Reference', 'sub': 'Sub-shapes rotated 45°', 'whole': 'Whole rotated 45°', 'shape': 'Global shape rotated 45°'}
# Handoff question -> researcher's number, by the reference's effective shapes.
kinds = {q: (effective(stim[v['A']]['shape'], int(stim[v['A']]['baseRot'])), effective(stim[v['A']]['sub'], int(stim[v['A']]['subRot']))) for q, v in questions.items()}
assert sorted(kinds.values()) == sorted(ORDER), kinds
number = {q: ORDER.index(k) + 1 for q, k in kinds.items()}
assert sorted(number.values()) == list(range(1, 17))

assets, trials, stim_rows, comp_rows = {}, [], [], []
for q in sorted(questions, key=number.get):
    a = stim[questions[q]['A']]
    base, sub = kinds[q]
    name = f"{base[0].upper()}{base[1:]} of {sub}s"
    group = GROUP[(base, sub)]
    source = f'handoff Q{q}'
    hq = q
    q = number[hq]
    variants = {'A': a}
    for role in 'BCD':
        c = stim[questions[hq][role]]
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
            'description': VARIANT_LABEL[v],
            'dimensions': f"figure {float(s['figure_width_mm_on_screen']):g} × {float(s['figure_height_mm_on_screen']):g} mm in a {IMAGE_MM} mm image",
        }
        stim_rows.append({'question': q, 'name': name, 'handoff_question': hq, 'variant': v, 'relation_to_reference': VARIANT_LABEL[v], 'base_rotation_delta': db, 'sub_rotation_delta': ds,
                          'stimulus': s['stimulus'], 'shape': s['shape'], 'sub_shape': s['sub'], 'density': s['density'], 'base_rotation': s['baseRot'], 'sub_rotation': s['subRot'],
                          'frame': s['frame'], 'figure_width_mm': s['figure_width_mm_on_screen'], 'figure_height_mm': s['figure_height_mm_on_screen'], 'image_mm': IMAGE_MM,
                          'handoff_role': 'A' if v == 'A' else [r for r in 'BCD' if questions[hq][r] == s['stimulus']][0], 'svg': f"{s['stimulus']}.svg"})
    for i, (l, r) in enumerate([('sub', 'whole'), ('sub', 'shape'), ('whole', 'shape')], 1):
        trials.append({'id': f'{q}.{i}', 'family': q, 'name': name, 'group': group, 'source': source, 'left': l, 'right': r})
        comp_rows.append({'trial_id': f'{q}.{i}', 'question': q, 'handoff_question': hq, 'name': name, 'group': group, 'reference': variants['A']['stimulus'],
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
for t in trials[::3]: print(f"  {t['family']:>2}. {t['name']}  ({t['source']})")

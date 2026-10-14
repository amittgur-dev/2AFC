"""Assemble the analysis handoff: documents, stimuli, Supabase helpers, example
rows and app source into dist-handoff/2afc-analysis-handoff/ and a zip of it.

Usage: python3 tools/build_analysis_handoff.py [output-dir]   (from the repository root)
Sources: handoff/analysis/ (authored material), site/ (artwork, stimuli,
design code), data/ (stimulus tables and PDFs), docs/, supabase/.
"""
import csv
import json
import shutil
import sys
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
out = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root / 'dist-handoff'
name = '2afc-analysis-handoff'
dest = out / name
if dest.exists():
    shutil.rmtree(dest)
dest.mkdir(parents=True)


def copy(src, rel):
    target = dest / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    if src.is_dir():
        shutil.copytree(src, target, ignore=shutil.ignore_patterns('__pycache__', '.DS_Store'))
    else:
        shutil.copy2(src, target)


def js_object(source, name):
    """Extract `export const <name> = {...};` from a stimuli.js file as JSON."""
    text = source.read_text()
    start = text.index(f'export const {name} = ') + len(f'export const {name} = ')
    end = text.index('\n};', start) if name == 'assets' else text.rindex('];')
    return json.loads(text[start:end + 2].rstrip().rstrip(';'))


# Authored material.
authored = root / 'handoff/analysis'
copy(authored / 'README.md', 'README.md')
for doc in sorted((authored / 'docs').glob('*.md')):
    copy(doc, 'docs/' + doc.name)
copy(authored / 'supabase', 'supabase')
copy(authored / 'python', 'python')
copy(authored / 'examples', 'examples')
copy(authored / 'app-source' / 'reproduce_sequence.mjs', 'app-source/reproduce_sequence.mjs')
if (authored / 'previews').is_dir():
    copy(authored / 'previews', 'previews')

# Schema and app source needed to interpret or reproduce the data.
copy(root / 'supabase/migrations/0001_experiment_tables.sql', 'supabase/schema.sql')
copy(root / 'site/shared/design.js', 'app-source/design.js')
copy(root / 'site/shared/storage.js', 'app-source/storage.js')
copy(root / 'site/shared/geometry.js', 'app-source/geometry.js')
for n in (1, 2):
    copy(root / f'site/{n}/stimuli.js', f'app-source/stimuli-{n}.js')
    copy(root / f'site/{n}/config.js', f'app-source/config-{n}.js')
copy(root / 'docs/EXPERIMENT_DATA.md', 'app-source/EXPERIMENT_DATA.md')

# Experiment 1 stimuli.
e1 = 'stimuli/exp1_lines_with_edges/'
copy(root / 'site/1/assets', e1 + 'assets')
assets1 = js_object(root / 'site/1/stimuli.js', 'assets')
notation = {r['asset_id']: r for r in csv.DictReader((root / 'data/stimuli-notation.csv').open())}
with (dest / e1 / 'assets.csv').open('w', newline='') as f:
    cols = ['asset_id', 'file', 'width_mm', 'height_mm'] + [c for c in next(iter(notation.values())).keys() if c not in ('asset_id', 'svg')]
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    for asset_id in sorted(assets1, key=lambda a: (int(a.split('-')[0]), a)):
        a = assets1[asset_id]
        row = {'asset_id': asset_id, 'file': 'assets/' + Path(a['src']).name, 'width_mm': a['widthMm'], 'height_mm': a['heightMm']}
        row.update({k: v for k, v in notation[asset_id].items() if k in cols})
        w.writerow(row)
copy(root / 'data/comparisons-notation.csv', e1 + 'comparisons.csv')
copy(root / 'data/trials.csv', e1 + 'trials.csv')
copy(root / 'data/measurements.csv', e1 + 'measurements.csv')
copy(root / 'data/families.json', e1 + 'families.json')
copy(root / 'data/layout.json', e1 + 'layout.json')
copy(root / 'data/stimuli-notation.xlsx', e1 + 'stimuli-notation.xlsx')
copy(root / 'data/questions-by-reference.pdf', e1 + 'questions-by-reference.pdf')
copy(root / 'docs/STIMULUS_SPECIFICATION.md', e1 + 'STIMULUS_SPECIFICATION.md')

# Experiment 2 stimuli.
e2 = 'stimuli/exp2_similarity_with_rotation/'
copy(root / 'site/2/assets', e2 + 'assets')
assets2 = js_object(root / 'site/2/stimuli.js', 'assets')
trials2 = js_object(root / 'site/2/stimuli.js', 'trials')
names = {t['family']: (t['name'], t['group']) for t in trials2}
with (dest / e2 / 'assets.csv').open('w', newline='') as f:
    cols = ['asset_id', 'question', 'question_name', 'group', 'variant', 'relation_to_reference', 'description', 'stimulus', 'file', 'shape', 'sub_shape', 'density',
            'base_rotation', 'sub_rotation', 'base_rotation_delta', 'sub_rotation_delta', 'frame', 'figure_width_mm', 'figure_height_mm', 'image_width_mm', 'image_height_mm']
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    for asset_id in sorted(assets2, key=lambda a: (int(a.split('-')[0]), ['A', 'sub', 'whole', 'shape'].index(a.split('-')[1]))):
        a = assets2[asset_id]
        q = int(asset_id.split('-')[0])
        w.writerow({'asset_id': asset_id, 'question': q, 'question_name': names[q][0], 'group': names[q][1], 'variant': asset_id.split('-')[1],
                    'relation_to_reference': a['relationToReference'], 'description': a['description'], 'stimulus': a['stimulus'], 'file': 'assets/' + Path(a['src']).name,
                    'shape': a['shape'], 'sub_shape': a['sub'], 'density': a['density'], 'base_rotation': a['baseRot'], 'sub_rotation': a['subRot'],
                    'base_rotation_delta': a['baseRotationDelta'], 'sub_rotation_delta': a['subRotationDelta'], 'frame': a['frame'],
                    'figure_width_mm': a['figureWidthMm'], 'figure_height_mm': a['figureHeightMm'], 'image_width_mm': a['widthMm'], 'image_height_mm': a['heightMm']})
copy(root / 'data/rotation/stimuli.csv', e2 + 'stimuli.csv')
copy(root / 'data/rotation/comparisons.csv', e2 + 'comparisons.csv')
copy(root / 'data/rotation/handoff-manifest.csv', e2 + 'designer-manifest.csv')
copy(root / 'data/rotation/handoff-README.txt', e2 + 'designer-README.txt')
copy(root / 'data/rotation/questions-by-reference.pdf', e2 + 'questions-by-reference.pdf')

# Zip it.
out.mkdir(parents=True, exist_ok=True)
zip_path = out / f'{name}.zip'
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in sorted(dest.rglob('*')):
        if p.is_file():
            z.write(p, p.relative_to(out))
files = sum(1 for p in dest.rglob('*') if p.is_file())
print(f'{dest} ({files} files) and {zip_path} ({zip_path.stat().st_size / 1e6:.1f} MB)')

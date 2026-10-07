"""Check portable JSON/CSV against the deployed JavaScript and SVG assets in site/.

Usage: python3 tools/check_data.py   (from the repository root)"""
from pathlib import Path
import csv,json,math
root=Path(__file__).resolve().parents[1]
source=(root/'site/1/stimuli.js').read_text()
assert json.loads(source.split('export const assets = ')[1].split(';\nexport const trials')[0])==json.loads((root/'data/assets.json').read_text())
assert json.loads(source.split('export const trials = ')[1].strip().removesuffix(';'))==json.loads((root/'data/trials.json').read_text())
assets=json.loads((root/'data/assets.json').read_text())
trials=json.loads((root/'data/trials.json').read_text())
assert len(assets)==32 and len(trials)==19
measurements=list(csv.DictReader((root/'data/measurements.csv').open()))
assert len(measurements)==32
for r in measurements:
 a=assets[r['asset_id']]
 assert (root/r['src']).is_file()
 assert float(r['total_width_mm'])==a['widthMm']
 assert float(r['total_height_mm'])==a['heightMm']
 denominator=float(r['main_thickness_to_length'].split(':')[1])
 assert math.isclose(float(r['main_length_mm'])/float(r['main_thickness_mm']),denominator)
 assert '<svg' in (root/r['src']).read_text()
assert len(list(csv.DictReader((root/'data/trials.csv').open())))==19
print('Portable JSON/CSV match the current app; all 32 assets, 19 trials and main-part ratios verified.')

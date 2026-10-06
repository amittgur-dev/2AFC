"""Regenerate the supplied SVGs without running historical PDF builders.

Usage: python3 tools/export_stimuli.py [OUTPUT_DIRECTORY]
Default output: rebuilt-assets/ (leaves site/assets untouched).
Requires PyMuPDF; pip install -r requirements-optional.txt
"""
from pathlib import Path
import json,sys
import fitz

root=Path(__file__).resolve().parents[1]
output=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root/'rebuilt-assets'
output.mkdir(parents=True,exist_ok=True)
records=json.loads((root/'data/pdf-source-crop-map.json').read_text())
source=fitz.open(root/'pdf-history/stimuli-2afc-review.pdf')
mm=72/25.4;seen=set()
for r in records:
 for variant,b in zip(['A',r['left'],r['right']],r['boxes']):
  key=f"{r['family']}-{variant}"
  if key in seen:continue
  seen.add(key)
  w=b[2]-b[0];h=b[3]-b[1]
  doc=fitz.open();p=doc.new_page(width=w*mm,height=h*mm)
  p.show_pdf_page(p.rect,source,r['page']-1,clip=fitz.Rect([v*mm for v in b]))
  (output/f'{key}.svg').write_text(p.get_svg_image())
for v,w,h in [('A',40,1),('L',80,1),('P',80,2)]:
 (output/f'0-{v}.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}"><rect width="{w}" height="{h}" fill="#000"/></svg>')
print(f'Exported {len(seen)+3} SVGs to {output}')

"""Make pseudonymous participant codes and personal links for both experiments.

Reads one name (or email, or any label) per line, assigns each a random code,
and writes a PRIVATE spreadsheet/CSV mapping name -> code -> links. Only the
code ever reaches the experiment and the database; keep the output file out of
the repository (participants-private* is git-ignored) and share only the links.

Usage:
  python3 tools/make_participant_links.py names.txt --site1 https://STUDY-1.netlify.app --site2 https://STUDY-2.netlify.app
  python3 tools/make_participant_links.py names.txt --site1 ... --site2 ... --out participants-private.xlsx
Options:
  --existing participants-private.csv   keep the codes already assigned in that file
  --codes-only 12                       no names: make 12 anonymous codes/links
The two studies are separate Netlify projects (separate links) built from
the same app; see README.md, "Deploy on Netlify".

The same code is used for both experiments, so a person's two data sets can
be joined on participant_id without knowing who they are.
"""
import argparse, csv, secrets, sys
from pathlib import Path

ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'  # no I, L, O, 0, 1
def make_code(n=6):
    return ''.join(secrets.choice(ALPHABET) for _ in range(n))

ap = argparse.ArgumentParser()
ap.add_argument('names', nargs='?', help='text file with one name per line')
ap.add_argument('--site1', required=True, help='address of the Lines with edges project, e.g. https://STUDY-1.netlify.app')
ap.add_argument('--site2', required=True, help='address of the Similarity with rotation project')
ap.add_argument('--out', default='participants-private.csv', help='.csv or .xlsx (default participants-private.csv)')
ap.add_argument('--existing', help='previous output file; its codes are kept')
ap.add_argument('--codes-only', type=int, default=0, help='make this many codes without names')
a = ap.parse_args()

site1, site2 = a.site1.rstrip('/'), a.site2.rstrip('/')
names = [l.strip() for l in Path(a.names).read_text().splitlines() if l.strip()] if a.names else []
if a.codes_only: names += [''] * a.codes_only
if not names: sys.exit('No names given (or use --codes-only N).')

existing = {}
if a.existing and Path(a.existing).exists():
    for r in csv.DictReader(open(a.existing)): existing[r['name']] = r['code']
used = set(existing.values())
rows = []
for name in names:
    code = existing.get(name) if name else None
    while not code or code in used:
        code = make_code()
    used.add(code)
    rows.append({'name': name, 'code': code,
                 'link_lines_with_edges': f'{site1}/?pid={code}',
                 'link_similarity_with_rotation': f'{site2}/?pid={code}'})

out = Path(a.out)
if out.suffix.lower() == '.xlsx':
    from openpyxl import Workbook
    from openpyxl.styles import Font
    wb = Workbook(); ws = wb.active; ws.title = 'Participants (private)'
    ws.append(list(rows[0].keys()))
    for c in ws[1]: c.font = Font(name='Arial', bold=True)
    for r in rows: ws.append(list(r.values()))
    for col, w in zip('ABCD', (28, 10, 60, 70)): ws.column_dimensions[col].width = w
    for row in ws.iter_rows(min_row=2):
        for c in row: c.font = Font(name='Arial')
    wb.save(out)
else:
    with out.open('w', newline='') as f:
        w = csv.DictWriter(f, rows[0].keys()); w.writeheader(); w.writerows(rows)
print(f'{len(rows)} participants -> {out}  (private: keep out of the repository; share only the links)')
for r in rows[:3]: print(f"  {r['name'] or '(no name)'}: {r['code']}  {r['link_lines_with_edges']}  {r['link_similarity_with_rotation']}")
if len(rows) > 3: print('  ...')

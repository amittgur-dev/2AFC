#!/usr/bin/env python3
"""Build the "Experiment Methodology" PDF for the ethics application: every page
a participant sees, in order, with a short note only where a screen is not
self-explanatory, plus the participant information and consent page.

Usage: python3 tools/build_methodology_pdf.py <screens-dir> [output.pdf]
The screenshots come from tools/screenshot_methodology.mjs.
"""
import glob
import os
import sys

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

screens = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'Experiment Methodology.pdf')
pdfmetrics.registerFont(TTFont('Sans', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('Sans-Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))

PAGE = landscape(A4)
W, H = PAGE
M = 40  # margin in points
INK = colors.HexColor('#111111')
GREY = colors.HexColor('#555555')
LINE = colors.HexColor('#c8c8c8')


def shot(pattern):
    files = sorted(glob.glob(os.path.join(screens, pattern)))
    if not files:
        sys.exit('missing screenshot ' + pattern)
    return files[0]


PAGES = [
    ('1. Welcome page', None, shot('01-first-page.png')),
    ('2. Participant information and consent', None, shot('02-consent-information.png')),
    ('3. Age and gender', None, shot('03-age-gender.png')),
    ('4. Screen calibration',
     'The participant holds a bank card against the screen and adjusts the outline until it matches the card. '
     'This tells the program the size of a pixel on that screen, so that the objects in the experiment are shown at their true physical size. '
     'Nothing about the card is recorded.',
     shot('04b-calibration-matched.png')),
    ('5. Instructions', None, shot('05-instructions.png')),
    ('6. Similarity judgement question (example)',
     'One of the 19 screens, which are presented in random order. The participant chooses B or C by clicking it or by pressing the left or right arrow key. '
     'There is no time limit and no feedback.',
     shot('06-trial-*-0.1-*.png')),
    ('7. End', None, shot('07-finished.png')),
]

c = canvas.Canvas(out, pagesize=PAGE)
c.setTitle('Experiment Methodology')
c.setAuthor('Amit Gur')
c.setSubject('Similarity judgement: an online two-alternative forced-choice experiment')

# Title page.
c.setFillColor(INK)
c.setFont('Sans-Bold', 30)
c.drawString(M, H - 110, 'Experiment Methodology')
c.setFont('Sans', 14)
c.drawString(M, H - 140, 'Similarity judgement: an online two-alternative forced-choice experiment')
c.setFont('Sans', 11)
c.setFillColor(GREY)
c.drawString(M, H - 162, 'Amit Gur, University of Antwerp  ·  October 2026')
c.setFillColor(INK)
body = ParagraphStyle('body', fontName='Sans', fontSize=11, leading=16, textColor=INK)
intro = Paragraph('This document shows every page a participant sees, in the order in which the pages appear. '
                  'The experiment runs in the participant\'s own web browser and takes 1 to 3 minutes. '
                  'Pages 1 to 5 are shown once; page 6 is repeated for each of the 19 questions.', body)
w, h = intro.wrap(W - 2 * M - 200, H)
intro.drawOn(c, M, H - 200 - h)
y = H - 215 - h
c.setFont('Sans-Bold', 11)
c.drawString(M, y, 'Pages')
y -= 18
c.setFont('Sans', 11)
for title, _, _ in PAGES:
    c.drawString(M + 12, y, title)
    y -= 16
c.showPage()

# One screen per page.
note_style = ParagraphStyle('note', fontName='Sans', fontSize=10.5, leading=14.5, textColor=GREY)
for title, note, image in PAGES:
    c.setFillColor(INK)
    c.setFont('Sans-Bold', 15)
    c.drawString(M, H - M - 10, title)
    top = H - M - 24
    if note:
        p = Paragraph(note, note_style)
        w, h = p.wrap(W - 2 * M, 200)
        p.drawOn(c, M, top - h)
        top -= h + 8
    img = ImageReader(image)
    iw, ih = img.getSize()
    avail_w, avail_h = W - 2 * M, top - M
    scale = min(avail_w / iw, avail_h / ih)
    dw, dh = iw * scale, ih * scale
    x = (W - dw) / 2
    y = top - dh
    c.drawImage(img, x, y, dw, dh)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.6)
    c.rect(x, y, dw, dh, stroke=1, fill=0)
    c.showPage()

c.save()
print(out, os.path.getsize(out) // 1024, 'KB')

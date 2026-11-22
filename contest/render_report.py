from pathlib import Path
import os
import re
from xml.sax.saxutils import escape

from PIL import Image as PillowImage
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table

root = Path(__file__).resolve().parent
fonts = Path(os.environ.get("SVOZ_REPORT_FONTS", "C:/Windows/Fonts"))
pdfmetrics.registerFont(TTFont("Body", str(fonts / "arial.ttf")))
pdfmetrics.registerFont(TTFont("Bold", str(fonts / "arialbd.ttf")))
pdfmetrics.registerFontFamily("Body", normal="Body", bold="Bold")
ink = colors.HexColor("#18262C")
accent = colors.HexColor("#115C61")
body = ParagraphStyle("body", fontName="Body", fontSize=11, leading=16, textColor=ink, spaceAfter=8)
title = ParagraphStyle("title", parent=body, fontName="Bold", fontSize=25, leading=30, textColor=accent, spaceAfter=20, keepWithNext=True)
header = ParagraphStyle("header", parent=body, fontName="Bold", fontSize=15, leading=20, textColor=accent, spaceBefore=10, keepWithNext=True)
caption = ParagraphStyle("caption", parent=body, fontSize=10)
story = []
portraits = []

def markup(line):
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", escape(line.replace("`", "")))

def add_portraits():
    if portraits:
        story.append(Table([portraits[:]], colWidths=[239] * len(portraits), hAlign="LEFT",
                           style=[("VALIGN", (0, 0), (-1, -1), "TOP")]))
        portraits.clear()


for line in (root / "report.md").read_text(encoding="utf-8-sig").splitlines():
    if not line:
        continue
    if line.startswith("# "):
        story.append(Paragraph(markup(line[2:]), title))
    elif line.startswith("## "):
        add_portraits()
        if "Снимки браузерных" in line:
            story.append(PageBreak())
        story.append(Paragraph(markup(line[3:]), header))
    elif match := re.fullmatch(r"!\[(.*)\]\((.+)\)", line):
        label, filename = match.groups()
        path = root / filename
        with PillowImage.open(path) as source:
            w, h = source.size
        scale = min((218 if h > w else 446) / w, 455 / h)
        panel = [Image(str(path), w * scale, h * scale, hAlign="LEFT"),
                 Spacer(1, 7), Paragraph(markup(label), caption)]
        if h > w:
            portraits.append(panel)
            if len(portraits) == 2:
                add_portraits()
        else:
            add_portraits()
            story.append(KeepTogether(panel))
    else:
        add_portraits()
        line = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1 (\2)", line)
        story.append(Paragraph(markup(line.replace("- ", "• ", 1) if line.startswith("- ") else line), body))
add_portraits()

def page(canvas, doc):
    width, _ = A4
    canvas.setStrokeColor(colors.HexColor("#DBE2DF"))
    canvas.line(48, 43, width - 48, 43)
    canvas.setFont("Body", 9)
    canvas.setFillColor(accent)
    canvas.drawString(48, 28, "СВОЗ / Конкурсный прототип")
    canvas.drawRightString(width - 48, 28, str(doc.page))

SimpleDocTemplate(str(root / "report.pdf"), pagesize=A4, topMargin=46,
                  bottomMargin=56, leftMargin=48, rightMargin=48,
                  title="СВОЗ · отчёт о разработке", author="Команда СВОЗ").build(
                      story, onFirstPage=page, onLaterPages=page)

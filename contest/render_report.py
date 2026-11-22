"""Add the evidence appendix to the hand-corrected PDF without reflowing its pages."""
import argparse
from io import BytesIO
import os
from pathlib import Path
from xml.sax.saxutils import escape
import re

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate


ROOT = Path(__file__).resolve().parent
BASE_PAGES = 9
REGION_STATEMENT = "Доступность из РФ без VPN отдельно не проверялась."
ACCENT = colors.HexColor("#115C61")


def append_evidence(source, output):
    if output.exists() or source.resolve() == output.resolve():
        raise ValueError("Choose a new output file; the source PDF is preserved.")
    base = PdfReader(source)
    recorded_count = (base.metadata or {}).get("/SvozBasePages")
    if len(base.pages) != BASE_PAGES and recorded_count != str(BASE_PAGES):
        raise ValueError("Use the manually corrected report or a report generated from it.")
    if " ".join(REGION_STATEMENT.split()) not in " ".join(base.pages[1].extract_text().split()):
        raise ValueError("Missing the manually corrected wording about access from Russia.")

    fonts = Path(os.getenv("SVOZ_REPORT_FONTS", "C:/Windows/Fonts"))
    pdfmetrics.registerFont(TTFont("Body", str(fonts / "arial.ttf")))
    pdfmetrics.registerFont(TTFont("Bold", str(fonts / "arialbd.ttf")))
    pdfmetrics.registerFontFamily("Body", normal="Body", bold="Bold")
    body = ParagraphStyle("Body", fontName="Body", fontSize=11, leading=16,
                          textColor=colors.HexColor("#18262C"), spaceAfter=10)
    heading = ParagraphStyle("Heading", parent=body, fontName="Bold", fontSize=21,
                             leading=26, textColor=ACCENT, spaceAfter=14, keepWithNext=True)
    story = []
    for line in (ROOT / "ai-evidence.md").read_text(encoding="utf-8-sig").splitlines():
        if line.startswith("# "):
            if story:
                story.append(PageBreak())
            story.append(Paragraph(escape(line[2:]), heading))
        elif line:
            text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", escape(line))
            story.append(Paragraph(text, body))

    def footer(canvas, doc):
        width, _ = A4
        canvas.setStrokeColor(colors.HexColor("#DBE2DF"))
        canvas.line(48, 43, width - 48, 43)
        canvas.setFont("Body", 9)
        canvas.setFillColor(ACCENT)
        canvas.drawString(48, 28, "СВОЗ / Конкурсный прототип")
        canvas.drawRightString(width - 48, 28, str(BASE_PAGES + doc.page))

    buffer = BytesIO()
    SimpleDocTemplate(buffer, pagesize=A4, topMargin=46, bottomMargin=56,
                      leftMargin=48, rightMargin=48).build(story, onFirstPage=footer, onLaterPages=footer)
    appendix = PdfReader(buffer)
    if len(appendix.pages) != 2:
        raise ValueError("The evidence must fit on two pages.")
    writer = PdfWriter()
    writer.append(base, pages=(0, BASE_PAGES))
    writer.append(appendix)
    writer.add_metadata({"/Title":"СВОЗ · отчёт о разработке", "/Author":"Команда СВОЗ",
                         "/SvozBasePages":str(BASE_PAGES)})
    with output.open("xb") as result:
        writer.write(result)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    append_evidence(args.base, args.output)

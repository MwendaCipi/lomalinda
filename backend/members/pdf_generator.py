import io
import re
from decimal import Decimal
from datetime import datetime
from pathlib import Path
from django.utils import timezone
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    KeepTogether,
    HRFlowable,
    Flowable,
    Image,
)
from reportlab.lib.utils import ImageReader, simpleSplit
from xml.sax.saxutils import escape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas
from svglib.svglib import svg2rlg


# The church's own mark: the SDA symbol beside the church's name, read
# once from the SVG beside this module. Drawn as vectors rather than a
# bitmap, so it stays sharp at any zoom and on any printer — the thing
# that makes a printout an official record.
_SYMBOL_DRAWING = svg2rlg(str(Path(__file__).resolve().parent / "sda_symbol.svg"))
_SYMBOL_RATIO = _SYMBOL_DRAWING.width / _SYMBOL_DRAWING.height

#: The church's poster: the artwork the congregation downloaded — its own
#: letterhead, the pastoral lines it speaks and the bible beneath them — kept
#: beside this module like the symbol above it, so the cover wears the
#: church's own art rather than a stranger's photograph.
_CHURCH_BUILDING = ImageReader(str(Path(__file__).resolve().parent / "sda-poster.jpeg"))
_church_building_w, _church_building_h = _CHURCH_BUILDING.getSize()
_CHURCH_BUILDING_RATIO = _church_building_w / _church_building_h


def _light_symbol_drawing():
    """The symbol again, painted in the paper's own sand.

    A photocopy would be heavy and a stock photo is not ours to print; the
    church's own mark, drawn large and faint, is the image a typed sheet can
    carry. The colours are walked rather than alpha-faded, so what a printer
    sees is exactly one pale tint — no transparency to misrender.
    """
    import copy

    drawing = copy.deepcopy(_SYMBOL_DRAWING)

    def recolor(shape):
        if hasattr(shape, 'contents'):
            for child in shape.contents:
                recolor(child)
        if getattr(shape, 'fillColor', None):
            shape.fillColor = colors.HexColor('#ece7db')

    recolor(drawing)
    return drawing
# The footer every paper prints page-numbered — the church's own name and
# what the sheet is: an official financial & administrative record. Papers
# that are not records of money hand a wording of their own, so the order
# of service never carries the treasury's line.
_RECORD_FOOTER_TEXT = "SDA Church Loma Linda • Official Financial & Administrative Record"
_PROGRAM_FOOTER_TEXT = "SDA Church Loma Linda • Order of Service"
_LOCKUP_COLOR = colors.HexColor("#5E3929")
_LOCKUP_LINE_1 = "SDA Church"
_LOCKUP_LINE_2 = "Loma Linda, Meru"


def _draw_logo(c, center_x, top_y, height):
    """Draw the church's lockup — symbol and name — centred on `center_x`,
    its top edge at `top_y`, `height` tall."""
    sym_w = height * _SYMBOL_RATIO
    text_size = height * 0.40
    line_advance = text_size * 1.15
    c.saveState()
    c.setFont("Helvetica-Bold", text_size)
    line_1_w = c.stringWidth(_LOCKUP_LINE_1, "Helvetica-Bold", text_size)
    line_2_w = c.stringWidth(_LOCKUP_LINE_2, "Helvetica-Bold", text_size)
    gap = height * 0.16
    total_w = sym_w + gap + max(line_1_w, line_2_w)
    left = center_x - total_w / 2
    # The symbol, full height, at the lockup's left edge.
    scale = height / _SYMBOL_DRAWING.height
    c.translate(left, top_y - height)
    c.scale(scale, scale)
    _SYMBOL_DRAWING.drawOn(c, 0, 0)
    c.restoreState()
    # The name, two lines, optically centred against the symbol.
    c.saveState()
    c.setFillColor(_LOCKUP_COLOR)
    c.setFont("Helvetica-Bold", text_size)
    block_h = text_size + line_advance
    baseline_1 = top_y - (height - block_h) / 2 - text_size * 0.8
    text_x = left + sym_w + gap
    c.drawString(text_x, baseline_1, _LOCKUP_LINE_1)
    c.drawString(text_x, baseline_1 - line_advance, _LOCKUP_LINE_2)
    c.restoreState()


class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, footer_text=_RECORD_FOOTER_TEXT, **kwargs):
        super().__init__(*args, **kwargs)
        self._footer_text = footer_text
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        # Letterhead first: the church's own mark at the head of every
        # page, above the margin the document's own content starts at.
        _draw_logo(self, A4[0] / 2, A4[1] - 0.7 * cm, 9 * mm)
        self.restoreState()
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#617068"))
        
        # Draw bottom line
        self.setStrokeColor(colors.HexColor("#dfdbd1"))
        self.setLineWidth(0.5)
        self.line(1.5 * cm, 1.8 * cm, A4[0] - 1.5 * cm, 1.8 * cm)
        
        # Footer text
        footer_text = self._footer_text
        page_text = f"Page {self._pageNumber} of {page_count}"
        
        self.drawString(1.5 * cm, 1.2 * cm, footer_text)
        self.drawRightString(A4[0] - 1.5 * cm, 1.2 * cm, page_text)
        self.restoreState()


def _signature_size(image):
    """A saved signature's pixel size, or ``None`` when it cannot be read.

    A signature the printer cannot open (a file gone missing under a profile,
    a payload that is not an image after all) is treated exactly like no
    signature at all: the paper keeps its ruled line instead of failing.
    """
    if not image:
        return None
    try:
        return ImageReader(io.BytesIO(image)).getSize()
    except Exception:
        return None


def _draw_signature(c, image, x, y, width, height):
    """Draw a saved signature inside a box, resting on its floor.

    The signature is scaled to fit rather than stretched to it, so a tall
    photograph and a wide drawn scrawl both come out in proportion, and it is
    anchored to the bottom so it appears to sit on the rule it signs.
    """
    size = _signature_size(image)
    if not size or not size[0] or not size[1]:
        return False
    image_w, image_h = size
    scale = min(width / image_w, height / image_h)
    drawn_w, drawn_h = image_w * scale, image_h * scale
    c.drawImage(
        ImageReader(io.BytesIO(image)),
        x + (width - drawn_w) / 2,
        y,
        width=drawn_w,
        height=drawn_h,
        mask='auto',
    )
    return True


def _signature_flowable(image, max_width, max_height):
    """A saved signature as a flowable for a table cell or story slot."""
    size = _signature_size(image)
    if not size or not size[0] or not size[1]:
        return None
    image_w, image_h = size
    scale = min(max_width / image_w, max_height / image_h)
    try:
        return Image(io.BytesIO(image), width=image_w * scale, height=image_h * scale)
    except Exception:
        return None


def _to_eat(dt):
    """Convert a datetime to East African Time (Africa/Nairobi, UTC+3)."""
    if not dt:
        return None
    try:
        return timezone.localtime(dt)
    except Exception:
        return dt


def _thermal_signatures(c, y, width, margin, signatures):
    """The office signatures at the foot of a thermal receipt.

    When one signature is provided (e.g. Treasurer), it is centred horizontally
    on the receipt with generous breathing space. If multiple are provided,
    they are arranged in two columns.
    Returns the ``y`` the caller continues from.
    """
    entries = list(signatures or ())[:2]
    if not entries:
        return y
    dark = colors.HexColor("#26352f")
    muted = colors.HexColor("#617068")
    image_h = 11 * mm

    if len(entries) == 1:
        entry = entries[0]
        slot_w = min(46 * mm, width - 2 * margin)
        x = (width - slot_w) / 2
        c.setFillColor(muted)
        c.setFont("Helvetica", 6.5)
        c.drawCentredString(width / 2, y, (entry.get("office") or "").upper())
        _draw_signature(c, entry.get("image"), x + 1.5 * mm, y - image_h - 2, slot_w - 3 * mm, image_h)
        c.setStrokeColor(dark)
        c.setLineWidth(0.6)
        c.line(x, y - image_h - 2, x + slot_w, y - image_h - 2)
        c.setFillColor(dark)
        c.setFont("Helvetica", 7)
        c.drawCentredString(width / 2, y - image_h - 12, (entry.get("name") or "")[:32])
        return y - image_h - 22

    gap = 5 * mm
    slot_w = (width - 2 * margin - gap) / 2
    for index, entry in enumerate(entries):
        x = margin + index * (slot_w + gap)
        c.setFillColor(muted)
        c.setFont("Helvetica", 6.5)
        c.drawCentredString(x + slot_w / 2, y, (entry.get("office") or "").upper())
        # The signature rests on the rule; the name prints under it.
        _draw_signature(c, entry.get("image"), x + 1.5 * mm, y - image_h - 2, slot_w - 3 * mm, image_h)
        c.setStrokeColor(dark)
        c.setLineWidth(0.6)
        c.line(x, y - image_h - 2, x + slot_w, y - image_h - 2)
        c.setFillColor(dark)
        c.setFont("Helvetica", 7)
        c.drawCentredString(x + slot_w / 2, y - image_h - 12, (entry.get("name") or "")[:28])
    return y - image_h - 22


def get_pdf_styles():
    styles = getSampleStyleSheet()
    
    primary_color = colors.HexColor("#26352f")
    accent_color = colors.HexColor("#b36b3c")
    dark_gray = colors.HexColor("#26352f")
    muted_gray = colors.HexColor("#617068")

    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=primary_color,
        spaceAfter=2,
    )

    subtitle_style = ParagraphStyle(
        "DocSubTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=accent_color,
        spaceAfter=6,
    )

    meta_style = ParagraphStyle(
        "DocMeta",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=muted_gray,
    )

    h2_style = ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        textColor=primary_color,
        spaceBefore=12,
        spaceAfter=6,
    )

    cell_style = ParagraphStyle(
        "TableCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=dark_gray,
    )

    cell_bold = ParagraphStyle(
        "TableCellBold",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=dark_gray,
    )

    cell_right = ParagraphStyle(
        "TableCellRight",
        parent=cell_style,
        alignment=2,  # Right align
    )

    cell_right_bold = ParagraphStyle(
        "TableCellRightBold",
        parent=cell_bold,
        alignment=2,  # Right align
    )

    table_header = ParagraphStyle(
        "TableHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12,
        textColor=colors.white,
    )

    table_header_right = ParagraphStyle(
        "TableHeaderRight",
        parent=table_header,
        alignment=2,
    )

    # The document's own title, under the letterhead: big, centred, black —
    # the line that names what the printout *is*, now that the church's name
    # lives in the logo above it.
    doc_title_style = ParagraphStyle(
        "DocTitleCentered",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=16,
        leading=20,
        textColor=colors.black,
        alignment=1,
        spaceAfter=8,
    )

    return {
        "title": title_style,
        "title_big": doc_title_style,
        "subtitle": subtitle_style,
        "meta": meta_style,
        "h2": h2_style,
        "cell": cell_style,
        "cell_bold": cell_bold,
        "cell_right": cell_right,
        "cell_right_bold": cell_right_bold,
        "header": table_header,
        "header_right": table_header_right,
    }


def format_money(val):
    try:
        n = float(val)
        return f"{n:,.2f}"
    except (ValueError, TypeError):
        return "0.00"


def pdf_church_name(church_name):
    """The name as it must read on paper: with the word "Church" in it.

    The app stores the short form ("SDA Loma Linda, Meru") for screens,
    emails and SMS, but printed documents carry the full name —
    "SDA Church Loma Linda, Meru". Names that already say "Church" and
    names without the SDA prefix pass through untouched, so an admin who
    renames the church keeps whatever wording they chose.
    """
    text = str(church_name or "").strip()
    if not text or "church" in text.lower():
        return text
    return re.sub(r"^SDA\b", "SDA Church", text, flags=re.IGNORECASE)


def generate_treasury_pdf(
    church_name,
    start_date,
    end_date,
    purpose_rows,
    totals,
    is_individual=False,
    individual_rows=None,
    saturdays=None,
    weekly_data=None,
    district="",
    field_name="North East Kenya Field",
    purpose_title="",
    signatures=None,
):
    """
    Generates NEKF-format Cash Count & Offering Report Summary PDF.
    """
    church_name = pdf_church_name(church_name)
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=2.0 * cm,
        bottomMargin=2.5 * cm,
    )

    story = []
    st = get_pdf_styles()

    total_val = totals.get("total", 0)
    cash_val = totals.get("cash", 0)
    mpesa_val = totals.get("mpesa", 0)
    bank_transfer_val = totals.get("bank_transfer", 0)
    cheque_val = totals.get("cheque", 0)
    digital_val = float(mpesa_val) + float(bank_transfer_val) + float(cheque_val)

    if is_individual:
        # Dedicated Individual Givings Report
        if purpose_title:
            subtitle_text = f"INDIVIDUAL CONTRIBUTIONS REPORT - {purpose_title.upper()}"
        else:
            subtitle_text = f"INDIVIDUAL MEMBER CONTRIBUTIONS REPORT FROM {start_date} TO {end_date}"
        story.append(Paragraph(subtitle_text, st["title_big"]))
        if start_date == end_date:
            date_str = f"Date: {start_date}"
        else:
            date_str = f"Period: {start_date} to {end_date}"
        meta_str = f"Field: {field_name or 'North East Kenya Field'}"
        if district:
            meta_str += f" &nbsp;&nbsp;|&nbsp;&nbsp; District: {district}"
        meta_str += f" &nbsp;&nbsp;|&nbsp;&nbsp; {date_str}"
        story.append(Paragraph(meta_str, st["meta"]))
        story.append(Spacer(1, 10))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#26352f"), spaceAfter=12))

        ind_rows = individual_rows or []
        tot_amount = sum((Decimal(str(g.get("amount", 0))) for g in ind_rows), Decimal("0"))

        summary_text = f"<b>Total Records:</b> {len(ind_rows)} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <b>Total Givings:</b> KES {format_money(tot_amount)}"
        story.append(Paragraph(summary_text, st["h2"]))
        story.append(Spacer(1, 8))

        ind_headers = ["Contributor Name", "Date", "Account", "Type & Mode", "Receipt / Ref", "Amount (KES)"]
        ind_data = [[
            Paragraph(ind_headers[0], st["header"]),
            Paragraph(ind_headers[1], st["header"]),
            Paragraph(ind_headers[2], st["header"]),
            Paragraph(ind_headers[3], st["header"]),
            Paragraph(ind_headers[4], st["header"]),
            Paragraph(ind_headers[5], st["header_right"]),
        ]]

        for g in ind_rows:
            donor = g.get("member_name") or g.get("collection_name") or "Anonymous"
            g_type = (g.get("contribution_type") or "individual").capitalize()
            mode = (g.get("payment_method") or "cash").upper()
            amt_val = g.get("amount", 0)
            amt_str = format_money(amt_val)

            ind_data.append([
                Paragraph(str(donor), st["cell_bold"]),
                Paragraph(str(g.get("date", "")), st["cell"]),
                Paragraph(str(g.get("purpose_name", "")), st["cell"]),
                Paragraph(f"{g_type} • {mode}", st["cell"]),
                Paragraph(str(g.get("receipt_number") or g.get("transaction_id") or "—"), st["cell"]),
                Paragraph(amt_str, st["cell_right"]),
            ])

        ind_data.append([
            Paragraph("<b>GRAND TOTAL</b>", st["cell_bold"]),
            Paragraph("", st["cell"]),
            Paragraph("", st["cell"]),
            Paragraph("", st["cell"]),
            Paragraph("", st["cell"]),
            Paragraph(format_money(tot_amount), st["cell_right_bold"]),
        ])

        ind_table = Table(ind_data, colWidths=[4.2 * cm, 2.3 * cm, 4.0 * cm, 2.7 * cm, 2.3 * cm, 2.5 * cm], repeatRows=1)
        ind_style = [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#26352f")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dfdbd1")),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#26352f")),
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f7f4ee")),
        ]
        for i in range(1, len(ind_data) - 1):
            if i % 2 == 0:
                ind_style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#faf9f6")))
        ind_table.setStyle(TableStyle(ind_style))
        story.append(ind_table)
        story.append(Spacer(1, 16))

        if purpose_rows:
            story.append(Paragraph("<b>Giving Account Breakdown</b>", st["h2"]))
            story.append(Spacer(1, 6))

            p_headers = ["Giving Purpose", "M-Pesa", "Bank-to-Bank", "Cheque", "Cash", "Total (KES)"]
            p_table_data = [[
                Paragraph(p_headers[0], st["header"]),
                Paragraph(p_headers[1], st["header_right"]),
                Paragraph(p_headers[2], st["header_right"]),
                Paragraph(p_headers[3], st["header_right"]),
                Paragraph(p_headers[4], st["header_right"]),
                Paragraph(p_headers[5], st["header_right"]),
            ]]

            for r in purpose_rows:
                p_table_data.append([
                    Paragraph(str(r.get("name", "")), st["cell_bold"]),
                    Paragraph(format_money(r.get("mpesa", 0)), st["cell_right"]),
                    Paragraph(format_money(r.get("bank_transfer", 0)), st["cell_right"]),
                    Paragraph(format_money(r.get("cheque", 0)), st["cell_right"]),
                    Paragraph(format_money(r.get("cash", 0)), st["cell_right"]),
                    Paragraph(format_money(r.get("total", 0)), st["cell_right_bold"]),
                ])

            p_table_data.append([
                Paragraph("<b>TOTALS</b>", st["cell_bold"]),
                Paragraph(format_money(totals.get("mpesa", 0)), st["cell_right_bold"]),
                Paragraph(format_money(totals.get("bank_transfer", 0)), st["cell_right_bold"]),
                Paragraph(format_money(totals.get("cheque", 0)), st["cell_right_bold"]),
                Paragraph(format_money(totals.get("cash", 0)), st["cell_right_bold"]),
                Paragraph(format_money(totals.get("total", 0)), st["cell_right_bold"]),
            ])

            p_table = Table(p_table_data, colWidths=[4.8 * cm, 2.4 * cm, 2.4 * cm, 2.2 * cm, 2.4 * cm, 3.0 * cm], repeatRows=1)
            p_style = [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#b36b3c")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dfdbd1")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#b36b3c")),
                ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f7f4ee")),
            ]
            for i in range(1, len(p_table_data) - 1):
                if i % 2 == 0:
                    p_style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#faf9f6")))
            p_table.setStyle(TableStyle(p_style))
            story.append(p_table)
            story.append(Spacer(1, 20))

        sig_data = [[
            Paragraph("<b>Prepared By:</b><br/><br/>Name: ______________________<br/>Treasurer Sign: _______________", st["cell"]),
            Paragraph("<b>Witnessed By:</b><br/><br/>Name: ______________________<br/>Deacon Sign: ________________", st["cell"]),
            Paragraph("<b>Verified By:</b><br/><br/>Name: ______________________<br/>Elder Sign: _________________", st["cell"]),
        ]]
        sig_table = Table(sig_data, colWidths=[6.0 * cm, 6.0 * cm, 6.0 * cm])
        sig_table.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#c9c5bb")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dfdbd1")),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#faf7f2")),
        ]))
        story.append(KeepTogether([sig_table]))

        doc.build(story, canvasmaker=NumberedCanvas)
        buffer.seek(0)
        return buffer.getvalue()

    # --- NEKF Header (Summary Breakdown Mode) ---
    # The summary opens the way the individual givings report does: the
    # report names itself with its own period in the headline (the same
    # big, centred black title), one meta line underneath carrying church,
    # field, district and period, then the same rule.
    from datetime import datetime as _dt
    try:
        dt_end = _dt.strptime(end_date, "%Y-%m-%d")
        end_date_str = dt_end.strftime("%d.%m.%Y")
    except Exception:
        end_date_str = end_date

    story.append(Paragraph(
        f"CASH COUNT AND OFFERING REPORT SUMMARY FROM {start_date} TO {end_date}",
        st["title_big"],
    ))
    meta_text = f"Name of Church: {church_name}"
    meta_text += f" &nbsp;&nbsp;|&nbsp;&nbsp; Field: {field_name or 'North East Kenya Field'}"
    if district:
        meta_text += f" &nbsp;&nbsp;|&nbsp;&nbsp; District: {district}"
    if start_date == end_date:
        meta_text += f" &nbsp;&nbsp;|&nbsp;&nbsp; Date: {start_date}"
    else:
        meta_text += f" &nbsp;&nbsp;|&nbsp;&nbsp; Period: {start_date} to {end_date}"
    story.append(Paragraph(meta_text, st["meta"]))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#26352f"), spaceAfter=12))

    # --- Weekly Cash Counts Summary ---
    story.append(Paragraph("<b>WEEKLY CASH COUNTS SUMMARY</b>", st["h2"]))

    if saturdays is None:
        saturdays = []
    if weekly_data is None:
        weekly_data = {}

    num_weeks = len(saturdays)
    week_labels = [saturdays[i].strftime('%d.%m.%Y') if i < num_weeks else 'NA' for i in range(5)]

    # Header: Week 1, Week 2, ..., Totals
    cash_header_row = [Paragraph('Date', st["header"])]
    for i in range(5):
        cash_header_row.append(Paragraph(f'Week {i+1}', st["header_right"]))
    cash_header_row.append(Paragraph('Totals', st["header_right"]))

    cash_date_row = [Paragraph('Date', st["cell"])]
    for i in range(5):
        cash_date_row.append(Paragraph(week_labels[i], st["cell_right"]))
    cash_date_row.append(Paragraph('', st["cell"]))

    cash_table_data = [cash_header_row, cash_date_row]

    # Compute per-week totals
    week_cash_totals = []
    week_digital_totals = []
    for i in range(5):
        sat = saturdays[i] if i < num_weeks else None
        wp = weekly_data.get(sat, {}) if sat else {}
        w_cash = sum(v.get('cash', 0) for v in wp.values())
        w_mpesa = sum(v.get('mpesa', 0) for v in wp.values())
        w_bank = sum(v.get('bank_transfer', 0) for v in wp.values())
        w_cheque = sum(v.get('cheque', 0) for v in wp.values())
        week_cash_totals.append(w_cash)
        week_digital_totals.append(w_mpesa + w_bank + w_cheque)

    # Row: Cash
    cash_row = [Paragraph('Cash', st["cell"])]
    for i in range(5):
        cash_row.append(Paragraph(format_money(week_cash_totals[i]), st["cell_right"]))
    cash_row.append(Paragraph(format_money(cash_val), st["cell_right_bold"]))
    cash_table_data.append(cash_row)

    # Row: Cheque (real cheque totals)
    cheque_row = [Paragraph('Cheque', st["cell"])]
    for i in range(5):
        sat = saturdays[i] if i < num_weeks else None
        wp = weekly_data.get(sat, {}) if sat else {}
        w_cheque = sum(v.get('cheque', 0) for v in wp.values())
        cheque_row.append(Paragraph(format_money(w_cheque), st["cell_right"]))
    cheque_row.append(Paragraph(format_money(cheque_val), st["cell_right_bold"]))
    cash_table_data.append(cheque_row)

    # Row: Church Paybill a/c (digital)
    paybill_row = [Paragraph('Church Paybill a/c', st["cell"])]
    for i in range(5):
        paybill_row.append(Paragraph(format_money(week_digital_totals[i]), st["cell_right"]))
    paybill_row.append(Paragraph(format_money(mpesa_val), st["cell_right_bold"]))
    cash_table_data.append(paybill_row)

    # Row: Bank-to-Bank
    bank_row = [Paragraph('Bank-to-Bank', st["cell"])]
    for i in range(5):
        sat = saturdays[i] if i < num_weeks else None
        wp = weekly_data.get(sat, {}) if sat else {}
        w_bank = sum(v.get('bank_transfer', 0) for v in wp.values())
        bank_row.append(Paragraph(format_money(w_bank), st["cell_right"]))
    bank_row.append(Paragraph(format_money(bank_transfer_val), st["cell_right_bold"]))
    cash_table_data.append(bank_row)

    # Row: Total Received
    total_received_row = [Paragraph('<b>Total Received</b>', st["cell_bold"])]
    for i in range(5):
        w_total = week_cash_totals[i] + week_digital_totals[i]
        total_received_row.append(Paragraph(format_money(w_total), st["cell_right_bold"]))
    total_received_row.append(Paragraph(format_money(total_val), st["cell_right_bold"]))
    cash_table_data.append(total_received_row)

    cw = [3.5 * cm] + [2.8 * cm] * 5 + [3.0 * cm]
    cash_table = Table(cash_table_data, colWidths=cw, repeatRows=1)
    cash_style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#26352f")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dfdbd1")),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#26352f")),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f7f4ee")),
        ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#f7f4ee")),
    ]
    cash_table.setStyle(TableStyle(cash_style))
    story.append(cash_table)
    story.append(Spacer(1, 8))

    # --- Signatures: Treasurer, Deacon, Elder ---
    def signature_cell(heading, entry, fallback):
        """One signature cell: the named officer, their signature on the line,
        or the blank rules the cell has always kept when nobody has signed."""
        entry = entry or {}
        cell = [Paragraph(heading, st["cell"])]
        if entry.get("name"):
            cell.append(Paragraph(f"Name: <b>{escape(entry['name'])}</b>", st["cell"]))
        else:
            cell.append(Paragraph(fallback, st["cell"]))
        image = _signature_flowable(entry.get("image"), 4.6 * cm, 1.0 * cm)
        if image:
            cell.append(image)
        else:
            cell.append(Paragraph("Signature: _______________", st["cell"]))
        return cell

    offices = signatures or {}
    sig_data = [[
        signature_cell("<b>Signed By:</b>", offices.get("treasurer"), "Name: ______________________"),
        signature_cell("Deacon", None, "Name: ______________________"),
        signature_cell("Elder", offices.get("first_elder"), "Name: ______________________"),
    ]]
    sig_table = Table(sig_data, colWidths=[6.0 * cm, 6.0 * cm, 6.0 * cm])
    sig_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#c9c5bb")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dfdbd1")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#faf7f2")),
    ]))
    story.append(sig_table)
    story.append(Spacer(1, 12))

    # --- Offering Summary: Trust Funds (with weekly columns) ---
    story.append(Paragraph("<b>OFFERING SUMMARY</b>", st["h2"]))

    COMBINED_PURPOSES = {'combined offering', 'combined (50%)', 'combined (50%'}

    trust_fund_purposes = [
        ("Tithe", ['tithe']),
        ("Combined (50%)", "combined_split"),
        ("Camp Offering", ['camp goal', 'camp offering']),
        ("Evangelism - Field", ['msamaria mwema', 'evangelism', 'evangelism - field', 'good samaritan']),
        ("Station Dev. Funds", ['development', 'station dev. funds', 'station development']),
        ("Thirteenth", ['13th sabbath', 'thirteenth']),
    ]

    local_fund_purposes = [
        ("Combined (50%)", "combined_split"),
        ("Building/Development", ['building/development', 'building', 'building development']),
        ("Camp Expenses", ['camp expenses']),
        ("Local Church Budget", ['local church budget', 'lcb']),
        ("Others", "others_residual"),
    ]

    claimed_lower = set()
    for _, names in trust_fund_purposes:
        if isinstance(names, list):
            claimed_lower.update(names)
    claimed_lower.update(COMBINED_PURPOSES)
    for _, names in local_fund_purposes:
        if isinstance(names, list):
            claimed_lower.update(names)

    def _get_week_sum(sat, names):
        if not sat or not weekly_data:
            return 0.0
        wp = weekly_data.get(sat, {})
        total = 0.0
        for k, v in wp.items():
            if k.lower() in names:
                total += float(v.get('total', 0))
        return total

    # --- Trust Funds Table ---
    trust_header = [Paragraph('Trust Funds', st["header"])]
    for i in range(5):
        trust_header.append(Paragraph(f'Week {i+1}', st["header_right"]))
    trust_header.append(Paragraph('Totals', st["header_right"]))
    trust_data = [trust_header]

    trust_total = 0.0
    week_trust = [0.0] * 5

    for label, names in trust_fund_purposes:
        tr = [Paragraph(label, st["cell"])]
        row_total = 0.0
        for i in range(5):
            sat = saturdays[i] if i < num_weeks else None
            if names == "combined_split":
                w_amt = round(_get_week_sum(sat, COMBINED_PURPOSES) / 2.0, 2)
            else:
                w_amt = _get_week_sum(sat, set(names))
            week_trust[i] += w_amt
            row_total += w_amt
            tr.append(Paragraph(format_money(w_amt), st["cell_right"]))
        trust_total += row_total
        tr.append(Paragraph(format_money(row_total), st["cell_right_bold"]))
        trust_data.append(tr)

    # Total Trust Funds row
    trust_total_row = [Paragraph('<b>Total Trust Funds</b>', st["cell_bold"])]
    for i in range(5):
        trust_total_row.append(Paragraph(format_money(week_trust[i]), st["cell_right_bold"]))
    trust_total_row.append(Paragraph(format_money(trust_total), st["cell_right_bold"]))
    trust_data.append(trust_total_row)

    trust_table = Table(trust_data, colWidths=[3.5 * cm] + [2.8 * cm] * 5 + [3.0 * cm], repeatRows=1)
    trust_style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#26352f")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dfdbd1")),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#26352f")),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f7f4ee")),
    ]
    for i in range(1, len(trust_data) - 1):
        if i % 2 == 0:
            trust_style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#faf9f6")))
    trust_table.setStyle(TableStyle(trust_style))
    story.append(trust_table)
    story.append(Spacer(1, 10))

    # --- Local Church Offering Table ---
    local_header = [Paragraph('Local Church Offering', st["header"])]
    for i in range(5):
        local_header.append(Paragraph(f'Week {i+1}', st["header_right"]))
    local_header.append(Paragraph('Totals', st["header_right"]))
    local_data = [local_header]

    local_total = 0.0
    week_local = [0.0] * 5

    for label, names in local_fund_purposes:
        lr = [Paragraph(label, st["cell"])]
        row_total = 0.0
        for i in range(5):
            sat = saturdays[i] if i < num_weeks else None
            if names == "combined_split":
                w_amt = round(_get_week_sum(sat, COMBINED_PURPOSES) / 2.0, 2)
            elif names == "others_residual":
                wp = weekly_data.get(sat, {}) if sat else {}
                w_amt = sum(float(v.get('total', 0)) for k, v in wp.items() if k.lower() not in claimed_lower)
            elif not names:
                w_amt = 0.0
            else:
                w_amt = _get_week_sum(sat, set(names))
            week_local[i] += w_amt
            row_total += w_amt
            lr.append(Paragraph(format_money(w_amt), st["cell_right"]))
        local_total += row_total
        lr.append(Paragraph(format_money(row_total), st["cell_right_bold"]))
        local_data.append(lr)

    # Total Local Offering row
    local_total_row = [Paragraph('<b>Total Local Offering</b>', st["cell_bold"])]
    for i in range(5):
        local_total_row.append(Paragraph(format_money(week_local[i]), st["cell_right_bold"]))
    local_total_row.append(Paragraph(format_money(local_total), st["cell_right_bold"]))
    local_data.append(local_total_row)

    local_table = Table(local_data, colWidths=[3.5 * cm] + [2.8 * cm] * 5 + [3.0 * cm], repeatRows=1)
    local_style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#b36b3c")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dfdbd1")),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#b36b3c")),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f7f4ee")),
    ]
    for i in range(1, len(local_data) - 1):
        if i % 2 == 0:
            local_style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#faf9f6")))
    local_table.setStyle(TableStyle(local_style))
    story.append(local_table)
    story.append(Spacer(1, 10))

    # --- Total Offering (with weekly columns) ---
    grand_offering = trust_total + local_total
    total_header = [Paragraph('<b>Total Offering</b>', st["cell_bold"])]
    for i in range(5):
        total_header.append(Paragraph(format_money(week_trust[i] + week_local[i]), st["cell_right_bold"]))
    total_header.append(Paragraph(format_money(grand_offering), st["cell_right_bold"]))
    total_off = Table([total_header], colWidths=[3.5 * cm] + [2.8 * cm] * 5 + [3.0 * cm])
    total_off.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#26352f")), ("TEXTCOLOR", (0, 0), (-1, -1), colors.white), ("ALIGN", (1, 0), (-1, -1), "RIGHT"), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6), ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#26352f"))]))
    story.append(total_off)
    story.append(Spacer(1, 10))

    # --- Total Remittance to NEKF ---
    remit_header = [Paragraph('<b>Total remittance to SDA CHURCH NEKF KSH</b>', st["cell_bold"])]
    for i in range(5):
        remit_header.append(Paragraph(format_money(week_trust[i]), st["cell_right_bold"]))
    remit_header.append(Paragraph(format_money(trust_total), st["cell_right_bold"]))
    remit = Table([remit_header], colWidths=[3.5 * cm] + [2.8 * cm] * 5 + [3.0 * cm])
    remit.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f7f4ee")), ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#dfdbd1")), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    story.append(remit)
    story.append(Spacer(1, 12))

    # --- Deposit Slips ---
    story.append(Paragraph("<b>Deposit Slips</b>", st["h2"]))
    dep = Table([[Paragraph("#", st["header"]), Paragraph("Date", st["header"]), Paragraph("Amount (KES)", st["header_right"])], [Paragraph("1", st["cell"]), Paragraph(end_date_str, st["cell"]), Paragraph("0.00", st["cell_right"])], [Paragraph("2", st["cell"]), Paragraph(end_date_str, st["cell"]), Paragraph("0.00", st["cell_right"])], [Paragraph("<b>Total</b>", st["cell_bold"]), Paragraph("", st["cell"]), Paragraph("0.00", st["cell_right_bold"])]], colWidths=[3.0 * cm, 7.0 * cm, 8.0 * cm])
    dep.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#26352f")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("ALIGN", (2, 0), (2, -1), "RIGHT"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("BOTTOMPADDING", (0, 0), (-1, -1), 5), ("TOPPADDING", (0, 0), (-1, -1), 5), ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dfdbd1")), ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#26352f")), ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f7f4ee"))]))
    story.append(dep)
    story.append(Spacer(1, 12))

    # --- Presented by / Church Pastor ---
    final_sig = [[Paragraph(f"<b>Presented by</b><br/><br/>Name: ________________________<br/>Treasurer", st["cell"]), Paragraph("", st["cell"]), Paragraph(f"Sign: ________________________<br/><br/>{end_date_str}", st["cell"])], [Paragraph(f"<b>Church Pastor</b><br/><br/>Name: ________________________", st["cell"]), Paragraph("", st["cell"]), Paragraph(f"Sign: ________________________<br/><br/>{end_date_str}", st["cell"])]]
    final_sig_table = Table(final_sig, colWidths=[6.5 * cm, 5.0 * cm, 6.5 * cm])
    final_sig_table.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#c9c5bb")), ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dfdbd1")), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8), ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#faf7f2"))]))
    story.append(KeepTogether([final_sig_table]))

    doc.build(story, canvasmaker=NumberedCanvas)
    buffer.seek(0)
    return buffer.getvalue()


def generate_member_giving_statement_pdf(church_name, member_name, member_email, start_date, end_date, givings, purpose_totals, grand_total, signatures=None):
    """
    Generates Member Official Contribution Statement PDF.
    """
    church_name = pdf_church_name(church_name)
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=2.0 * cm,
        bottomMargin=2.5 * cm,
    )

    story = []
    st = get_pdf_styles()

    story.append(Paragraph("MEMBER OFFICIAL CONTRIBUTION STATEMENT", st["title_big"]))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#26352f"), spaceAfter=10))

    # Member Info Block
    info_data = [
        [
            Paragraph(f"<b>Member Name:</b> {member_name}<br/><b>Email:</b> {member_email or 'N/A'}", st["cell"]),
            Paragraph(f"<b>Statement Period:</b> {start_date} to {end_date}<br/><b>Date Issued:</b> {datetime.now().strftime('%Y-%m-%d')}", st["cell"]),
        ]
    ]
    info_table = Table(info_data, colWidths=[9.0 * cm, 9.0 * cm])
    info_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f7f4ee")),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#dfdbd1")),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    story.append(info_table)
    story.append(Spacer(1, 12))

    # Itemized Giving List
    story.append(Paragraph("Itemized Giving Transactions", st["h2"]))
    headers = ["Date", "Receipt / Reference #", "Mode", "Purpose", "Amount (KES)"]
    table_data = [[
        Paragraph(headers[0], st["header"]),
        Paragraph(headers[1], st["header"]),
        Paragraph(headers[2], st["header"]),
        Paragraph(headers[3], st["header"]),
        Paragraph(headers[4], st["header_right"]),
    ]]

    for g in givings:
        mode = (g.get("payment_method") or "CASH").upper()
        amt_str = format_money(g.get("amount", 0))
        table_data.append([
            Paragraph(str(g.get("date", "")), st["cell"]),
            Paragraph(str(g.get("receipt_number") or g.get("transaction_id") or "—"), st["cell"]),
            Paragraph(mode, st["cell"]),
            Paragraph(str(g.get("purpose_name", "")), st["cell_bold"]),
            Paragraph(amt_str, st["cell_right"]),
        ])

    table_data.append([
        Paragraph("TOTAL CONTRIBUTIONS", st["cell_bold"]),
        Paragraph("", st["cell"]),
        Paragraph("", st["cell"]),
        Paragraph("", st["cell"]),
        Paragraph(f"KES {format_money(grand_total)}", st["cell_right_bold"]),
    ])

    t = Table(table_data, colWidths=[3.0 * cm, 4.5 * cm, 2.5 * cm, 4.5 * cm, 3.5 * cm], repeatRows=1)
    t_style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#26352f")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dfdbd1")),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#26352f")),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f7f4ee")),
    ]
    for i in range(1, len(table_data) - 1):
        if i % 2 == 0:
            t_style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#faf9f6")))

    t.setStyle(TableStyle(t_style))
    story.append(t)
    story.append(Spacer(1, 15))

    # Purpose Breakdown
    if purpose_totals:
        story.append(Paragraph("Summary by Giving Purpose", st["h2"]))
        p_headers = ["Giving Purpose", "Total Amount (KES)"]
        p_data = [[
            Paragraph(p_headers[0], st["header"]),
            Paragraph(p_headers[1], st["header_right"]),
        ]]
        for p_name, amt in purpose_totals.items():
            p_data.append([
                Paragraph(str(p_name), st["cell_bold"]),
                Paragraph(format_money(amt), st["cell_right"]),
            ])

        p_table = Table(p_data, colWidths=[12.0 * cm, 6.0 * cm])
        p_style = [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#b36b3c")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dfdbd1")),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#b36b3c")),
        ]
        p_table.setStyle(TableStyle(p_style))
        story.append(p_table)
        story.append(Spacer(1, 15))

    # Official Note
    note_text = (
        "<b>Notice:</b> Thank you for your faithful stewardship and support of God's work. "
        "This official statement reflects all contributions recorded in the church treasury records for the specified period."
    )
    story.append(Paragraph(note_text, st["meta"]))
    story.append(Spacer(1, 15))

    # The statement is the treasurer's word to the member, so the office
    # signs it where it is printed: their saved signature on its line.
    treasurer = (signatures or {}).get("treasurer") or {}
    name_line = (
        f"<b>Church Treasurer Name:</b> {escape(treasurer['name'])}"
        if treasurer.get("name")
        else "<b>Church Treasurer Name:</b> ___________________________"
    )
    treasurer_cell = [Paragraph(name_line, st["cell"])]
    signature_image = _signature_flowable(treasurer.get("image"), 5.2 * cm, 1.0 * cm)
    if signature_image:
        treasurer_cell.extend([Paragraph("<b>Signature:</b>", st["cell"]), signature_image])
    else:
        treasurer_cell.append(Paragraph("<b>Signature:</b> ___________________________", st["cell"]))
    sign_data = [
        [
            treasurer_cell,
            Paragraph(f"<b>Date:</b> {datetime.now().strftime('%Y-%m-%d')}", st["cell"]),
        ]
    ]
    sign_table = Table(sign_data, colWidths=[12.0 * cm, 6.0 * cm])
    story.append(KeepTogether([sign_table]))

    doc.build(story, canvasmaker=NumberedCanvas)
    buffer.seek(0)
    return buffer.getvalue()


def generate_business_meeting_pdf(church_name, meeting_title, meeting_date, location, status, minutes, agendas):
    """
    Generates PDF packet for Business Meeting Agenda & Minutes.
    """
    church_name = pdf_church_name(church_name)
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=2.0 * cm,
        bottomMargin=2.5 * cm,
    )

    story = []
    st = get_pdf_styles()

    story.append(Paragraph("BUSINESS MEETING AGENDA & MINUTES PACKET", st["title_big"]))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#26352f"), spaceAfter=10))

    # Meeting Meta Table
    meta_data = [
        [
            Paragraph(f"<b>Meeting Title:</b> {meeting_title}<br/><b>Status:</b> {(status or 'upcoming').upper()}", st["cell"]),
            Paragraph(f"<b>Meeting Date:</b> {meeting_date}<br/><b>Location:</b> {location or 'Main Sanctuary'}", st["cell"]),
        ]
    ]
    meta_table = Table(meta_data, colWidths=[9.0 * cm, 9.0 * cm])
    meta_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f7f4ee")),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#dfdbd1")),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    story.append(meta_table)
    story.append(Spacer(1, 15))

    # Agendas Section
    story.append(Paragraph("Meeting Agendas", st["h2"]))
    if agendas:
        ag_headers = ["Order", "Agenda Title", "Description & Supporting File"]
        ag_data = [[
            Paragraph(ag_headers[0], st["header"]),
            Paragraph(ag_headers[1], st["header"]),
            Paragraph(ag_headers[2], st["header"]),
        ]]

        for ag in agendas:
            order = str(ag.get("order") or 1)
            title = str(ag.get("title") or "")
            desc = str(ag.get("description") or "")
            doc_name = ag.get("document_name") or ag.get("document")
            if doc_name:
                desc += f"<br/><font color='#b36b3c'><b>Attachment:</b> {doc_name}</font>"

            ag_data.append([
                Paragraph(order, st["cell_bold"]),
                Paragraph(title, st["cell_bold"]),
                Paragraph(desc or "—", st["cell"]),
            ])

        ag_table = Table(ag_data, colWidths=[2.0 * cm, 6.0 * cm, 10.0 * cm], repeatRows=1)
        ag_style = [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#26352f")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dfdbd1")),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#26352f")),
        ]
        for i in range(1, len(ag_data)):
            if i % 2 == 0:
                ag_style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#faf9f6")))

        ag_table.setStyle(TableStyle(ag_style))
        story.append(ag_table)
    else:
        story.append(Paragraph("<i>No specific agenda items recorded for this meeting.</i>", st["cell"]))

    story.append(Spacer(1, 15))

    # Minutes Section
    story.append(Paragraph("Meeting Minutes / Recorded Summary", st["h2"]))
    if minutes:
        min_p = Paragraph(minutes.replace("\n", "<br/>"), st["cell"])
        min_table = Table([[min_p]], colWidths=[18.0 * cm])
        min_table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f7f4ee")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#dfdbd1")),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ])
        )
        story.append(min_table)
    else:
        story.append(Paragraph("<i>Minutes have not been uploaded or recorded yet.</i>", st["cell"]))

    doc.build(story, canvasmaker=NumberedCanvas)
    buffer.seek(0)
    return buffer.getvalue()


def generate_member_list_pdf(church_name: str, members: list, friend_count: int = 0) -> bytes:
    """
    Generate a PDF member directory list.
    members: list of dicts with keys: name, phone, email, role, is_disfellowshipped
    """
    church_name = pdf_church_name(church_name)
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=1.5 * cm,
        leftMargin=1.5 * cm,
        topMargin=2 * cm,
        bottomMargin=2.5 * cm,
    )

    st = get_pdf_styles()
    story = []

    # Header — the letterhead above already names the church, so the page
    # opens on the directory's own title.
    story.append(Paragraph("OFFICIAL USERS DIRECTORY" if friend_count else "OFFICIAL MEMBER DIRECTORY", st["title_big"]))
    story.append(Spacer(1, 4))
    generated_date = datetime.now().strftime("%d %B %Y, %I:%M %p")
    story.append(Paragraph(f"Generated: {generated_date}", st["meta"]))
    story.append(Spacer(1, 12))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#26352f")))
    story.append(Spacer(1, 12))

    # Summary stats
    total = len(members)
    member_count = total - friend_count
    disfellowshipped_count = sum(1 for m in members if m.get('is_disfellowshipped'))
    summary_data = [
        ["Total Users", "Members", "Friends", "Ex-members"],
        [str(total), str(member_count), str(friend_count), str(disfellowshipped_count)],
    ]
    summary_table = Table(summary_data, colWidths=[4.5 * cm, 4.5 * cm, 4.5 * cm, 4.5 * cm])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#26352f")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#eef2ed")),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 1), (-1, 1), 13),
        ("TEXTCOLOR", (0, 1), (-1, 1), colors.HexColor("#26352f")),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#dfdbd1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dfdbd1")),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 16))

    # Member table
    header = ["#", "Full Name", "Contact", "Role", "Status"]
    col_widths = [0.8 * cm, 5.5 * cm, 5.5 * cm, 4.0 * cm, 2.8 * cm]

    table_data = [header]
    for idx, m in enumerate(members, 1):
        if m.get('is_disfellowshipped'):
            status_text = "Ex-member"
        elif m.get('account_type') == 'friend':
            status_text = "Friend"
        else:
            status_text = "Active"
        contact = m.get('phone') or m.get('email') or "—"
        table_data.append([
            str(idx),
            m.get('name', '—'),
            contact,
            m.get('role', 'Member'),
            status_text,
        ])

    member_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#26352f")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("ALIGN", (0, 1), (0, -1), "CENTER"),
        ("ALIGN", (4, 1), (4, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#dfdbd1")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#c9c5bb")),
    ]
    # Alternating row shading
    for i in range(2, len(table_data), 2):
        style_cmds.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#f7f4ee")))
    # Ex-member rows
    for i, m in enumerate(members, 1):
        if m.get('is_disfellowshipped'):
            style_cmds.append(("TEXTCOLOR", (4, i), (4, i), colors.HexColor("#b91c1c")))
            style_cmds.append(("FONTNAME", (4, i), (4, i), "Helvetica-Bold"))

    member_table.setStyle(TableStyle(style_cmds))
    story.append(member_table)

    doc.build(story, canvasmaker=NumberedCanvas)
    buffer.seek(0)
    return buffer.getvalue()



def generate_contribution_thermal_receipt_pdf(
    church_name,
    donor_name,
    contributions,
    issued_at=None,
    signatures=None,
):
    """A thermal-style receipt for one giving (one payment, maybe several lines).

    Printers call this size 80 mm: about three inches of paper. The layout is
    what a POS printer would emit — narrow, monospaced-aligned amounts, a
    dashed divider — but it is an ordinary PDF, so it also reads perfectly on
    a phone and prints correctly on any paper.

    `contributions` are the rows that share one payment: normally a single
    line, or several when a giver split one gift across accounts. Split
    lines print itemised with a total; a single line prints like the simple
    receipts a treasurer's book keeps.

    `signatures` are the offices whose saved signatures sign the foot of the
    slip (see ``members.signatures``); without them the slip keeps its two
    blank rules, so a receipt never waits on a profile.
    """
    church_name = pdf_church_name(church_name)
    issued_at = issued_at or timezone.now()
    receipt_no = ""
    for row in contributions:
        receipt_no = row.mpesa_receipt_number or row.paystack_reference or receipt_no
        if receipt_no:
            break

    WIDTH = 80 * mm
    margin = 6 * mm
    content_width = WIDTH - 2 * margin

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=(WIDTH, 200 * mm))
    y = 200 * mm - margin

    def line_out(text, font="Helvetica", size=8, align="left", gap=3):
        nonlocal y
        c.setFont(font, size)
        if align == "center":
            c.drawCentredString(WIDTH / 2, y, text)
        elif align == "right":
            c.drawRightString(WIDTH - margin, y, text)
        else:
            c.drawString(margin, y, text)
        y -= size + gap

    def dashed():
        # A dotted rule drawn as a line, spanning exactly margin to margin —
        # a string of dashes is character-counted and bleeds past the edge.
        nonlocal y
        c.saveState()
        c.setStrokeColor(dark)
        c.setLineWidth(0.7)
        c.setDash(1, 2)
        c.line(margin, y + 3, WIDTH - margin, y + 3)
        c.restoreState()
        y -= 11

    dark = colors.HexColor("#26352f")
    c.setFillColor(dark)

    # ── Header ──
    # The A4 letterhead leaves ~8 mm of air between the logo and the title;
    # this 28 pt drop puts the receipt's title at the same distance below it.
    _draw_logo(c, WIDTH / 2, y, 7 * mm)
    y -= 7 * mm + 28
    line_out("OFFICIAL GIVING RECEIPT", "Helvetica-Bold", 8, "center", gap=6)
    dashed()

    # ── Payment facts ──
    first = contributions[0]
    line_out(f"Received from: {(donor_name or first.donor_name or 'Friend')[:38]}")
    if first.phone_number:
        line_out(f"Phone: {first.phone_number}")
    payment_dt = _to_eat(first.paid_at or first.created_at)
    date_str = payment_dt.strftime("%d %b %Y %H:%M") if payment_dt else ""
    line_out(f"Date: {date_str}")
    method = (first.payment_method or "mpesa").replace("_", " ").upper()
    line_out(f"Method: {method}")
    if receipt_no:
        line_out(f"Receipt: {receipt_no}")
    dashed()

    # ── Lines ──
    if len(contributions) > 1:
        for row in contributions:
            amount = f"{row.currency} {row.amount:,.2f}"
            label = (row.purpose or "Giving")[:26]
            c.setFont("Helvetica", 8)
            c.drawString(margin, y, label)
            c.setFont("Helvetica-Bold", 8)
            c.drawRightString(WIDTH - margin, y, amount)
            y -= 12
        y -= 2
        dashed()
        c.setFont("Helvetica-Bold", 9)
        c.drawString(margin, y, "TOTAL")
        c.drawRightString(WIDTH - margin, y, f"{first.currency} {sum(r.amount for r in contributions):,.2f}")
        y -= 14
    else:
        c.setFont("Helvetica-Bold", 12)
        c.drawRightString(WIDTH - margin, y - 4, f"{first.currency} {first.amount:,.2f}")
        y -= 22
        c.setFont("Helvetica", 8)
        c.drawString(margin, y, f"For: {(first.purpose or 'Giving')[:34]}")
        y -= 12
        if first.item_description:
            c.setFont("Helvetica", 7)
            c.drawString(margin, y, f"({first.item_description[:40]})")
            y -= 12

    dashed()

    # ── Footer ──
    line_out("Thank you for your giving.", "Helvetica-Oblique", 8, "center", gap=2)
    line_out('"God loves a cheerful giver." 2 Cor 9:7', "Helvetica-Oblique", 7, "center", gap=2)
    issued_eat = _to_eat(issued_at)
    line_out(f"Issued {issued_eat.strftime('%d %b %Y %H:%M')}", "Helvetica", 6.5, "center", gap=2)
    # Leave a distinct visual break after the verse and issue details before
    # the treasurer's signature block begins.
    y = _thermal_signatures(c, y - 6 * mm, WIDTH, margin, signatures)

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer.getvalue()


def generate_in_kind_thermal_receipt_pdf(
    church_name,
    donor_name,
    phone_number,
    purpose,
    notes,
    received_on,
    items,
    issued_at=None,
    signatures=None,
):
    """A thermal-style receipt for one in-kind gift — goods, not money.

    Same 80 mm layout as the money receipt, but the lines are the donated
    items rather than account amounts: there is no currency to total, so
    each item simply lists, and the purpose names what the gift was for.
    The signatures at the foot are the same two offices as the money slip.
    """
    church_name = pdf_church_name(church_name)
    issued_at = issued_at or timezone.now()

    WIDTH = 80 * mm
    margin = 6 * mm

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=(WIDTH, 200 * mm))
    y = 200 * mm - margin

    def line_out(text, font="Helvetica", size=8, align="left", gap=3):
        nonlocal y
        c.setFont(font, size)
        if align == "center":
            c.drawCentredString(WIDTH / 2, y, text)
        elif align == "right":
            c.drawRightString(WIDTH - margin, y, text)
        else:
            c.drawString(margin, y, text)
        y -= size + gap

    def dashed():
        # The dotted rule trick from the money receipt: drawn as a setDash
        # line spanning margin to margin, never a counted string of dashes.
        nonlocal y
        c.saveState()
        c.setStrokeColor(dark)
        c.setLineWidth(0.7)
        c.setDash(1, 2)
        c.line(margin, y + 3, WIDTH - margin, y + 3)
        c.restoreState()
        y -= 11

    dark = colors.HexColor("#26352f")
    c.setFillColor(dark)

    # ── Header ──
    # The A4 letterhead leaves ~8 mm of air between the logo and the title;
    # this 28 pt drop puts the receipt's title at the same distance below it.
    _draw_logo(c, WIDTH / 2, y, 7 * mm)
    y -= 7 * mm + 28
    # Both receipts are official giving receipts — the gift's kind shows in
    # the itemised lines below, not in the title.
    line_out("OFFICIAL GIVING RECEIPT", "Helvetica-Bold", 8, "center", gap=6)
    dashed()

    # ── Gift facts ──
    line_out(f"Received from: {(donor_name or 'Friend')[:38]}")
    if phone_number:
        line_out(f"Phone: {phone_number}")
    line_out(f"Received on: {received_on.strftime('%d %b %Y')}")
    line_out(f"For: {(purpose or 'In-Kind Giving')[:34]}")
    dashed()

    # ── Itemised lines ──
    for item in items:
        label = item[:40]
        c.setFont("Helvetica", 8)
        c.drawString(margin, y, f"- {label}")
        y -= 12

    if notes:
        y -= 2
        c.setFont("Helvetica-Oblique", 7)
        c.drawString(margin, y, f"Notes: {notes[:40]}")
        y -= 12

    y -= 2
    dashed()

    # ── Footer ──
    line_out("Thank you for your giving.", "Helvetica-Oblique", 8, "center", gap=2)
    line_out('"God loves a cheerful giver." 2 Cor 9:7', "Helvetica-Oblique", 7, "center", gap=2)
    issued_eat = _to_eat(issued_at)
    line_out(f"Issued {issued_eat.strftime('%d %b %Y %H:%M')}", "Helvetica", 6.5, "center", gap=2)
    # Match the cash receipt's breathing room before the signature block.
    y = _thermal_signatures(c, y - 6 * mm, WIDTH, margin, signatures)

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer.getvalue()


def generate_financial_report_pdf(church_name, report, signatures=None) -> bytes:
    """The printed twin of the reports screen: one A4 sheet a treasurer can
    pin to the noticeboard or hand out.

    The figures speak the field's own language — trust fund and local
    offerings in, expenditure out, and the total in hand they leave — and
    the sentence under the table says how the total is read, so the paper
    teaches the same arithmetic the app does.

    The statement is signed at its foot: the treasurer who prepared it and
    the first elder who authorises it, their saved signatures on the line.
    """
    church_name = pdf_church_name(church_name)

    def _escape(text):
        return str(text or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=2.0 * cm,
        bottomMargin=2.5 * cm,
    )

    story = []
    st = get_pdf_styles()

    period = (
        f"{report.period_start.strftime('%d %b %Y')} – "
        f"{report.period_end.strftime('%d %b %Y')}"
    )

    story.append(Paragraph("CHURCH FINANCIAL REPORT", st["title_big"]))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#26352f"), spaceAfter=10))

    # The statement's particulars, in the same boxed strip the meeting packet
    # uses.
    meta_data = [[
        Paragraph(
            f"<b>Statement:</b> {_escape(report.title)}<br/>"
            f"<b>Period type:</b> {report.get_period_type_display()}",
            st["cell"],
        ),
        Paragraph(
            f"<b>Period:</b> {period}<br/>"
            f"<b>Prepared:</b> {report.created_at.strftime('%d %b %Y')}",
            st["cell"],
        ),
    ]]
    meta_table = Table(meta_data, colWidths=[9.0 * cm, 9.0 * cm])
    meta_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f7f4ee")),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#dfdbd1")),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    story.append(meta_table)
    story.append(Spacer(1, 15))

    # The figures, in and out, and the total they leave in hand.
    story.append(Paragraph("Figures for the period", st["h2"]))
    fig_rows = [
        ("Trust Fund", format_money(report.total_tithes), False),
        # The trust fund is the church's submission to NEKF, so the statement
        # names where that line goes, carrying the same figure.
        ("Submitted to NEKF", format_money(report.total_tithes), False),
        ("Local Church Offerings", format_money(report.total_offerings), False),
        ("Expenditure", format_money(report.total_expenses), False),
        ("Total in hand", format_money(report.total), True),
    ]
    fig_data = [[Paragraph("Figure", st["header"]), Paragraph("KES", st["header_right"])]]
    for label, amount, is_total in fig_rows:
        fig_data.append([
            Paragraph(label, st["cell_bold"] if is_total else st["cell"]),
            Paragraph(amount, st["cell_right_bold"] if is_total else st["cell_right"]),
        ])
    fig_table = Table(fig_data, colWidths=[12.0 * cm, 6.0 * cm])
    fig_style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#26352f")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dfdbd1")),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#26352f")),
        # The total line closes the table, shaded and ruled off, so the eye
        # lands there.
        ("BACKGROUND", (0, len(fig_data) - 1), (-1, len(fig_data) - 1), colors.HexColor("#f7f4ee")),
        ("LINEABOVE", (0, len(fig_data) - 1), (-1, len(fig_data) - 1), 1, colors.HexColor("#26352f")),
    ]
    fig_table.setStyle(TableStyle(fig_style))
    story.append(fig_table)
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "<i>The total in hand is the local church offerings less what was "
        "spent; the trust fund — the figure submitted to NEKF — is held "
        "apart from it.</i>",
        st["cell"],
    ))
    story.append(Spacer(1, 15))

    # Whatever the treasurer wanted the congregation to understand.
    story.append(Paragraph("Notes &amp; Details", st["h2"]))
    if report.notes:
        notes_p = Paragraph(_escape(report.notes).replace("\n", "<br/>"), st["cell"])
        notes_table = Table([[notes_p]], colWidths=[18.0 * cm])
        notes_table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f7f4ee")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#dfdbd1")),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ])
        )
        story.append(notes_table)
    else:
        story.append(Paragraph("<i>No notes accompany this statement.</i>", st["cell"]))

    # The statement is only the church's record once its officers have signed
    # it: the treasurer who prepared it and the elder who authorises it.
    story.append(Spacer(1, 18))
    story.append(Paragraph("Signatures", st["h2"]))
    story.append(SignatureSlotsFlowable(
        signatures=signatures, slots=SignatureSlotsFlowable.STATEMENT_SLOTS,
    ))

    doc.build(story, canvasmaker=NumberedCanvas)
    buffer.seek(0)
    return buffer.getvalue()


class SignatureSlotsFlowable(Flowable):
    """Ruled slots at the foot of a report: where the people who touch it put
    their pens.

    Each slot names an office and, where that office has a saved signature
    (see ``members.signatures``), prints it on the line with the officer's
    name beneath — so a report comes off the printer already signed. A slot
    with no signature keeps the ruled line it has always drawn.

    Drawn straight onto the canvas — one ``drawString`` per slot title, rather
    than as paragraphs — so each title lands in the PDF as a single text
    object and can be found there.
    """

    #: (office code or None, slot title, hint under it) — the withdrawal
    #: paper's three: authorised, issued, received.
    SLOTS = (
        ('first_elder', "Authorizing Officer", "Elder / Church Office"),
        ('treasurer', "Issued By", "Treasury Office"),
        (None, "Received By", "Department Representative"),
    )

    #: A financial statement answers to two offices: prepared, authorised.
    STATEMENT_SLOTS = (
        ('treasurer', "Prepared By", "Treasury Office"),
        ('first_elder', "Authorizing Officer", "Church Office"),
    )

    def __init__(self, height=3.9 * cm, signatures=None, slots=None):
        super().__init__()
        self.height = height
        self.width = 0
        self.signatures = signatures or {}
        self.slots = tuple(slots or self.SLOTS)

    def wrap(self, availWidth, availHeight):
        self.width = availWidth
        return availWidth, self.height

    def draw(self):
        c = self.canv
        gap = 0.4 * cm
        count = len(self.slots)
        box_w = (self.width - gap * (count - 1)) / count
        h = self.height
        primary = colors.HexColor("#26352f")
        accent = colors.HexColor("#b36b3c")
        muted = colors.HexColor("#617068")
        border = colors.HexColor("#dfdbd1")

        c.saveState()
        for i, (code, label, hint) in enumerate(self.slots):
            x = i * (box_w + gap)
            # The slot: a white box with a header band across its top.
            c.setFillColor(colors.white)
            c.setStrokeColor(border)
            c.setLineWidth(0.75)
            c.rect(x, 0, box_w, h, stroke=1, fill=1)
            c.setFillColor(primary)
            c.rect(x, h - 0.75 * cm, box_w, 0.75 * cm, stroke=0, fill=1)
            c.setFillColor(colors.white)
            c.setFont("Helvetica-Bold", 8.5)
            c.drawString(x + (box_w - c.stringWidth(label, "Helvetica-Bold", 8.5)) / 2, h - 0.52 * cm, label)
            c.setFillColor(muted)
            c.setFont("Helvetica", 6.5)
            c.drawString(x + (box_w - c.stringWidth(hint, "Helvetica", 6.5)) / 2, h - 1.18 * cm, hint)

            inner_l, inner_r = x + 0.3 * cm, x + box_w - 0.3 * cm
            signed = self.signatures.get(code) if code else None
            # The signature rule, with the saved signature resting on it and
            # its caption beneath.
            c.setStrokeColor(accent)
            c.setLineWidth(0.75)
            c.line(inner_l, 1.15 * cm, inner_r, 1.15 * cm)
            if signed:
                _draw_signature(
                    c, signed.get("image"),
                    inner_l + 0.15 * cm, 1.22 * cm,
                    inner_r - inner_l - 0.3 * cm, max(h - 2.52 * cm, 0.6 * cm),
                )
            c.setFillColor(muted)
            c.setFont("Helvetica", 6)
            c.drawString(inner_l, 0.8 * cm, "Signature")
            # Name and date, each on its own short rule — the officer's name
            # printed where a pen would have written it.
            c.setStrokeColor(border)
            c.setLineWidth(0.5)
            c.setFont("Helvetica", 6)
            name = (signed or {}).get("name") or ""
            if name:
                c.setFillColor(primary)
                c.setFont("Helvetica-Bold", 6)
                c.drawString(inner_l, 0.32 * cm, name[:30])
                c.setFillColor(muted)
                c.setFont("Helvetica", 6)
            else:
                c.drawString(inner_l, 0.32 * cm, "Name")
                c.line(inner_l + 0.7 * cm, 0.3 * cm, x + box_w * 0.6, 0.3 * cm)
            date_l = x + box_w * 0.66
            c.drawString(date_l, 0.32 * cm, "Date")
            c.line(date_l + 0.62 * cm, 0.3 * cm, inner_r, 0.3 * cm)
        c.restoreState()


def generate_withdrawal_requests_pdf(church_name, rows, status_label="All requests", search="", signatures=True) -> bytes:
    """The treasury's withdrawal-requests report — printed from the server.

    ``rows`` are the review queue's own serialised requests, already filtered
    the way the desk filtered them on screen, so the paper matches the table.
    This is the wide report the desk's foot button prints, so it carries no
    signature slots: a signed copy belongs to one request, not to a list —
    that is what ``generate_withdrawal_request_pdf`` draws.
    """
    church_name = pdf_church_name(church_name)
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=1.5 * cm,
        leftMargin=1.5 * cm,
        topMargin=2 * cm,
        bottomMargin=2.5 * cm,
    )

    st = get_pdf_styles()
    story = []

    story.append(Paragraph("WITHDRAWAL REQUESTS REPORT", st["title_big"]))
    story.append(Paragraph(f"Generated: {datetime.now().strftime('%d %B %Y, %I:%M %p')}", st["meta"]))
    filter_line = f"Shown: {status_label}"
    if search:
        filter_line += f" · Search: {escape(search)}"
    story.append(Paragraph(filter_line, st["meta"]))
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#26352f")))
    story.append(Spacer(1, 10))

    if not rows:
        story.append(Paragraph("No withdrawal requests match the current filters.", st["cell"]))
    else:
        status_names = {
            "pending": "Pending",
            "elder_approved": "Elder Approved",
            "approved": "Approved",
            "declined": "Rejected",
            "reversed": "Reversed",
        }

        def fmt_date(value):
            if hasattr(value, "strftime"):
                return value.strftime("%d/%m/%Y")
            text = str(value or "")
            return f"{text[8:10]}/{text[5:7]}/{text[0:4]}" if len(text) >= 10 else text

        header = [
            Paragraph("#", st["header"]),
            Paragraph("Date", st["header"]),
            Paragraph("Department &amp; Account", st["header"]),
            Paragraph("Purpose &amp; Details", st["header"]),
            Paragraph("Amount (KES)", st["header_right"]),
            Paragraph("Status", st["header"]),
        ]
        table_data = [header]
        total = Decimal("0")
        for idx, row in enumerate(rows, 1):
            amount = Decimal(str(row.get("amount") or "0"))
            total += amount
            details = [f"<b>{escape(str(row.get('reason') or '—'))}</b>"]
            details.append(
                f"Asked by {escape(str(row.get('requested_by') or '—'))} · Bal: KES {format_money(row.get('account_balance'))}"
            )
            if row.get("elder_approved_by"):
                details.append(f"Elder approved by {escape(str(row['elder_approved_by']))}")
            if row.get("decided_by") and row.get("status") in ("approved", "declined"):
                line = f"{'Approved' if row['status'] == 'approved' else 'Rejected'} by {escape(str(row['decided_by']))}"
                if row.get("reply"):
                    line += f" — “{escape(str(row['reply']))}”"
                details.append(line)
            table_data.append([
                Paragraph(str(idx), st["cell"]),
                Paragraph(fmt_date(row.get("created_at")), st["cell"]),
                Paragraph(
                    f"<b>{escape(str(row.get('department') or '—'))}</b><br/>{escape(str(row.get('account_name') or '—'))}",
                    st["cell"],
                ),
                Paragraph("<br/>".join(details), st["cell"]),
                Paragraph(format_money(amount), st["cell_right_bold"]),
                Paragraph(status_names.get(row.get("status"), str(row.get("status") or "—")), st["cell"]),
            ])
        table_data.append([
            "",
            "",
            "",
            Paragraph(f"Total — {len(rows)} request{'s' if len(rows) != 1 else ''}", st["cell_bold"]),
            Paragraph(format_money(total), st["cell_right_bold"]),
            "",
        ])

        table = Table(
            table_data,
            colWidths=[0.8 * cm, 1.9 * cm, 3.5 * cm, 6.2 * cm, 2.4 * cm, 1.9 * cm],
            repeatRows=1,
        )
        style_cmds = [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#26352f")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#dfdbd1")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#c9c5bb")),
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#eef2ed")),
        ]
        for i in range(2, len(table_data) - 1, 2):
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#f7f4ee")))
        table.setStyle(TableStyle(style_cmds))
        story.append(table)

    # Only a per-request print is signed; the desk's wide report is not.
    if signatures:
        story.append(Spacer(1, 14))
        story.append(Paragraph("Signatures", st["h2"]))
        story.append(SignatureSlotsFlowable())

    doc.build(story, canvasmaker=NumberedCanvas)
    buffer.seek(0)
    return buffer.getvalue()


def amount_in_words(amount) -> str:
    """A money value spelled out with its unit, for the signable withdrawal form.

    Reads the way it would be said at the counter: "eight thousand and ten
    shillings", singular for one, cents trailing after the shillings.
    """
    try:
        value = Decimal(str(amount))
    except Exception:
        return ""
    negative = value < 0
    value = abs(value).quantize(Decimal("0.01"))
    shillings = int(value)
    cents = int((value - shillings) * 100)

    ones = (
        "zero", "one", "two", "three", "four", "five", "six", "seven",
        "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen",
        "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
    )
    tens = ("", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety")

    def below_hundred(n):
        if n < 20:
            return ones[n]
        t, o = divmod(n, 10)
        return tens[t] + (f"-{ones[o]}" if o else "")

    def below_thousand(n):
        if n < 100:
            return below_hundred(n)
        h, r = divmod(n, 100)
        return ones[h] + " hundred" + (f" and {below_hundred(r)}" if r else "")

    def spell(n):
        if n == 0:
            return "zero"
        parts = []
        for divisor, name in ((1_000_000_000, "billion"), (1_000_000, "million"), (1_000, "thousand")):
            if n >= divisor:
                q, n = divmod(n, divisor)
                parts.append(f"{spell(q)} {name}")
        if n:
            # Spoken money joins the last short group with "and" — "eight
            # thousand and ten" — while the hundreds keep their own ("one
            # hundred and twenty-three").
            if parts and n < 100:
                return f"{' '.join(parts)} and {below_thousand(n)}"
            parts.append(below_thousand(n))
        return " ".join(parts)

    words = spell(shillings)
    words += " shilling" if shillings == 1 else " shillings"
    if cents:
        words += f" and {below_hundred(cents)} cents"
    if negative:
        words = "minus " + words
    return words


def generate_withdrawal_request_pdf(church_name, row, signatures=None) -> bytes:
    """One department withdrawal request as a sheet that can be signed.

    The treasury desk's per-request Print: the same request the queue shows,
    set alone on its own page with the amount spelled out, so the department's
    representative can carry it to the treasury, sign for the money and file
    it. It closes with the three signature slots — the authorizing officer,
    the one issuing, and the receiver.
    """
    church_name = pdf_church_name(church_name)
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=1.5 * cm,
        leftMargin=1.5 * cm,
        topMargin=2 * cm,
        bottomMargin=2.5 * cm,
    )

    st = get_pdf_styles()
    story = []

    story.append(Paragraph("WITHDRAWAL REQUEST", st["title_big"]))
    story.append(Paragraph(
        f"Request #{row.get('id')} · Printed {datetime.now().strftime('%d %B %Y, %I:%M %p')}",
        st["meta"],
    ))
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#26352f")))
    story.append(Spacer(1, 12))

    status_names = {
        "pending": "Pending",
        "elder_approved": "Elder Approved",
        "approved": "Approved",
        "declined": "Rejected",
        "reversed": "Reversed",
    }

    def fmt_date(value):
        if hasattr(value, "strftime"):
            return value.strftime("%d/%m/%Y")
        text = str(value or "")
        return f"{text[8:10]}/{text[5:7]}/{text[0:4]}" if len(text) >= 10 else text

    amount = Decimal(str(row.get("amount") or "0"))
    balance = Decimal(str(row.get("account_balance") or "0"))

    elder_line = "—"
    if row.get("elder_approved_by"):
        elder_line = str(row["elder_approved_by"])
        if row.get("elder_approved_at"):
            elder_line += f" · {fmt_date(row['elder_approved_at'])}"

    # The treasurer's own approval: who decided, and the day they did — the
    # status itself lives on the row above, so this names the officer and date.
    decision_line = "—"
    if row.get("decided_by"):
        decision_line = str(row["decided_by"])
        if row.get("decided_at"):
            decision_line += f" · {fmt_date(row['decided_at'])}"
    if row.get("reply"):
        decision_line += f"\n“{row['reply']}”"

    def label(text):
        return Paragraph(f"<b>{escape(text)}</b>", st["cell"])

    def value(text, style="cell"):
        return Paragraph(text or "—", st[style])

    detail = Table(
        [
            [label("Department"), value(escape(str(row.get("department") or "—"))),
             label("Date Raised"), value(escape(fmt_date(row.get("created_at"))))],
            [label("Account"), value(escape(str(row.get("account_name") or "—"))),
             label("Asked By"), value(escape(str(row.get("requested_by") or "—")))],
            [label("Amount Requested"), value(f"KES {format_money(amount)}", "cell_bold"),
             label("Fund Balance"), value(f"KES {format_money(balance)}")],
            [label("Status"), value(status_names.get(row.get("status"), str(row.get("status") or "—"))),
             label("Elder Approval"), value(escape(elder_line))],
            [label("Purpose"), value(escape(str(row.get("reason") or "—"))),
             label("Treasurer approval"), value(escape(decision_line))],
        ],
        colWidths=[3.0 * cm, 5.8 * cm, 3.0 * cm, 6.2 * cm],
    )
    detail.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f7f4ee")),
        ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#f7f4ee")),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#dfdbd1")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#c9c5bb")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(detail)
    story.append(Spacer(1, 12))
    story.append(Paragraph(
        f"Amount in words: <b>{escape(amount_in_words(amount))}</b> only.",
        st["cell"],
    ))

    story.append(Spacer(1, 16))
    story.append(Paragraph("Signatures", st["h2"]))
    story.append(SignatureSlotsFlowable(signatures=signatures))

    doc.build(story, canvasmaker=NumberedCanvas)
    buffer.seek(0)
    return buffer.getvalue()


def _spoken_hour(clk):
    """A stored ``HH:MM`` hour spoken as a programme says it — ``8:15 PM``."""
    match = re.match(r'^(\d{1,2}):(\d{2})$', str(clk or '').strip())
    if not match:
        return ''
    hour, minute = int(match.group(1)), int(match.group(2))
    if hour > 23 or minute > 59:
        return ''
    hour12 = hour % 12 or 12
    return f'{hour12}:{minute:02d} ' + ('PM' if hour >= 12 else 'AM')


def _spoken_range(start, end):
    """Two hours the way a programme prints them: the meridiem said once when
    both ends of the run sit in the same half of the day — ``8:00 – 10:00 AM``.
    An hourless entry prints as the one hour it carries, or nothing at all."""
    first, second = _spoken_hour(start), _spoken_hour(end)
    if first and second:
        if first[-2:] == second[-2:]:
            return f'{first[:-3]} – {second}'
        return f'{first} – {second}'
    return first or second


#: The church's mission and its vision — the two statements the About page
#: and the landing page already speak, so the brochure says it with them and
#: the whole site speaks with one voice.
PROGRAM_MISSION_STATEMENT = (
    'Make disciples of Jesus Christ who live as His loving witnesses and '
    'proclaim to all people the everlasting gospel of the Three Angels\u2019 '
    'Messages in preparation for His soon return.'
)
PROGRAM_MISSION_REF = 'Matthew 28:18\u201320 · Acts 1:8 · Revelation 14:6\u201312'
PROGRAM_VISION_STATEMENT = (
    'In harmony with Bible revelation, Seventh-day Adventists see as the '
    'climax of God\u2019s plan the restoration of all His creation to full '
    'harmony with His perfect will and righteousness.'
)
PROGRAM_VISION_REF = 'Revelation 21:1\u20135 · 2 Peter 3:13'


def _hsl_to_rgb(h, s, l):
    """Hue 0–1, saturation, lightness → the (r, g, b) 0–1 triple."""
    def channel(p, q, t):
        t = t % 1.0
        if t < 1 / 6:
            return p + (q - p) * 6 * t
        if t < 1 / 2:
            return q
        if t < 2 / 3:
            return p + (q - p) * (2 / 3 - t) * 6
        return p

    if s == 0:
        return l, l, l
    q = l * (1 + s) if l < 1 / 2 else l + s - l * s
    p = 2 * l - q
    return channel(p, q, h + 1 / 3), channel(p, q, h), channel(p, q, h - 1 / 3)


#: The accent each department already owns on the website — the desk hub's
#: DEPARTMENT_STYLES hues, sampled once here so the paper and the screen say
#: the same thing about who is running the day.
_DEPARTMENT_ACCENTS = {
    'amm': '#1e40af',          # blue
    'awm': '#9f1239',          # rose
    'aym': '#b45309',          # amber
    'children': '#86198f',     # fuchsia
    'ambassadors': '#9a3412',  # orange
    'apm': '#0f766e',          # teal
    'chaplaincy': '#312e81',   # indigo
    'eldership': '#6d28d9',    # violet
    'clerkship': '#0e7490',    # cyan
    'deaconate': '#065f46',    # emerald
    'health': '#166534',       # green
    'welfare': '#92400e',      # dark amber
    'dorcas': '#9f1239',       # rose
    'development': '#065f46',  # emerald
}


def _department_accent(code, name=''):
    """The department's own accent colour, in the palette's weight.

    A department the desk added after this list was written still gets a
    colour, drawn from its own name by a golden-angle spread of hues —
    deterministic, so the same area always prints the same colour, and
    weighted dark-saturated rather than bright, so print keeps its dignity.
    """
    key = str(code or '').strip().lower()
    known = _DEPARTMENT_ACCENTS.get(key)
    if known:
        return colors.HexColor(known)
    seed = sum(ord(ch) * (i + 1) for i, ch in enumerate((key or str(name or '').strip().lower()) or 'department'))
    hue = (seed * 0.61803) % 1.0
    r, g, b = _hsl_to_rgb(hue, 0.55, 0.34)
    return colors.HexColor('#%02x%02x%02x' % (round(r * 255), round(g * 255), round(b * 255)))


#: How far an activity sits under the session that opens it — the indent
#: both of a programme's papers read with the same measure.
PROGRAM_ROW_INDENT = 14


def _program_rows(event):
    """The typed order of service, spoken the way every paper reads it.

    Both of a programme's papers — the plain sheet the desk shares, and the
    bifold it prints into hard copy — lay the same rows down, so their
    reading is built once here: a session's hours, its name and its
    facilitators, and beneath them each activity the session holds, with
    its own hours and its own people. A day with nothing typed yet still
    reads as paper, saying so in one row.
    """
    INDENT = PROGRAM_ROW_INDENT
    sessions = event.program_items if isinstance(event.program_items, list) else []

    def people_of(entry):
        out = []
        for person in (entry or [])[:20]:
            if isinstance(person, dict):
                name = str(person.get('name') or '').strip()
                if name:
                    out.append((name, str(person.get('role') or '').strip()))
        return out

    rows = []
    for session in sessions[:60]:
        if not isinstance(session, dict):
            continue
        title = str(session.get('title') or '').strip()
        session_people = people_of(session.get('participants'))
        children = []
        for part in (session.get('parts') or [])[:40]:
            if not isinstance(part, dict):
                continue
            part_title = str(part.get('title') or '').strip()
            part_people = people_of(part.get('participants'))
            if not part_title and not part_people:
                continue
            children.append({
                'hours': _spoken_range(part.get('start'), part.get('end')),
                'title': part_title,
                'people': part_people,
                'indent': INDENT,
            })
        if not title and not session_people and not children:
            continue
        rows.append({
            'hours': _spoken_range(session.get('start'), session.get('end')),
            'title': title,
            'people': session_people,
            'indent': 0,
        })
        rows.extend(children)

    if not rows:
        rows.append({'hours': '', 'title': 'The order of service has not been typed yet.',
                     'people': [], 'indent': 0})
    return rows


def generate_event_program_plain_pdf(
    event, department_name: str = '', contact=None, department_code: str = '',
    church_name: str = '',
) -> bytes:
    """One calendar event's plain sheet — the programme as one letterhead page.

    Where the bifold answers print — a sheet that folds and is handed at the
    door — this answers sharing: a single column on portrait A4 that a phone
    reads comfortably and a link hands on whole. It keeps what the printed
    sheet's inside spread says — the church's mark at the head, the day as
    the letterhead names it, and the typed order of service beneath — and
    leaves the fold's paper to the brochure. A day too long for one page
    runs onto the next with the same compact head, so nothing about the
    page changes mid-stream; no fold guides, no washes, only ink the way a
    plain document speaks it.

    `contact` trims the page's foot, spoken small under a rule: where the
    church stands and one line on how to give towards the day. Whatever is
    absent is left off the paper, never guessed at — the printed brochure
    carries the full welcome; this sheet keeps only what it was handed.
    """
    contact = contact or {}
    buffer = io.BytesIO()

    page_w, page_h = A4                     # portrait — a page, not a fold
    side = 16 * mm
    bottom = 18 * mm
    foot_h = 34                             # room the page's foot keeps

    DARK = colors.HexColor('#26352f')
    GREY = colors.HexColor('#617068')
    RULE = colors.HexColor('#dfdbd1')
    ACCENT = _department_accent(department_code, department_name)

    def wrap(text, font, size, width):
        return simpleSplit(text, font, size, width)

    c = canvas.Canvas(buffer, pagesize=(page_w, page_h))

    def head(page_i, pages, title_pieces, title_size, meta_lines):
        """Draw the page's letterhead — mark, kicker, the day, its meta — and
        return the `y` the first row line sits at."""
        cx = page_w / 2
        logo_h = 15 * mm if page_i == 0 else 10 * mm
        _draw_logo(c, cx, page_h - 30, logo_h)
        y = page_h - 30 - logo_h - 22
        if page_i > 0:
            c.setFont('Helvetica', 8.5)
            c.setFillColor(GREY)
            c.drawCentredString(cx, y - 2, f'continued \u00b7 page {page_i + 1} of {pages}')
            y -= 14
        c.setStrokeColor(RULE)
        c.setLineWidth(0.9)
        c.line(side, y, page_w - side, y)
        y -= 26
        # The day, spoken first: kicker wide in the ministry's own accent —
        # the same sentence the brochure's cover says of the day.
        c.setFont('Helvetica-Bold', 9)
        c.setFillColor(ACCENT)
        c.drawCentredString(cx, y, 'ORDER OF SERVICE')
        y -= 26
        c.setFillColor(DARK)
        c.setFont('Helvetica-Bold', title_size)
        for piece in title_pieces:
            c.drawCentredString(cx, y, piece)
            y -= title_size * 1.22
        y += (title_size * 0.35)          # the meta's breath, not the line's
        c.setStrokeColor(RULE)
        c.setLineWidth(0.7)
        c.line(side + 24, y - 4, page_w - side - 24, y - 4)
        y -= 6
        for bit in meta_lines:
            c.setFont('Helvetica', 9.5)
            c.setFillColor(GREY)
            c.drawCentredString(cx, y, bit)
            y -= 14
        y -= 16                           # the rows' air below the head
        return y

    def foot(page_i, pages):
        """The page's foot: a rule and, when the church handed one, its name
        and where it stands — small, grey, and never mistaken for the day."""
        c.setStrokeColor(RULE)
        c.setLineWidth(0.6)
        c.line(side, bottom - 6, page_w - side, bottom - 6)
        y = bottom - 20
        name = pdf_church_name(church_name)
        lines = []
        if name:
            lines.append((name, 'Helvetica-Bold'))
        address = str(contact.get('address') or '').strip()
        if address:
            address_lines = wrap(address, 'Helvetica', 7.5, page_w - 2 * side)
            lines.extend((piece, 'Helvetica') for piece in address_lines[:2])
        giving = contact.get('giving') or []
        giving_line = ', '.join(str(part or '').strip() for part in giving[:2] if str(part or '').strip())
        if giving_line:
            for piece in wrap('\u2192 ' + giving_line, 'Helvetica', 7.5, page_w - 2 * side)[:1]:
                lines.append((piece, 'Helvetica'))
        if page_i + 1 < pages:
            lines.append((f'Page {page_i + 1} of {pages}', 'Helvetica'))
        for text, font in lines:
            c.setFont(font, 7.5)
            c.setFillColor(GREY)
            c.drawString(side, y, text)
            y -= 10

    # ── The day as the letterhead names it ────────────────────────────────
    title = str(event.title or 'Program').strip() or 'Program'
    content_w = page_w - 2 * side
    title_size = 20
    title_pieces = wrap(title, 'Helvetica-Bold', title_size, content_w)
    if len(title_pieces) > 3:
        title_size = 16
        title_pieces = wrap(title, 'Helvetica-Bold', title_size, content_w)

    meta = []
    date_text = str(event.event_date)[:10]
    try:
        parsed_day = datetime.strptime(date_text, '%Y-%m-%d')
        meta.append(parsed_day.strftime('%A, %d %B %Y'))
    except ValueError:
        if date_text:
            meta.append(date_text)
    hours = _spoken_range(event.event_time.strftime('%H:%M') if event.event_time else '',
                          event.end_time.strftime('%H:%M') if event.end_time else '')
    if hours:
        meta.append(hours)
    if department_name:
        meta.append(department_name)
    if event.unit:
        meta.append(f'Unit: {event.unit}')
    if event.lead:
        meta.append(f'Led by {event.lead}')
    if event.mode == 'virtual':
        meta.append('Virtual')
    elif str(event.location or '').strip():
        meta.append(str(event.location).strip())

    # ── Flow the rows down the pages, then ink them ──────────────────────
    rows = _program_rows(event)

    def row_lines(row):
        width = content_w - row['indent']
        lines = []
        if row['hours']:
            lines.append((row['hours'], 'Helvetica-Bold', 9, ACCENT, 4, side + row['indent']))
        size = 10.5 if row['indent'] else 12
        for piece in wrap(row['title'] or '\u2014', 'Helvetica-Bold', size, width):
            lines.append((piece, 'Helvetica-Bold', size, DARK, 2.5, side + row['indent']))
        for name, role in row['people']:
            text = f'\u2022 {name}' + (f' \u00b7 {role}' if role else '')
            for piece in wrap(text, 'Helvetica', 8.5, width):
                lines.append((piece, 'Helvetica', 8.5, GREY, 1.5, side + row['indent']))
        return lines

    # The rows are fitted before the paper is drawn: the page count the
    # foot speaks must be known before a foot exists. The head that stands
    # over the first page is measured by the same arithmetic the head draws
    # with — the mark, the shout, the day, its meta — so ink and budget
    # never drift apart. Continuation pages keep the same budget: their
    # smaller mark gives back about the room their 'continued' line takes.
    logo_h = 15 * mm
    head_bottom = (
        (page_h - 30)                                   # the mark's top
        - (logo_h + 22)                                 # the mark and its breath
        - 26                                            # the rule's step
        - 26                                            # the kicker's line
        - 26                                            # the air before the name
        - title_size * 1.22 * len(title_pieces)         # the name's lines
        + title_size * 0.35                             # the name's breath back
        - 6                                             # the meta rule's step
        - 14 * len(meta)                                # the meta's spoken lines
        - 16                                            # the air below the head
    )
    usable = head_bottom - (bottom + foot_h)
    if usable < 120:
        usable = 120

    pages_rows = [[]]
    running = usable
    for position, row in enumerate(rows):
        lines = row_lines(row)
        height = sum(size + space for (_t, _f, size, _c, space, _x) in lines) + 8
        # A session head never ends a page while the activity it opens
        # follows: both travel to the next page together.
        stranded = (
            row['indent'] == 0
            and len(pages_rows[-1]) > 0
            and position + 1 < len(rows)
            and rows[position + 1]['indent'] > 0
        )
        need = height
        if stranded:
            next_height = sum(size + space for (_t, _f, size, _c, space, _x) in row_lines(rows[position + 1])) + 8
            need += next_height
        if pages_rows[-1] and need > running:
            pages_rows.append([])
            running = usable
        pages_rows[-1].append((row, lines))
        running -= height

    # ── The ink ───────────────────────────────────────────────────────────
    for page_i, page_rows_list in enumerate(pages_rows):
        y = head(page_i, len(pages_rows), title_pieces, title_size, meta)
        for row, lines in page_rows_list:
            x = side + row['indent']
            for text, font, size, colour, space, lx in lines:
                c.setFont(font, size)
                c.setFillColor(colour)
                y -= size
                c.drawString(lx, y, text)
                y -= space
            c.setStrokeColor(RULE)
            c.setLineWidth(0.4)
            c.line(x, y - 2, x + (content_w - row['indent']), y - 2)
            y -= 8
        foot(page_i, len(pages_rows))
        c.showPage()
    c.save()
    buffer.seek(0)
    return buffer.getvalue()


def generate_event_program_pdf(event, department_name: str = '', contact=None, department_code: str = '') -> bytes:
    """One calendar event's bifold — the order of service on a sheet that folds.

    The desk's typed day — the sessions, the activities inside each one, and
    who facilitates them — is laid out as the booklet the congregation is
    handed at the door: an A4 sheet printed on both sides and folded once
    down the middle, each pair of pages one sheet of paper. Printed duplex
    (flip on the short edge), pages pair as outsides and insides.

    A sheet's outside carries the cover on its right panel — the church's
    mark, the day and its ministry, over the church's own building — and the
    back panel on its left, which opens with the church's mission
    and its vision (the same statements the About page speaks) and keeps its
    welcome — where to find it, its week of worship, and how to give — at the
    fold's foot. Gradients stay inside the palette's own sand and ember, the
    washes printing as flat light rather than loud colour.

    A day too long for one spread flows onto another sheet — the same bifold
    whose cover says continued, its back panel repeating the welcome so the
    second sheet folds up complete on its own.

    `contact` holds what the back panel speaks: `address`, `services` (the
    church's weekly gatherings as {weekday, text} rows) and `giving` (its
    M-Pesa and bank lines). Whatever is absent is left off the paper, never
    guessed at.

    An uploaded file cannot be folded into a typed sheet's paper, so this
    prints what was typed; a file rides on the event beside it and is opened
    as itself.
    """
    contact = contact or {}
    buffer = io.BytesIO()

    page_w, page_h = landscape(A4)          # 841.89 x 595.28 — fold across the middle
    panel_w = page_w / 2
    side = 13 * mm
    headroom = 56                            # the inside label lives at the top edge
    footroom = 42
    fold_x = panel_w

    DARK = colors.HexColor('#26352f')
    GREY = colors.HexColor('#617068')
    EMBER = colors.HexColor('#b36b3c')
    RULE = colors.HexColor('#dfdbd1')
    GOLD = colors.HexColor('#f1c89e')       # the highlight gold on a dark card
    LINEN = colors.HexColor('#faf7f2')      # the wash's head
    PLATE = colors.HexColor('#fcfbf9')      # the wash's foot
    # The day belongs to a department, so the accents that speak of the day
    # — its hours, the cover's stroke and foot band — wear its own colour.
    # EMBER stays where the panel speaks for the church itself.
    ACCENT = _department_accent(department_code, department_name)

    def wrap(text, font, size, width):
        return simpleSplit(text, font, size, width)

    def wash(x, y, w, h, cols, radius=0, horizontal=False):
        """A rect — optionally rounded — filled with a linear gradient of
        `cols`, the first at the gradient's head (the top, or the left when
        horizontal). The colour rides clipped inside the shape, so it never
        bleeds past a card's corners or off the cover's edges."""
        steps = [i / (len(cols) - 1) for i in range(len(cols))]
        c.saveState()
        p = c.beginPath()
        if radius:
            p.roundRect(x, y, w, h, radius)
        else:
            p.rect(x, y, w, h)
        c.clipPath(p, stroke=0, fill=0)
        if horizontal:
            c.linearGradient(x, y, x + w, y, cols, positions=steps, extend=True)
        else:
            c.linearGradient(x, y + h, x, y, cols, positions=steps, extend=True)
        c.restoreState()

    # ── The typed rows, as the panels will flow them — built once, the same
    # reading the plain sheet lays down, so what the desk shares and what it
    # prints say the day with one voice. ──
    rows = _program_rows(event)

    def row_lines(row):
        """One row's spoken pieces: its hours, its name, its facilitators."""
        width = panel_w - 2 * side - row['indent']
        lines = []
        if row['hours']:
            lines.append((row['hours'], 'Helvetica-Bold', 9, ACCENT, 4))
        size = 11 if row['indent'] else 12.5
        for piece in wrap(row['title'] or '\u2014', 'Helvetica-Bold', size, width):
            lines.append((piece, 'Helvetica-Bold', size, DARK, 2.5))
        for name, role in row['people']:
            text = f'\u2022 {name}' + (f' \u00b7 {role}' if role else '')
            for piece in wrap(text, 'Helvetica', 8.5, width):
                lines.append((piece, 'Helvetica', 8.5, GREY, 1.5))
        return lines

    def row_height(row):
        # What the panel consumes for one row: its lines, the hairline under
        # it, and the breath after. Drawn and measured from the same numbers,
        # so the flow never drifts from where the ink lands.
        return sum(size + space for (_t, _f, size, _c, space) in row_lines(row)) + 8

    # ── Fitting the rows onto panels: two columns of one spread per sheet ─

    usable_h = page_h - headroom - footroom
    spreads = [[[], []]]
    y_left = usable_h
    y_right = usable_h
    col_i = 0
    row_i = 0
    while row_i < len(rows):
        row = rows[row_i]
        lines = row_lines(row)
        height = sum(size + space for (_t, _f, size, _c, space) in lines) + 8
        column = spreads[-1][col_i]

        # A session head never sits as its column's last line while the
        # activity it opens follows it: the name should carry its first
        # activity onto the same panel, or both travel to the next one.
        stranded = (
            row['indent'] == 0
            and len(column) > 0
            and row_i + 1 < len(rows)
            and rows[row_i + 1]['indent'] > 0
        )
        need = height
        if stranded:
            next_lines = row_lines(rows[row_i + 1])
            need += sum(size + space for (_t, _f, size, _c, space) in next_lines) + 8

        if column and need > (y_left if col_i == 0 else y_right):
            if col_i == 0:
                col_i = 1
            else:
                spreads.append([[], []])
                y_left = usable_h
                y_right = usable_h
                col_i = 0
            continue

        spreads[-1][col_i].append((row, lines))
        if col_i == 0:
            y_left -= height
        else:
            y_right -= height
        row_i += 1

    # ── The panels themselves ──────────────────────────────────────────────

    date_text = str(event.event_date)[:10]
    cover_meta = []
    try:
        parsed_day = datetime.strptime(date_text, '%Y-%m-%d')
        cover_meta.append(parsed_day.strftime('%A'))
        cover_meta.append(parsed_day.strftime('%d/%m/%Y'))
    except ValueError:
        if date_text:
            cover_meta.append(date_text)
    if department_name:
        cover_meta.append(department_name)
    if event.unit:
        cover_meta.append(f'Unit: {event.unit}')
    if event.lead:
        cover_meta.append(f'Led by {event.lead}')
    if event.mode == 'virtual':
        cover_meta.append('Virtual')
    elif str(event.location or '').strip():
        cover_meta.append(str(event.location).strip())

    def fold_guides():
        # Where the paper folds: two short ticks on each page's top and
        # bottom edges, at the fold. Nothing in the panels ever reaches them.
        c.setStrokeColor(RULE)
        c.setLineWidth(0.7)
        c.line(fold_x, page_h - 6, fold_x, page_h - 18)
        c.line(fold_x, 18, fold_x, 6)

    def draw_cover(c, x0, sheet_i):
        cx = x0 + panel_w / 2
        content_w = panel_w - 2 * side
        if sheet_i == 0:
            title = str(event.title or 'Program').strip() or 'Program'
            # The church's own poster stands where a faint symbol once did —
            # printed whole (its letterhead and its lines included, as the
            # church asked) rather than drawn faint — ringed in the panel's
            # hairline and settled just above the foot band. The box is set
            # by the room the words above it leave, and takes the poster's
            # own shape: this download is square, so it runs taller down the
            # cover than the wall's wide rendering did, into the space the
            # panel has to give.
            photo_w_cap = content_w * 0.8
            # The words' own arithmetic, run without drawing: the title's
            # lines, the stroke and rule, then the day's meta rows, each
            # fifteen points down. The last meta baseline bounds the image.
            y_title = page_h - 38 - 16 * mm - 44
            title_size = 21
            pieces = wrap(title, 'Helvetica-Bold', title_size, content_w)
            if len(pieces) > 3:
                title_size = 17
                pieces = wrap(title, 'Helvetica-Bold', title_size, content_w)
            y_after = y_title - len(pieces[:4]) * title_size * 1.22
            y_after -= 22  # the gradient stroke's row
            y_after -= 22  # the hairline rule's row
            y_after -= 15 * len(cover_meta)
            last_baseline = y_after + 15
            room = max(120.0, last_baseline - 6 - 28)
            if _CHURCH_BUILDING_RATIO >= photo_w_cap / room:
                photo_w, photo_h = photo_w_cap, photo_w_cap / _CHURCH_BUILDING_RATIO
            else:
                photo_h, photo_w = room, room * _CHURCH_BUILDING_RATIO
            photo_x, photo_y = cx - photo_w / 2, 28
            c.saveState()
            outline = c.beginPath()
            outline.roundRect(photo_x, photo_y, photo_w, photo_h, 10)
            c.clipPath(outline, stroke=0, fill=0)
            c.drawImage(_CHURCH_BUILDING, photo_x, photo_y, photo_w, photo_h)
            c.restoreState()
            c.setStrokeColor(RULE)
            c.setLineWidth(0.9)
            border = c.beginPath()
            border.roundRect(photo_x, photo_y, photo_w, photo_h, 10)
            c.drawPath(border, stroke=1, fill=0)
            # The church's mark at the cover's head — the letterhead's own
            # lockup, drawn larger on a cover than the office sheets use.
            _draw_logo(c, cx, page_h - 38, 16 * mm)
            # The sheet's name, spoken first: the name the inside pages
            # label, set wide above the day's title in the department's own
            # accent, so the cover says what the reader is holding.
            kicker = 'ORDER OF SERVICE'
            tracking = 4
            c.setFont('Helvetica-Bold', 9)
            c.setFillColor(ACCENT)
            kick_w = c.stringWidth(kicker, 'Helvetica-Bold', 9) + tracking * (len(kicker) - 1)
            ktext = c.beginText(cx - kick_w / 2, page_h - 38 - 16 * mm - 14)
            # Letter-spacing lives in the text state, so it is cleared inside
            # the same line: otherwise every line drawn after the kicker
            # inherits the tracking and drifts wide of its measure.
            ktext.setCharSpace(tracking)
            ktext.textOut(kicker)
            ktext.setCharSpace(0)
            c.drawText(ktext)
            title = str(event.title or 'Program').strip() or 'Program'
            size = 21
            pieces = wrap(title, 'Helvetica-Bold', size, content_w)
            if len(pieces) > 3:
                size = 17
                pieces = wrap(title, 'Helvetica-Bold', size, content_w)
            y = page_h - 38 - 16 * mm - 44
            c.setFillColor(DARK)
            c.setFont('Helvetica-Bold', size)
            for piece in pieces[:4]:
                c.drawCentredString(cx, y, piece)
                y -= size * 1.22
            # A short gradient stroke ties the name to its day — the
            # department's own colour easing into the lockup's gold, the
            # accent the inside spread gives the hours.
            wash(cx - 22, y + 8, 44, 2, [ACCENT, GOLD], horizontal=True)
            y -= 22
            c.setStrokeColor(RULE)
            c.setLineWidth(1)
            c.line(x0 + side + 10, y, x0 + panel_w - side - 10, y)
            y -= 22
            for bit in cover_meta:
                c.setFont('Helvetica', 10)
                c.setFillColor(GREY)
                c.drawCentredString(cx, y, bit)
                y -= 15
            # A band of colour closes the cover at its foot: dark easing into
            # the department's colour easing into the lockup's gold — the
            # church's paper, the day's identity, standing where a fold meets
            # a reader's thumb.
            wash(x0, 16, panel_w, 5, [DARK, ACCENT, GOLD], horizontal=True)
        else:
            # A continuation sheet folds up complete on its own: its own
            # mark, and a cover that says so.
            _draw_logo(c, cx, page_h - 38, 12 * mm)
            y = page_h - 38 - 12 * mm - 26
            c.setFont('Helvetica-Bold', 8)
            c.setFillColor(ACCENT)
            c.drawCentredString(cx, y, 'ORDER OF SERVICE')
            y -= 12
            c.setFont('Helvetica', 9)
            c.setFillColor(GREY)
            c.drawCentredString(cx, y, f'continued \u00b7 sheet {sheet_i + 1} of {len(spreads)}')
            y -= 24
            c.setFont('Helvetica-Bold', 13)
            c.setFillColor(DARK)
            for piece in wrap(str(event.title or 'Program'), 'Helvetica-Bold', 13, content_w)[:3]:
                c.drawCentredString(cx, y, piece)
                y -= 16

    def draw_back(c, x0):
        x = x0 + side
        w = panel_w - 2 * side

        # ── Who we are: the mission and the vision open the panel — the two
        # statements the congregation should meet before anything else of
        # the church's business. Neither sits in a box: both are set as bare
        # ink on the panel's own linen, each measured by a bar of the day's
        # accent rising behind it, and a gradient stroke marks the turn from
        # one statement to the next. ──
        bar_w = 3
        body_x = x + bar_w + 11
        body_w = w - bar_w - 11

        def block_h(text, size, lead):
            # What one statement occupies from its top line to its foot: the
            # air above its label, the label, its wrapped lines, its
            # reference, and the breath after it. Drawn and measured from
            # the same numbers, so the pinned foot never drifts.
            return 12 + 8 + 15 + 8 + len(wrap(text, 'Helvetica', size, body_w)) * lead + 10 + 3

        def statement(label_text, statement_text, ref, statement_colour, bar_cols, y):
            """Set one statement as open ink over the panel, from a `y` that
            is its top, and report where the panel lands at its foot."""
            y -= 12
            bar_top = y + 1
            c.setFont('Helvetica-Bold', 8)
            c.setFillColor(EMBER)
            c.drawString(body_x, y - 8, label_text)
            y -= 15 + 8
            c.setFont('Helvetica', t_size)
            c.setFillColor(statement_colour)
            for piece in wrap(statement_text, 'Helvetica', t_size, body_w):
                c.drawString(body_x, y, piece)
                y -= t_lead
            y -= 10
            c.setFont('Helvetica-Oblique', 7.5)
            c.setFillColor(GREY)
            c.drawString(body_x, y, ref)
            wash(x, y - 2, bar_w, bar_top - y + 2, bar_cols)
            return y - 3

        # Contacts wrap at the sizes below; both passes are measured the same
        # way they will be drawn, so the pinned foot never drifts.
        blocks = []
        if contact.get('address'):
            blocks.append(('Find us', [str(contact['address']).strip()]))
        if contact.get('services'):
            svc_lines = []
            for svc in contact['services']:
                line = ' \u00b7 '.join(part for part in (
                    str(svc.get('weekday') or '').strip(),
                    str(svc.get('text') or '').strip(),
                ) if part)
                if line:
                    svc_lines.append(line)
            if svc_lines:
                blocks.append(('When we gather', svc_lines))
        if contact.get('giving'):
            give_lines = [str(line or '').strip() for line in contact['giving']]
            give_lines = [line for line in give_lines if line]
            if give_lines:
                blocks.append(('Give towards the day', give_lines))
        if not blocks:
            blocks.append(('', ['Ask any of the officers at the door \u2014 they will help you find your way.']))

        def block_lines(size):
            out = []
            for label, texts in blocks:
                lines = []
                for text in texts:
                    lines.extend(wrap(text, 'Helvetica', size, w))
                out.append((label, lines))
            return out

        def contact_total(size, lead):
            return sum(16 + len(lines) * lead + 6 for _label, lines in block_lines(size))

        # The panel's shapes are chosen to fit: the largest text that keeps
        # the mission, the vision and the welcome from touching. Measured, not
        # hoped for — so a long week of gatherings shrinks the foot gracefully
        # instead of running it off the paper.
        chosen = (9, 11.5, 8.5, 10.5)
        for maybe in ((9, 11.5, 8.5, 10.5), (9, 11.5, 8, 9.5), (8.5, 10.5, 8, 9.5)):
            t_size, t_lead, c_size, c_lead = maybe
            mission_foot = block_h(PROGRAM_MISSION_STATEMENT, t_size, t_lead)
            vision_foot = block_h(PROGRAM_VISION_STATEMENT, t_size, t_lead)
            blocks_end = page_h - headroom - 26 - mission_foot - 26 - vision_foot
            budget = blocks_end - footroom
            if contact_total(c_size, c_lead) <= budget:
                chosen = maybe
                break
        t_size, t_lead, c_size, c_lead = chosen

        kicker_y = page_h - headroom - 8
        c.setFont('Helvetica-Bold', 7)
        c.setFillColor(EMBER)
        c.drawString(x, kicker_y, 'WHO WE ARE')
        c.setStrokeColor(RULE)
        c.setLineWidth(0.7)
        c.line(x, kicker_y - 4, x + w, kicker_y - 4)

        # The mission, first: open ink over the linen, its bar carrying the
        # day's accent easing into the lockup's gold.
        y = statement('OUR MISSION', PROGRAM_MISSION_STATEMENT, PROGRAM_MISSION_REF,
                      DARK, [ACCENT, GOLD], page_h - headroom - 26)
        # A gradient stroke marks the turn — the same stroke the cover draws
        # between the day's name and its date.
        wash(x + (w - 44) / 2, y - 13, 44, 2, [ACCENT, GOLD], horizontal=True)
        # The vision follows: the same measure, its own bar beneath it.
        y = statement('OUR VISION', PROGRAM_VISION_STATEMENT, PROGRAM_VISION_REF,
                      colors.HexColor('#3c4b44'), [ACCENT, GOLD], y - 26)

        # ── The welcome face, pinned to the fold's foot: where the church
        # stands, its week of worship, and how to give towards the day. A
        # blank is never made up; whatever the office has not written is left
        # off the paper. ──
        y = footroom + contact_total(c_size, c_lead) - 6
        for label, lines in block_lines(c_size):
            if label:
                c.setFont('Helvetica-Bold', 8)
                c.setFillColor(EMBER)
                c.drawString(x, y, label.upper())
            y -= 16
            c.setFont('Helvetica', c_size)
            c.setFillColor(DARK)
            for piece in lines:
                c.drawString(x, y, piece)
                y -= c_lead
            y -= 6

    def draw_row(c, x, y, row, lines):
        """Draw one row's lines, rule under it, and step to the next."""
        for text, font, size, colour, space in lines:
            c.setFont(font, size)
            c.setFillColor(colour)
            y -= size
            c.drawString(x, y, text)
            y -= space
        c.setStrokeColor(RULE)
        c.setLineWidth(0.4)
        c.line(x, y - 2, x + (panel_w - 2 * side - row['indent']), y - 2)
        return y - 8

    c = canvas.Canvas(buffer, pagesize=(page_w, page_h))
    for sheet_i, spread in enumerate(spreads):
        # The outside wears the paper's light: linen easing to white from
        # head to foot, one wash across the whole sheet.
        wash(0, 0, page_w, page_h, [LINEN, PLATE])
        # ── The sheet's outside: the church's welcome left, the cover right ──
        draw_back(c, 0)
        draw_cover(c, panel_w, sheet_i)
        fold_guides()
        c.showPage()
        # ── The inside spread: the order of service down both panels ──
        label = 'Order of Service' if sheet_i == 0 else 'Order of Service \u2013 continued'
        for col_i, column in enumerate(spread):
            x0 = col_i * panel_w
            c.setFont('Helvetica-Bold', 8)
            c.setFillColor(GREY)
            c.drawString(x0 + side, page_h - 26, label.upper())
            y = page_h - headroom
            for row, lines in column:
                y = draw_row(c, x0 + side + row['indent'], y, row, lines)
        fold_guides()
        c.showPage()
    c.save()
    buffer.seek(0)
    return buffer.getvalue()



def generate_duty_rota_pdf(church_name, rota_entries, start_date=None, end_date=None, search=None) -> bytes:
    """Generate a clean, printable duty rota schedule PDF aggregated for a period."""
    # Imported here rather than at the top: this module is loaded only when a
    # PDF is asked for, and the rota's own naming lives with the rota.
    from .duty import default_rota_title

    church_name = pdf_church_name(church_name)
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=1.5 * cm,
        leftMargin=1.5 * cm,
        topMargin=2 * cm,
        bottomMargin=2.2 * cm,
    )

    st = get_pdf_styles()
    story = []

    story.append(Paragraph("DUTY ROTA SCHEDULE", st["title_big"]))
    story.append(Paragraph(f"Generated: {datetime.now().strftime('%d %B %Y, %I:%M %p')}", st["meta"]))

    filter_parts = []
    if start_date and end_date:
        filter_parts.append(f"Period: {start_date} to {end_date}")
    elif start_date:
        filter_parts.append(f"From: {start_date}")
    elif end_date:
        filter_parts.append(f"Up to: {end_date}")
    else:
        filter_parts.append("Period: Full Schedule")

    if search:
        filter_parts.append(f"Filter: “{escape(search)}”")

    filter_parts.append(f"Total duties: {len(rota_entries)}")
    story.append(Paragraph(" · ".join(filter_parts), st["meta"]))
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#26352f")))
    story.append(Spacer(1, 10))

    if not rota_entries:
        story.append(Paragraph("No duty rota entries match this period.", st["cell"]))
    else:
        def fmt_d(val):
            text = str(val or "")
            if len(text) >= 10:
                try:
                    dt = datetime.strptime(text[:10], "%Y-%m-%d")
                    return dt.strftime("%d/%m/%Y")
                except Exception:
                    return text[:10]
            return text

        header = [
            Paragraph("#", st["header"]),
            Paragraph("Date &amp; Shift", st["header"]),
            Paragraph("Duty / Service", st["header"]),
            Paragraph("Assigned Officers &amp; Roles", st["header"]),
        ]
        table_data = [header]

        for idx, item in enumerate(rota_entries, 1):
            date_str = fmt_d(item.get("date") or item.get("duty_date"))
            shift_str = escape(str(item.get("shift") or "Time not set"))
            date_col = f"<b>{date_str}</b><br/><font color='#617068' size='8'>{shift_str}</font>"

            duty_type = escape(str(item.get("duty_type") or ""))
            # A line the desk left unnamed reads by its rota, not by a bare
            # "Duty". The part recorded stays on its own line below, so the
            # default fills the gap without repeating it.
            title = escape(str(item.get("title") or default_rota_title(item.get("desk"))))
            duty_col = f"<b>{title}</b>"
            if duty_type:
                duty_col += f"<br/><font color='#b36b3c' size='8'><b>{duty_type}</b></font>"
            notes = str(item.get("notes") or "").strip()
            if notes:
                duty_col += f"<br/><font color='#617068' size='7.5'><i>{escape(notes)}</i></font>"

            team = item.get("assigned_team") or []
            officers_lines = []
            for member in team:
                if isinstance(member, dict):
                    m_name = escape(str(member.get("name") or member.get("officer_name") or "Officer"))
                    m_role = escape(str(member.get("duty") or member.get("role") or ""))
                    m_phone = escape(str(member.get("phone") or ""))
                    line = f"• <b>{m_name}</b>"
                    sub = [s for s in (m_role, m_phone) if s]
                    if sub:
                        line += f" <font color='#617068'>({', '.join(sub)})</font>"
                    officers_lines.append(line)
                elif isinstance(member, str):
                    officers_lines.append(f"• {escape(member)}")

            team_col = "<br/>".join(officers_lines) if officers_lines else "<font color='#617068'><i>Nobody rostered yet</i></font>"

            table_data.append([
                Paragraph(str(idx), st["cell"]),
                Paragraph(date_col, st["cell"]),
                Paragraph(duty_col, st["cell"]),
                Paragraph(team_col, st["cell"]),
            ])

        table = Table(
            table_data,
            colWidths=[0.8 * cm, 3.2 * cm, 5.0 * cm, 9.0 * cm],
            repeatRows=1,
        )
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#26352f")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fbf9f5")]),
            ("LINEBELOW", (0, 0), (-1, -1), 0.5, colors.HexColor("#dfdbd1")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#c9c5bb")),
        ]))
        story.append(table)

    doc.build(story, canvasmaker=NumberedCanvas)
    buffer.seek(0)
    return buffer.getvalue()

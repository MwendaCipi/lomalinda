import functools
import io
import re
from decimal import Decimal
from datetime import datetime
from pathlib import Path
from django.utils import timezone
import qrcode
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    SimpleDocTemplate,
    BaseDocTemplate,
    Frame,
    PageTemplate,
    NextPageTemplate,
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
from reportlab.pdfbase.pdfmetrics import stringWidth
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


def date_compact(value):
    """A day the paper writes the way the church writes her dates: ddmmyyyy.

    The reports receive their window as ISO strings — ``YYYY-MM-DD`` — and
    other sheets as dates. Every display point passes through this one
    formatting, so a sheet never shows two different spellings of the same
    day — the dotted ``dd.mm.yyyy`` the summary once carried reads no more.
    """
    if hasattr(value, "strftime"):
        return value.strftime("%d%m%Y")
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").strftime("%d%m%Y")
    except Exception:
        return str(value)

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


def _draw_logo(c, center_x, top_y, height, line_2=_LOCKUP_LINE_2):
    """Draw the church's lockup — symbol and name — centred on `center_x`,
    its top edge at `top_y`, `height` tall.

    ``line_2`` is the second line of the name: every paper that is not a
    programme prints "Loma Linda, Meru", while a programme the congregation
    is handed says "Loma Linda" — the church the way the sheet's own reader
    says it.
    """
    sym_w = height * _SYMBOL_RATIO
    text_size = height * 0.40
    line_advance = text_size * 1.15
    c.saveState()
    c.setFont("Helvetica-Bold", text_size)
    line_1_w = c.stringWidth(_LOCKUP_LINE_1, "Helvetica-Bold", text_size)
    line_2_w = c.stringWidth(line_2, "Helvetica-Bold", text_size)
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
    c.drawString(text_x, baseline_1 - line_advance, line_2)
    c.restoreState()


class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, footer_text=_RECORD_FOOTER_TEXT, letterhead=None, verification_url=None, **kwargs):
        super().__init__(*args, **kwargs)
        self._footer_text = footer_text
        self._verification_url = verification_url
        # The church's uploaded letterhead, when the letters desk has created
        # one: drawn across the head of page 1 (see draw_page_decorations),
        # the paper's own mark standing in elsewhere and when there is none.
        self._letterhead = letterhead
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
        # Letterhead first: an uploaded head the letters desk created prints
        # across the head of page 1, with the letter's body starting beneath
        # it on the frame that reserved that room; the paper's own drawn mark
        # serves page 1 when none has been created and every page after.
        if self._letterhead and self._pageNumber == 1:
            head = _letterhead_geometry(self._letterhead)
            if head:
                head_w, head_h = head
                self.drawImage(
                    ImageReader(io.BytesIO(self._letterhead)),
                    (A4[0] - head_w) / 2,
                    A4[1] - _LETTERHEAD_TOP_GAP - head_h,
                    head_w,
                    head_h,
                )
            else:
                _draw_logo(self, A4[0] / 2, A4[1] - 0.7 * cm, 9 * mm)
        else:
            _draw_logo(self, A4[0] / 2, A4[1] - 0.7 * cm, 9 * mm)
        self.restoreState()
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#617068"))
        
        if self._footer_text:
            self.setStrokeColor(colors.HexColor("#dfdbd1"))
            self.setLineWidth(0.5)
            self.line(1.5 * cm, 1.8 * cm, A4[0] - 1.5 * cm, 1.8 * cm)
            self.drawString(1.5 * cm, 1.2 * cm, self._footer_text)
            self.drawRightString(A4[0] - 1.5 * cm, 1.2 * cm, f"Page {self._pageNumber} of {page_count}")
        self.restoreState()
        self._draw_verification_qr(page_count)

    def _draw_verification_qr(self, page_count, right_edge=None):
        """Place one scan-only authenticity mark in a signed letter's footer."""
        if not self._verification_url or self._pageNumber != page_count:
            return
        try:
            qr = qrcode.QRCode(version=None, box_size=6, border=1)
            qr.add_data(self._verification_url)
            qr.make(fit=True)
            image = qr.make_image(fill_color="black", back_color="white").convert("RGB")
            image_bytes = io.BytesIO()
            image.save(image_bytes, format="PNG")
            image_bytes.seek(0)
            size = 1.35 * cm
            x = (right_edge if right_edge is not None else A4[0] - 1.5 * cm) - size
            self.drawImage(ImageReader(image_bytes), x, 0.3 * cm, size, size, mask='auto')
        except Exception:
            # Verification adornment must never hold the signed paper back.
            pass


#: The head an uploaded letterhead may cover. The letters desk creates the
#: church's own head as an image; a very tall one cannot push the letter's
#: body halfway down the page, so whatever its ratio it prints no taller
#: than this — a wider head simply prints shorter.
_LETTERHEAD_MAX_HEIGHT = 4.5 * cm
_LETTERHEAD_TOP_GAP = 0.7 * cm
_LETTERHEAD_BODY_GAP = 0.4 * cm

# The church letter is a distinct paper: its office details sit in two quiet
# columns across the top, while the Adventist mark remains visible in the
# narrow band at the right.  Keeping this separate from the generic document
# lock-up prevents the short "SDA Church Loma Linda" header from leaking back
# into official correspondence.
_DEPARTMENT_LETTERHEAD_HEIGHT = 4.0 * cm
_DEPARTMENT_LETTER_STRIP_WIDTH = 2.65 * cm


class DepartmentLetterCanvas(NumberedCanvas):
    """Canvas for correspondence on the church's printed letter paper."""

    def draw_page_decorations(self, page_count):
        self.saveState()

        # The full-height right edge is intentionally retained on every page:
        # it is part of the church's stationery, not a decorative header that
        # disappears when a letter runs to a second page.
        strip_x = A4[0] - _DEPARTMENT_LETTER_STRIP_WIDTH
        self.setFillColor(colors.HexColor('#4CABC3'))
        self.rect(strip_x, 0, _DEPARTMENT_LETTER_STRIP_WIDTH, A4[1], fill=1, stroke=0)

        # A pale mark keeps the right strip recognisably Adventist while
        # remaining legible when the letter is printed in grayscale.
        logo_box = 2.55 * cm
        logo_x = strip_x + (_DEPARTMENT_LETTER_STRIP_WIDTH - logo_box) / 2
        logo_y = A4[1] - 5.2 * cm
        self.setFillColor(colors.white)
        self.rect(logo_x, logo_y, logo_box, logo_box, fill=1, stroke=0)
        symbol_h = 2.2 * cm
        symbol_scale = symbol_h / _SYMBOL_DRAWING.height
        self.saveState()
        self.translate(strip_x + (_DEPARTMENT_LETTER_STRIP_WIDTH - _SYMBOL_DRAWING.width * symbol_scale) / 2, logo_y + (logo_box - symbol_h) / 2)
        self.scale(symbol_scale, symbol_scale)
        _SYMBOL_DRAWING.drawOn(self, 0, 0)
        self.restoreState()

        if self._pageNumber == 1:
            left_x = 1.05 * cm
            right_x = 12.1 * cm
            top = A4[1] - 1.25 * cm
            self.setFillColor(colors.HexColor('#2E8BA6'))
            self.setFont('Times-Bold', 15.2)
            for offset, line in enumerate((
                'SEVENTH DAY ADVENTIST CHURCH',
                'LOMA LINDA',
                'NORTH EAST KENYA FIELD',
            )):
                self.drawString(left_x, top - offset * 6.15 * mm, line)
            for offset, line in enumerate((
                'P.O BOX 1373-60200',
                'MERU-KENYA',
            )):
                self.drawString(right_x, top - offset * 6.15 * mm, line)
            self.setFillColor(colors.blue)
            self.setFont('Times-Bold', 10.6)
            self.drawString(right_x + 0.12 * cm, top - 2 * 6.15 * mm, 'TEL:0708069827/0711340087')
            self.setFillColor(colors.HexColor('#2E8BA6'))
            self.setFont('Times-Bold', 10.6)
            self.drawString(right_x - 0.45 * cm, top - 3 * 6.15 * mm, 'EMAIL: info@sdalomalinda.or.ke')

        self.restoreState()
        self.saveState()
        if self._footer_text:
            self.setFont('Helvetica', 8)
            self.setFillColor(colors.HexColor('#617068'))
            self.setStrokeColor(colors.HexColor('#dfdbd1'))
            self.setLineWidth(0.5)
            self.line(1.5 * cm, 1.8 * cm, strip_x - 0.35 * cm, 1.8 * cm)
            self.drawString(1.5 * cm, 1.2 * cm, self._footer_text)
            self.drawRightString(strip_x - 0.35 * cm, 1.2 * cm, f'Page {self._pageNumber} of {page_count}')
        self.restoreState()
        self._draw_verification_qr(page_count, right_edge=strip_x - 0.35 * cm)


def _letterhead_geometry(image):
    """An uploaded letterhead's print box for the letter page, or ``None``.

    Answers ``(width, height)`` for drawing the image across the head of the
    first page — full content width, capped in height. ``None`` when there is
    no letterhead, or its bytes cannot be opened (a missing file under the
    media root, a payload that is not an image): the paper then keeps the
    church's own drawn mark rather than failing the letter.
    """
    if not image:
        return None
    try:
        dims = ImageReader(io.BytesIO(image)).getSize()
        image_w, image_h = float(dims[0]), float(dims[1])
    except Exception:
        return None
    if image_w <= 0 or image_h <= 0:
        return None
    left_margin = right_margin = 1.8 * cm
    avail_w = A4[0] - left_margin - right_margin
    height = min(avail_w * image_h / image_w, _LETTERHEAD_MAX_HEIGHT)
    width = height * image_w / image_h
    return width, height


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

    The treasurer's pen alone (an elder's throws in when the treasurer's
    seat proves empty). When one signature is provided it is centred
    horizontally on the receipt with generous breathing space; two sit in
    two columns.
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

    The app stores the short form ("SDA Church Loma Linda, Meru") for screens,
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
    # A caller that did not read the signing offices itself still prints them:
    # the report checks what is actually on file, so every shape of the report
    # — viewed or generated directly — carries the signatures it has.
    if signatures is None:
        from .signatures import report_signatures
        signatures = report_signatures()
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

    def signature_cell(heading, entry, fallback):
        """One signature cell: the named officer, their signature on the line,
        or the blank rules the cell has always kept when nobody has signed.

        The upload is checked, not assumed — a holder who has not signed yet,
        or whose file has gone missing, leaves their ruled line as it was.
        """
        entry = entry or {}
        cell = [Paragraph(heading, st["cell"])]
        if entry.get("name"):
            cell.append(Paragraph(f"Name: <b>{escape(entry['name'])}</b>", st["cell"]))
        else:
            cell.append(Paragraph(fallback, st["cell"]))
        image = _signature_flowable(entry.get("image"), 4.8 * cm, 1.3 * cm)
        # One fixed-height signing slot for every office: an uploaded pen
        # prints inside it, an office still unsigning keeps its ruled line in
        # it — so the signing space reads the same on the row whether the
        # report is printed before or after the officers have signed, and it
        # always holds a passage of pen worth the name it signs.
        slot_table = Table(
            [[image if image else Paragraph("Signature: _______________", st["cell"])]],
            colWidths=[5.2 * cm],
            rowHeights=[1.7 * cm],
        )
        slot_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 1),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ]))
        cell.append(slot_table)
        return cell

    # The office signatures, read once for both of the report's shapes: the
    # treasurer prepares, the head deacon witnesses, and the first elder
    # verifies (see members/signatures.py).
    offices = signatures or {}

    total_val = totals.get("total", 0)
    cash_val = totals.get("cash", 0)
    mpesa_val = totals.get("mpesa", 0)
    bank_transfer_val = totals.get("bank_transfer", 0)
    cheque_val = totals.get("cheque", 0)
    digital_val = float(mpesa_val) + float(bank_transfer_val) + float(cheque_val)

    if is_individual:
        # Dedicated Church Givings Report
        if purpose_title:
            subtitle_text = f"CHURCH GIVINGS REPORT - {purpose_title.upper()}"
        else:
            subtitle_text = f"CHURCH GIVINGS REPORT FROM {date_compact(start_date)} TO {date_compact(end_date)}"
        story.append(Paragraph(subtitle_text, st["title_big"]))
        if start_date == end_date:
            date_str = f"Date: {date_compact(start_date)}"
        else:
            date_str = f"Period: {date_compact(start_date)} to {date_compact(end_date)}"
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

        ind_headers = ["Giver Name", "Date", "Account", "Mode", "Receipt / Ref", "Amount (KES)"]
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
            mode = (g.get("payment_method") or "cash").upper()
            amt_val = g.get("amount", 0)
            amt_str = format_money(amt_val)

            ind_data.append([
                Paragraph(str(donor), st["cell_bold"]),
                Paragraph(str(g.get("date", "")), st["cell"]),
                Paragraph(str(g.get("purpose_name", "")), st["cell"]),
                Paragraph(mode, st["cell"]),
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

        # M-Pesa references are ten characters and must stay readable at a
        # glance. Give Receipt / Ref a little more room by taking only a
        # modest amount from the wrapping Giver Name and Account columns.
        ind_table = Table(ind_data, colWidths=[4.25 * cm, 2.3 * cm, 3.8 * cm, 2.2 * cm, 3.05 * cm, 2.4 * cm], repeatRows=1)
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

        # The sign-off block names the four offices the report answers to —
        # prepared by the Treasurer, witnessed by the Head Deacon, verified by
        # the Elder, and countersigned by the Pastor, as every paper answers
        # to the pastor — and checks the saved signatures too: each office's
        # uploaded pen prints on its line, the same way the summary's sign-off
        # does, and the rules stand where an office has no signature on file
        # yet.
        sig_data = [[
            signature_cell("<b>Prepared by: Treasurer</b>", offices.get("treasurer"), "Name: ______________________"),
            signature_cell("<b>Witnessed by: Head Deacon</b>", offices.get("head_deacon"), "Name: ______________________"),
            signature_cell("<b>Verified by: Elder</b>", offices.get("first_elder"), "Name: ______________________"),
            signature_cell("<b>Countersigned by: Pastor</b>", offices.get("pastor"), "Name: ______________________"),
        ]]
        sig_table = Table(sig_data, colWidths=[4.5 * cm, 4.5 * cm, 4.5 * cm, 4.5 * cm])
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
        end_date_str = dt_end.strftime("%d%m%Y")
    except Exception:
        end_date_str = end_date

    story.append(Paragraph(
        f"CASH COUNT AND OFFERING REPORT SUMMARY FROM {date_compact(start_date)} TO {date_compact(end_date)}",
        st["title_big"],
    ))
    meta_text = f"Name of Church: {church_name}"
    meta_text += f" &nbsp;&nbsp;|&nbsp;&nbsp; Field: {field_name or 'North East Kenya Field'}"
    if district:
        meta_text += f" &nbsp;&nbsp;|&nbsp;&nbsp; District: {district}"
    if start_date == end_date:
        meta_text += f" &nbsp;&nbsp;|&nbsp;&nbsp; Date: {date_compact(start_date)}"
    else:
        meta_text += f" &nbsp;&nbsp;|&nbsp;&nbsp; Period: {date_compact(start_date)} to {date_compact(end_date)}"
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
    week_labels = [saturdays[i].strftime('%d%m%Y') if i < num_weeks else 'NA' for i in range(5)]

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

    # Row: Bank Deposit — the NEKF sheet's own wording for the bank column.
    bank_row = [Paragraph('Bank Deposit', st["cell"])]
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

    # --- Signatures: Treasurer, Deacon, Elder, Pastor ---
    # The deacon's line reads the head deacon's own signature: passing no
    # office left the cell blank even after the deacon had signed, so the
    # sheet that arrives at the field was missing a pen the church holds.
    sig_data = [[
        signature_cell("<b>Signed By:</b> Treasurer", offices.get("treasurer"), "Name: ______________________"),
        signature_cell("Deacon", offices.get("head_deacon"), "Name: ______________________"),
        signature_cell("Elder", offices.get("first_elder"), "Name: ______________________"),
        signature_cell("<b>Countersigned by: Pastor</b>", offices.get("pastor"), "Name: ______________________"),
    ]]
    sig_table = Table(sig_data, colWidths=[4.5 * cm, 4.5 * cm, 4.5 * cm, 4.5 * cm])
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
        # The sheet names this fund by its short form, as the account is
        # kept: LCB.
        ("LCB", ['local church budget', 'lcb']),
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

    # A week holds a purpose's four payment buckets and no total of its own
    # (only the month-wide map carries one), so asking a week for its 'total'
    # answered 0 and the whole Offering Summary read empty. Sum the buckets
    # the way the spreadsheet's page does, and fold the purposes' spellings
    # — 'CampOffering' keys as it arrived; the row is read 'Camp Offering' —
    # so one fund does not fall through the rows because of its spacing.
    PAYMENT_BUCKETS = ('mpesa', 'bank_transfer', 'cheque', 'cash')

    def _folded(name):
        return ''.join(str(name or '').lower().split())

    def _purpose_total(buckets):
        return sum(float(buckets.get(b, 0) or 0) for b in PAYMENT_BUCKETS)

    def _fold_matches(key, names):
        folded = _folded(key)
        return any(folded == _folded(name) for name in names)

    def _get_week_sum(sat, names):
        if not sat or not weekly_data:
            return 0.0
        wp = weekly_data.get(sat, {})
        return sum(_purpose_total(v) for k, v in wp.items() if _fold_matches(k, names))

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
                w_amt = sum(_purpose_total(v) for k, v in wp.items() if not _fold_matches(k, claimed_lower))
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
    # The local table and the two totals that answer it travel as one block,
    # so a page break never leaves the totals on a sheet of their own with the
    # rows they add up behind them.
    local_block = [local_table, Spacer(1, 10)]

    # --- Total Offering (with weekly columns) ---
    grand_offering = trust_total + local_total
    # The row prints white on the sheet's dark band. A table's TEXTCOLOR does
    # not reach a Paragraph — the paragraph carries its own — so the grey of
    # the cell style left this row unreadable on the dark ground, and the
    # Total Offering line printed as an empty green band.
    white_bold = ParagraphStyle(
        "WhiteBold", parent=st["cell_bold"], textColor=colors.white
    )
    white_right_bold = ParagraphStyle(
        "WhiteRightBold", parent=st["cell_right_bold"], textColor=colors.white
    )
    total_header = [Paragraph('Total Offering', white_bold)]
    for i in range(5):
        total_header.append(Paragraph(format_money(week_trust[i] + week_local[i]), white_right_bold))
    total_header.append(Paragraph(format_money(grand_offering), white_right_bold))
    total_off = Table([total_header], colWidths=[3.5 * cm] + [2.8 * cm] * 5 + [3.0 * cm])
    total_off.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#26352f")), ("TEXTCOLOR", (0, 0), (-1, -1), colors.white), ("ALIGN", (1, 0), (-1, -1), "RIGHT"), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6), ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#26352f"))]))
    local_block.extend([total_off, Spacer(1, 10)])

    # --- Total Remittance to NEKF ---
    remit_header = [Paragraph('<b>Total remittance to SDA CHURCH NEKF KSH</b>', st["cell_bold"])]
    for i in range(5):
        remit_header.append(Paragraph(format_money(week_trust[i]), st["cell_right_bold"]))
    remit_header.append(Paragraph(format_money(trust_total), st["cell_right_bold"]))
    remit = Table([remit_header], colWidths=[3.5 * cm] + [2.8 * cm] * 5 + [3.0 * cm])
    remit.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f7f4ee")), ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#dfdbd1")), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    local_block.append(remit)
    story.append(KeepTogether(local_block))
    story.append(Spacer(1, 12))

    # --- Deposit Slips ---
    story.append(Paragraph("<b>Deposit Slips</b>", st["h2"]))
    dep = Table([[Paragraph("#", st["header"]), Paragraph("Date", st["header"]), Paragraph("Amount (KES)", st["header_right"])], [Paragraph("1", st["cell"]), Paragraph(end_date_str, st["cell"]), Paragraph("0.00", st["cell_right"])], [Paragraph("2", st["cell"]), Paragraph(end_date_str, st["cell"]), Paragraph("0.00", st["cell_right"])], [Paragraph("<b>Total</b>", st["cell_bold"]), Paragraph("", st["cell"]), Paragraph("0.00", st["cell_right_bold"])]], colWidths=[3.0 * cm, 7.0 * cm, 8.0 * cm])
    dep.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#26352f")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("ALIGN", (2, 0), (2, -1), "RIGHT"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("BOTTOMPADDING", (0, 0), (-1, -1), 5), ("TOPPADDING", (0, 0), (-1, -1), 5), ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dfdbd1")), ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#26352f")), ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f7f4ee"))]))
    story.append(dep)
    story.append(Spacer(1, 12))

    # --- Presented by / Treasurer / Church Pastor ---
    # The sheet's own foot, row for row: who presents the report, the
    # treasurer's office with the Mobile No line beneath it, then the
    # pastor's countersign. The Mobile No line used to be left out, which is
    # the one line of the workbook this page never printed.
    final_sig = [
        [
            Paragraph("<b>Presented by</b><br/><br/>Name: ________________________", st["cell"]),
            Paragraph("Treasurer<br/>Mobile No: ____________", st["cell"]),
            Paragraph(f"Sign: ________________________<br/><br/>{end_date_str}", st["cell"]),
        ],
        [
            Paragraph("<b>Church Pastor</b><br/><br/>Name: ________________________", st["cell"]),
            Paragraph("", st["cell"]),
            Paragraph(f"Sign: ________________________<br/><br/>{end_date_str}", st["cell"]),
        ],
    ]
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
            Paragraph(f"<b>Statement Period:</b> {date_compact(start_date)} to {date_compact(end_date)}<br/><b>Date Issued:</b> {datetime.now().strftime('%d%m%Y')}", st["cell"]),
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

    # The statement is the treasurer's word to the member, countersigned by
    # the pastor as every paper the church prints answers to the pastor: both
    # saved signatures on their lines.
    treasurer = (signatures or {}).get("treasurer") or {}
    pastor = (signatures or {}).get("pastor") or {}
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
    pastor_name_line = (
        f"<b>Church Pastor Name:</b> {escape(pastor['name'])}"
        if pastor.get("name")
        else "<b>Church Pastor Name:</b> ___________________________"
    )
    pastor_cell = [Paragraph(pastor_name_line, st["cell"])]
    pastor_image = _signature_flowable(pastor.get("image"), 5.2 * cm, 1.0 * cm)
    if pastor_image:
        pastor_cell.extend([Paragraph("<b>Signature:</b>", st["cell"]), pastor_image])
    else:
        pastor_cell.append(Paragraph("<b>Signature:</b> ___________________________", st["cell"]))
    sign_data = [
        [treasurer_cell, pastor_cell],
        [Paragraph(f"<b>Date:</b> {datetime.now().strftime('%d%m%Y')}", st["cell"]), Paragraph("", st["cell"])],
    ]
    sign_table = Table(sign_data, colWidths=[9.0 * cm, 9.0 * cm])
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
    generated_date = datetime.now().strftime("%d%m%Y, %I:%M %p")
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
    date_str = payment_dt.strftime("%d%m%Y %H:%M") if payment_dt else ""
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
    line_out(f"Issued {issued_eat.strftime('%d%m%Y %H:%M')}", "Helvetica", 6.5, "center", gap=2)
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
    The signature at the foot is the same single office as the money slip.
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
    line_out(f"Received on: {received_on.strftime('%d%m%Y')}")
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
    line_out(f"Issued {issued_eat.strftime('%d%m%Y %H:%M')}", "Helvetica", 6.5, "center", gap=2)
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

    The statement is signed at its foot: the treasurer who prepared it, the
    first elder who authorises it, and the pastor's countersignature every
    paper carries — their saved signatures on the lines.
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
        f"{report.period_start.strftime('%d%m%Y')} – "
        f"{report.period_end.strftime('%d%m%Y')}"
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
            f"<b>Prepared:</b> {report.created_at.strftime('%d%m%Y')}",
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
    #: paper's four: authorised, issued, received, and the pastor whose pen
    #: answers on every paper the church prints.
    SLOTS = (
        ('first_elder', "Authorizing Officer", "Elder / Church Office"),
        ('treasurer', "Issued By", "Treasury Office"),
        (None, "Received By", "Department Representative"),
        ('pastor', "Countersigned By", "Church Pastor"),
    )

    #: A financial statement answers to three offices: prepared, authorised,
    #: and the pastor's countersignature every paper carries.
    STATEMENT_SLOTS = (
        ('treasurer', "Prepared By", "Treasury Office"),
        ('first_elder', "Authorizing Officer", "Church Office"),
        ('pastor', "Countersigned By", "Church Pastor"),
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
    story.append(Paragraph(f"Generated: {datetime.now().strftime('%d%m%Y, %I:%M %p')}", st["meta"]))
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
            "pastor_approved": "Pastor Approved",
            "approved": "Approved",
            "declined": "Rejected",
            "reversed": "Reversed",
        }

        def fmt_date(value):
            if hasattr(value, "strftime"):
                return value.strftime("%d%m%Y")
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
            details.append(f"Asked by {escape(str(row.get('requested_by') or '—'))}")
            # Each office's own approval, named as the office's approval, in
            # the order they are given — the elder's blessing first, then the
            # pastor's approval, then the treasurer who released the money.
            if row.get("elder_approved_by"):
                # The office's phrase reads on its own line and the officer's
                # name starts the next: the cell is only ~40 characters wide,
                # so one long line would break the name across two.
                details.append("Elder's Approval: Approved by")
                details.append(escape(str(row["elder_approved_by"])))
            if row.get("pastor_approved_by"):
                details.append("Pastor's Approval: Approved by")
                details.append(escape(str(row["pastor_approved_by"])))
            if row.get("decided_by") and row.get("status") in ("approved", "declined"):
                verdict = "Approved" if row["status"] == "approved" else "Rejected"
                details.append(f"Treasurer's Approval: {verdict} by")
                decided = escape(str(row["decided_by"]))
                if row.get("reply"):
                    decided += f" — “{escape(str(row['reply']))}”"
                details.append(decided)
            # The balance reads last: it is the figure the whole request
            # ends on — what the fund holds once the row has been read.
            details.append(f"Bal: KES {format_money(row.get('account_balance'))}")
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
    it. It closes with the four signature slots — the authorizing officer,
    the one issuing, the receiver, and the pastor's countersignature.
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
        f"Request #{row.get('id')} · Printed {datetime.now().strftime('%d%m%Y, %I:%M %p')}",
        st["meta"],
    ))
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#26352f")))
    story.append(Spacer(1, 12))

    status_names = {
        "pending": "Pending",
        "elder_approved": "Elder Approved",
        "pastor_approved": "Pastor Approved",
        "approved": "Approved",
        "declined": "Rejected",
        "reversed": "Reversed",
    }

    def fmt_date(value):
        if hasattr(value, "strftime"):
            return value.strftime("%d%m%Y")
        text = str(value or "")
        return f"{text[8:10]}/{text[5:7]}/{text[0:4]}" if len(text) >= 10 else text

    amount = Decimal(str(row.get("amount") or "0"))
    balance = Decimal(str(row.get("account_balance") or "0"))

    pastor_line = "—"
    if row.get("pastor_approved_by"):
        pastor_line = str(row["pastor_approved_by"])
        if row.get("pastor_approved_at"):
            pastor_line += f" · {fmt_date(row['pastor_approved_at'])}"

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
             # The right-hand column reads down the order the clearances are
             # given: the elder's blessing, the pastor's approval after it,
             # then the treasurer who released the money.
             label("Elder Approval"), value(escape(elder_line))],
            [label("Purpose"), value(escape(str(row.get("reason") or "—"))),
             label("Pastor Approval"), value(escape(pastor_line))],
            [label(""), value(""),
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


# This is a complete replacement of the generate_department_letter_pdf function
# It implements all the requested changes:
# 1. Remove the three address lines - only keep the address as provided
# 2. Make date and address share the same row in PC modal
# 3. Remove ref - only subject title remains
# 4. Remove greeting and closing and signatures
# 5. Add QR code at bottom if both pastor and clerk signed

def generate_department_letter_pdf(
    letter_record, church_name: str, pastor_sig=None, clerk_sig=None,
    letterhead=None, verification_url=None,
) -> bytes:
    """The official department letter / requisition on church letterhead.
    
    Carries:
      - Loma Linda SDA letterhead and title
      - Department & Requester info header
      - Letter Title (RE: ...)
      - Letter Body formatted formally
    ``letterhead`` is the church's own letterhead as image bytes
    """
    from reportlab.lib.utils import ImageReader
    from reportlab.platypus import (BaseDocTemplate, NextPageTemplate, SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
                                    PageTemplate as RLPageTemplate, Frame as RLFrame)
    from reportlab.lib import colors
    from reportlab.lib.units import cm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT
    from reportlab.pdfbase import pdfmetrics
    import io
    from datetime import datetime
    from django.conf import settings
    from xml.sax.saxutils import escape
    
    church_name = church_name  # already resolved
    
    buffer = io.BytesIO()
    head = _letterhead_geometry(letterhead)

    # A clerk may still choose a fully designed image letterhead through the
    # existing Letters desk.  In its absence, every official letter uses the
    # prescribed stationery reproduced from the supplied church sample.
    if head:
        head_w, head_h = head
        doc = BaseDocTemplate(buffer, pagesize=(21 * cm, 29.7 * cm))
        body_bottom = 2.2 * cm
        body_left = 1.8 * cm
        body_w = 21 * cm - body_left - 1.8 * cm
        first_top = 29.7 * cm - _LETTERHEAD_TOP_GAP - head_h - _LETTERHEAD_BODY_GAP
        later_top = 29.7 * cm - 2.0 * cm
        doc.addPageTemplates([
            RLPageTemplate('letterhead', [RLFrame(
                body_left, body_bottom, body_w, first_top - body_bottom,
                leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
            )]),
            RLPageTemplate('later', [RLFrame(
                body_left, body_bottom, body_w, later_top - body_bottom,
                leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
            )]),
        ])
    else:
        # The stock letterhead's right-hand strip needs a clear gutter, and
        # page one reserves room for its two columns of office details.
        doc = BaseDocTemplate(buffer, pagesize=(21 * cm, 29.7 * cm))
        body_bottom = 2.2 * cm
        body_left = 1.8 * cm
        strip_left = 21 * cm - _DEPARTMENT_LETTER_STRIP_WIDTH
        body_w = strip_left - 0.45 * cm - body_left
        first_top = 29.7 * cm - _DEPARTMENT_LETTERHEAD_HEIGHT - 0.35 * cm
        later_top = 29.7 * cm - 1.15 * cm
        doc.addPageTemplates([
            RLPageTemplate('letterhead', [RLFrame(
                body_left, body_bottom, body_w, first_top - body_bottom,
                leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
            )]),
            RLPageTemplate('later', [RLFrame(
                body_left, body_bottom, body_w, later_top - body_bottom,
                leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
            )]),
        ])
    
    st = getSampleStyleSheet()
    
    # Build styles used in this function
    styles_map = {
        "title_big": ParagraphStyle(
            "LetterTitleBig",
            parent=st["Heading1"],
            fontSize=16,
            leading=20,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#26352f"),
            spaceAfter=6,
        ),
        "meta": ParagraphStyle(
            "LetterMeta",
            parent=st["BodyText"],
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#1f2937"),
        ),
        "cell": ParagraphStyle(
            "LetterCell",
            parent=st["BodyText"],
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#1f2937"),
        ),
        "cell_bold": ParagraphStyle(
            "LetterCellBold",
            parent=st["BodyText"],
            fontSize=10,
            leading=14,
            fontName="Helvetica-Bold",
            textColor=colors.HexColor("#1f2937"),
        ),
    }
    
    story = []
    
    # The paper follows the template as written: the date on its own line,
    # the standard salutation, the receiving church's address beneath it, the
    # subject written into the REF line it occupies, then the body — and the
    # closing with the two pens' spaces after it (below).
    letter_date = str(letter_record.get("letter_date") or "").strip()
    if letter_date:
        date_str = letter_date
    else:
        created_date = letter_record.get("created_at")
        if hasattr(created_date, "strftime"):
            date_str = created_date.strftime("%d%m%Y")
        elif created_date:
            date_str = str(created_date)[:10]
        else:
            date_str = timezone.localtime(timezone.now()).strftime("%d%m%Y")

    address_text = str(letter_record.get("recipient_address") or "").strip()

    addr_style = ParagraphStyle(
        "LetterAddr", parent=st["BodyText"],
        fontSize=10, leading=14, textColor=colors.HexColor("#1f2937"),
    )

    # The date, alone on its first line, then the salutation, then the
    # recipient set out as the template writes it: their name, postal address
    # and town.  The phone and email remain on the request for the clerk to
    # use when delivering the letter; they are not part of the correspondence.
    story.append(Paragraph(escape(date_str), addr_style))
    story.append(Spacer(1, 8))
    # The salutation every letter of this kind carries.
    story.append(Paragraph("To the Pastor/ Church clerk,", addr_style))
    recipient_lines = [
        str(line or "").strip()
        for line in (
            letter_record.get("recipient_name"),
            address_text,
            letter_record.get("recipient_town"),
        )
        if str(line or "").strip()
    ]
    # An address is read as a sequence of address lines, not one run-on
    # phrase: the name and postal line keep their commas, with the town
    # closing the block.  Strip only a trailing comma first so an already
    # punctuated entry never prints a doubled one.
    recipient_lines = [
        f"{line.rstrip().rstrip(',')}," if index < len(recipient_lines) - 1 else line
        for index, line in enumerate(recipient_lines)
    ]
    if recipient_lines:
        story.append(Paragraph(escape("\n".join(recipient_lines)).replace("\n", "<br />"), addr_style))
    story.append(Spacer(1, 8))
    
    # The subject fills the REF line: what the writer titles the letter is
    # what the paper references it by.
    title_text = str(letter_record.get("title") or "Letter").strip()
    subject_style = ParagraphStyle(
        "LetterSubject", parent=styles_map["cell_bold"],
        fontName="Helvetica-Bold", fontSize=11, leading=15,
        textColor=colors.black, spaceAfter=10,
    )
    story.append(Paragraph(f"<u>REF: {escape(title_text).upper()}</u>", subject_style))
    story.append(Spacer(1, 2))
    
    # Letter body — the writer's own paragraphs, from the left margin.
    body_style = ParagraphStyle(
        "LetterBody", parent=addr_style,
        fontSize=10.5, leading=16, spaceAfter=2,
    )
    content_raw = str(letter_record.get("content") or "").strip()
    paragraphs = content_raw.split("\n\n") if "\n\n" in content_raw else content_raw.split("\n")
    for raw in paragraphs:
        cleaned = raw.strip()
        if not cleaned:
            continue
        lowered = cleaned.lower()
        # Lines the template once composed by hand stay out of the body:
        # the paper now draws them in the places it reserves.
        if lowered in (
            "kind regards,", "yours sincerely,", "yours faithfully,", "sincerely,",
        ) or lowered in ("to the pastor/ church clerk,",):
            continue
        if re.match(r'^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$', cleaned):
            continue
        story.append(Paragraph(escape(cleaned).replace("\n", "<br />"), body_style))
        story.append(Spacer(1, 6))
    
    # The closing, then the two pens beneath it: the clerk signs on the
    # left, the pastor on the right — a saved pen prints its image, and a
    # pen not yet saved leaves the paper's own space for the hand.
    story.append(Spacer(1, 18))
    story.append(Paragraph("Kind regards,", addr_style))
    story.append(Spacer(1, 10))
    
    from reportlab.platypus import Image as RLImage
    from reportlab.lib.utils import ImageReader as _IR
    
    def pen_column(entry):
        entry = entry or {}
        col = []
        # The name first, the way the template lays it out; the pen space
        # runs between name and role, so a hand signs under the name it
        # belongs to and above the office it signs as. The pastor's pen
        # carries the ministry's own courtesy title, as the template writes
        # it — "Pr. George Mwenda" — unless the name already wears one.
        name = str(entry.get("name") or "").strip()
        office_title = str(entry.get("office") or "").strip()
        if name and "pastor" in office_title.lower() and not name.lower().startswith(("pr.", "pastor")):
            name = f"Pr. {name}"
        if name:
            col.append(Paragraph(escape(name), addr_style))
        image_bytes = entry.get("image")
        if image_bytes:
            try:
                reader = _IR(io.BytesIO(image_bytes))
                iw, ih = reader.getSize()
                scale = min((3.4 * cm) / iw, (1.6 * cm) / ih, 1.0)
                col.append(RLImage(reader, width=iw * scale, height=ih * scale))
            except Exception:
                col.append(Spacer(1, 1.6 * cm))
        else:
            col.append(Spacer(1, 1.6 * cm))
        office = office_title or "Signatory"
        col.append(Paragraph(escape(office), addr_style))
        # The office's own number beneath its title, the way the template's
        # sign-off does — a reader who needs to raise the office has it there.
        phone = str(entry.get("phone") or "").strip()
        if phone:
            col.append(Paragraph(escape(phone), addr_style))
        return col
    
    pen_row = Table(
        [[pen_column(clerk_sig), pen_column(pastor_sig)]],
        # The stationery strip is a protected right gutter, so the two pen
        # columns share the remaining writing measure rather than running
        # beneath the mark.
        colWidths=[body_w / 2, body_w / 2],
        hAlign="LEFT",
    )
    pen_row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(pen_row)
    
    # Build the PDF
    # Continue overflowing content in the page-two frame.
    story.insert(0, NextPageTemplate('later'))
    canvas_class = NumberedCanvas if head else DepartmentLetterCanvas
    doc.build(
        story,
        canvasmaker=functools.partial(
            canvas_class,
            footer_text='',
            verification_url=verification_url,
        ),
    )
    
    buffer.seek(0)
    result = buffer.getvalue()
    buffer.close()
    return result
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
    """Two hours the way a programme prints them: each end carries its own
    meridiem, so a run that crosses midday reads straight — ``8:00 AM - 12:00 PM``
    — and no reader is left carrying the first half of the day. An hourless
    entry prints as the one hour it carries, or nothing at all."""
    first, second = _spoken_hour(start), _spoken_hour(end)
    if first and second:
        return f'{first} - {second}'
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

#: The measure both of a programme's papers give the hour: a column of its
#: own at the row's left edge, wide enough for the widest range a day can
#: say — both ends of a run carrying their own meridiem, ``11:00 AM -
#: 12:00 PM``. Every name begins where the column ends — so the names run
#: down the page in one line, and the people carrying a row sit level with
#: that row's own name instead of hanging wherever its hour happened to stop.
PROGRAM_TIME_COL = 128

#: The air left between the hour and the name it opens.
PROGRAM_TIME_GAP = 8

#: How much farther a facilitator's line sits in from the name that carries
#: the row: the people under a session or activity read a step in from it,
#: on both of a programme's papers. The step is taken off the line's own
#: width — never off the hour's column, and nothing on the page pushed out
#: left — so the names keep the level they were set at.
PROGRAM_PEOPLE_INDENT = 14

#: The ink a role is written in — the one part of a row allowed to say
#: what it says more quietly than the name beside it.
PROGRAM_ROLE_COLOUR = colors.HexColor('#93a09a')


def _draw_qr(c, url, x, y, size):
    """A QR code drawn as vector ink at (x, y), ``size`` points on the side.

    The giving QR needs no new dependency: reportlab ships its own QR widget,
    scaled here from the widget's own bounds so the matrix stays square at
    whatever paper size it is asked for. A white pad rides behind it, so a
    panel drawn over a wash still reads as clean black-on-white to a camera.
    """
    try:
        from reportlab.graphics import renderPDF
        from reportlab.graphics.barcode.qr import QrCodeWidget
        from reportlab.graphics.shapes import Drawing
    except Exception:
        return
    widget = QrCodeWidget(url, barLevel='M')
    x0, y0, x1, y1 = widget.getBounds()
    scale_x, scale_y = size / (x1 - x0), size / (y1 - y0)
    c.setFillColor(colors.white)
    c.rect(x - 2, y - 2, size + 4, size + 4, fill=1, stroke=0)
    # The position rides the drawing's own transform, not the draw offset:
    # the widget's bounds are mapped onto the (x, y, size, size) square.
    drawing = Drawing(size, size, transform=[scale_x, 0, 0, scale_y, x - x0 * scale_x, y - y0 * scale_y])
    drawing.add(widget)
    renderPDF.draw(drawing, c, 0, 0)


#: The church's name on a programme sheet: no town after it. The treasury's
#: papers and the site's screens keep "SDA Church Loma Linda, Meru"; the
#: sheet handed out at the door reads "SDA Church Loma Linda".
_PROGRAM_LOCKUP_LINE_2 = "Loma Linda"


def _program_department_name(code, name):
    """The ministry as a programme names it.

    The desk files its choir as "Church Choir"; the sheet the congregation
    is handed calls it The Loma Linda Ensemble. Every other ministry prints
    the name its own desk gave it.
    """
    if str(code or "").strip().lower() == "choir":
        return "The Loma Linda Ensemble"
    return name


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
        # A free-text block — a song, a Bible verse — the resource session
        # carries as text lines rather than as activities. Each typed line
        # reads as its own row, the way the verse is laid on the paper —
        # and the spacing the desk pressed is carried with it: a run of
        # blank lines travels as a gap before the line that follows, so
        # both papers read it. The block's own head and tail of blank
        # lines are trimmed, so it opens on ink and closes on ink.
        text_lines = str(session.get('text') or '').replace('\r\n', '\n').split('\n')
        text_lines = [line.rstrip() for line in text_lines]
        while text_lines and not text_lines[0].strip():
            text_lines.pop(0)
        while text_lines and not text_lines[-1].strip():
            text_lines.pop()
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
        if not title and not session_people and not children and not text_lines:
            continue
        rows.append({
            'hours': _spoken_range(session.get('start'), session.get('end')),
            'title': title,
            'people': session_people,
            'indent': 0,
        })
        rows.extend(children)
        pending_gap = 0
        for line in text_lines:
            if not line.strip():
                pending_gap += 1
                continue
            rows.append({
                'hours': '',
                'title': line,
                'people': [],
                'indent': INDENT,
                'gap': pending_gap,
            })
            pending_gap = 0

    if not rows:
        rows.append({'hours': '', 'title': 'The order of service has not been typed yet.',
                     'people': [], 'indent': 0})
    return rows


def _people_entries(body, name_font, name_colour, size, width, x, space=2.5):
    """A facilitator's line as the ink draws it: the name in the row's own
    font, the role that follows it in the lighter ink, the two sharing a
    baseline.

    Name and role wrap as one string — they are one line on the page — but
    each wrapped piece is inked with the run it belongs to, so the role
    reads lighter wherever the break falls. The entries are shaped the way
    both papers' drawing loops read them: a negative step keeps a pair of
    runs on one line, and the line's last entry carries the step on.
    """
    separator = ' \u2013 '
    role_from = body.find(separator)
    role_font = 'Helvetica'
    entries = []
    cursor = 0
    for piece in simpleSplit(body, name_font, size, width):
        start = body.find(piece, cursor)
        if start < 0:
            start = cursor
        end = start + len(piece)
        cursor = end
        # A name typed without a role carries no separator, so there is no
        # lighter tail to find: the whole piece is the name and must still
        # be inked — the row's people were measured into the flow (see the
        # builders) and a line dropped here would leave empty air here.
        if role_from < 0:
            entries.append((piece, name_font, size, name_colour, space, x))
            continue
        head = piece[:min(end, role_from) - start] if role_from >= 0 and start < role_from else ''
        tail = piece[max(start, role_from) - start:] if role_from >= 0 and end > role_from else ''
        if head and tail:
            entries.append((head, name_font, size, name_colour, -size, x))
            entries.append((tail, role_font, size, PROGRAM_ROLE_COLOUR, space,
                            x + stringWidth(head, name_font, size)))
        elif head:
            entries.append((head, name_font, size, name_colour, space, x))
        elif tail:
            entries.append((tail, role_font, size, PROGRAM_ROLE_COLOUR, space, x))
    return entries


def generate_event_program_plain_pdf(
    event, department_name: str = '', contact=None, department_code: str = '',
) -> bytes:
    """One calendar event's plain sheet — the programme as one letterhead page.

    Where the bifold answers print — a sheet that folds and is handed at the
    door — this answers sharing: a single column on portrait A4 that a phone
    reads comfortably and a link hands on whole. It keeps what the printed
    sheet's inside spread says — the church's mark at the head, the day as
    the letterhead names it, and the typed order of service beneath — and
    leaves the fold's paper to the brochure. The letterhead stands over
    the first page alone: a day long enough to run on starts straight into
    its rows, so the shout is never said twice. The ink speaks the way a
    plain document speaks it — sessions in bold on a wash of the
    ministry's own colour, led by their hour in that accent, with the
    activities beneath them in plain type and a grey hour of their own.

    `contact` trims the page's foot, spoken small under a rule: where the
    church stands, then the one sentence that asks for support with its
    link beside it on the same row, and the pay-bill a hand reaches for
    without a browser on the row beneath. The bank lines are the
    brochure's to speak; whatever is absent is left off the paper, never
    guessed at.
    """
    contact = contact or {}
    buffer = io.BytesIO()

    page_w, page_h = A4                     # portrait — a page, not a fold
    side = 16 * mm
    content_w = page_w - 2 * side

    DARK = colors.HexColor('#26352f')
    GREY = colors.HexColor('#617068')
    RULE = colors.HexColor('#dfdbd1')
    ACCENT = _department_accent(department_code, department_name)

    def wrap(text, font, size, width):
        return simpleSplit(text, font, size, width)

    def tint(colour, t):
        """The accent let almost all the way go — washed toward white, so a
        session's card reads as the ministry's own colour rather than a
        second block of ink on a plain document."""
        return colors.Color(
            colour.red + (1 - colour.red) * t,
            colour.green + (1 - colour.green) * t,
            colour.blue + (1 - colour.blue) * t,
        )

    c = canvas.Canvas(buffer, pagesize=(page_w, page_h))

    # The foot speaks with one voice about giving: the ask is ordinary
    # foot type — the words the rest of the foot is set in — and the door
    # itself rides the same row in a link's own colour, underlined and
    # tappable, with the pay-bill and account name a phone keys in without
    # a browser on the row beneath. The sheet is read on a screen, where a
    # QR would only be a scan of the device already holding it; the
    # brochure, the paper that folds, is where the QR belongs.
    give_url = (contact.get('give_url') or '').strip()
    GIVE_LABEL = 'Support us through '
    GIVE_MPESA = 'or M-Pesa Pay Bill 4132723, Account name Ensemble'
    LINK_COLOUR = colors.HexColor('#1a4fa0')
    FOOT_FONT = 'Helvetica'
    FOOT_SIZE = 7.5
    address_line = str(contact.get('address') or '').strip()

    FOOT_STEP = 10                          # one foot line's step
    FOOT_BASE = 18                          # the last line's own baseline

    def foot_lines(page_i, pages):
        """The foot's lines, top first — built once and read by both the
        flow (which gives up the room they need up front) and the ink, so
        the two never drift apart. Each line says whether it is drawn
        centred: the page's own count sits under the middle of the sheet
        rather than hung at its left edge."""
        lines = []
        if address_line:
            for piece in wrap(address_line, 'Helvetica', 7.5, content_w)[:2]:
                lines.append((piece, 'Helvetica', 7.5, GREY, None, False))
        if give_url:
            # One row: the ask in the foot's own ink, the link trailing it
            # in a link's own colour. The link is cut down to what the ask
            # leaves of the measure rather than given the whole of it.
            room = content_w - c.stringWidth(GIVE_LABEL, FOOT_FONT, FOOT_SIZE)
            shown = give_url
            while shown and c.stringWidth(shown, FOOT_FONT, FOOT_SIZE) > room:
                shown = shown[:-1]
            if not shown:
                shown = give_url
            elif shown != give_url:
                shown = shown.rstrip('/?&=#') + '\u2026'
            lines.append((
                [(GIVE_LABEL, GREY, None), (shown, LINK_COLOUR, give_url)],
                FOOT_FONT, FOOT_SIZE, GREY, None, False,
            ))
            # The second door, for a hand with no browser: the pay-bill and
            # the account name typed into the M-Pesa prompt as it stands,
            # on the row beneath the one that carries the link.
            for piece in wrap(GIVE_MPESA, FOOT_FONT, FOOT_SIZE, content_w)[:1]:
                lines.append((piece, FOOT_FONT, FOOT_SIZE, GREY, None, False))
        # The count is part of the list whenever the day runs past one
        # page — every sheet says which of them it is — and a one-page day
        # simply leaves it off the paper.
        if pages > 1:
            lines.append((f'Page {page_i + 1} of {pages}', 'Helvetica', 7.5, GREY, None, True))
        return lines

    # The rows give the foot its band up front, measured by the same
    # arithmetic the foot draws with — up to two lines of address, the door
    # into the system, and a page to count. The slack over
    # the foot's own top line is deliberately small: the day's rows run down
    # to the rule rather than stopping short of it.
    foot_top = FOOT_BASE + FOOT_STEP * (len(foot_lines(0, 2)) - 1) + 8

    def head(title_pieces, title_size, meta_lines):
        """The first page's letterhead — mark, kicker, the day, its meta —
        and the `y` the first row line sits at. The sheet wears it once: a
        day long enough to run onto another page starts straight into its
        rows rather than saying all of this again."""
        cx = page_w / 2
        logo_h = 15 * mm
        _draw_logo(c, cx, page_h - 30, logo_h, line_2=_PROGRAM_LOCKUP_LINE_2)
        y = page_h - 30 - logo_h - 22
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
        y += (title_size * 0.35)          # the meta's breath
        # No rule under the title: the line that ran between the day and
        # its date is off the paper, so the date follows the name directly.
        y -= 6
        for bit in meta_lines:
            c.setFont('Helvetica', 9.5)
            c.setFillColor(GREY)
            c.drawCentredString(cx, y, bit)
            y -= 14
        y -= 16                           # the rows' air below the head
        return y

    def foot(page_i, pages):
        """The page's foot: a rule, and beneath it where the church stands,
        the one door that carries the day's giving, and the page's own
        count — small, grey, and never mistaken for the day. Either line of
        the door opens it on a tap."""
        lines = foot_lines(page_i, pages)
        y = FOOT_BASE + FOOT_STEP * (len(lines) - 1)
        c.setStrokeColor(RULE)
        c.setLineWidth(0.6)
        c.line(side, y + 12, page_w - side, y + 12)
        for text, font, size, colour, link, centred in lines:
            c.setFont(font, size)
            c.setFillColor(colour)
            if isinstance(text, list):
                # A row carrying its own link: each piece is inked in its
                # own colour as it is set, and the link's piece wears an
                # underline and takes the tap over its own width alone —
                # the words around it stay ordinary foot type.
                x = side
                for piece, piece_colour, piece_link in text:
                    c.setFillColor(piece_colour)
                    c.drawString(x, y, piece)
                    piece_w = c.stringWidth(piece, font, size)
                    if piece_link:
                        c.setStrokeColor(piece_colour)
                        c.setLineWidth(0.5)
                        c.line(x, y - 1.6, x + piece_w, y - 1.6)
                        c.linkURL(
                            piece_link,
                            (x - 2, y - 3, x + piece_w + 2, y + size),
                            thickness=0,
                        )
                    x += piece_w
            elif centred:
                c.drawCentredString(page_w / 2, y, text)
            else:
                c.drawString(side, y, text)
            if link:
                c.linkURL(
                    link,
                    (side - 2, y - 3, side + c.stringWidth(text, font, size) + 2, y + size),
                    thickness=0,
                )
            y -= FOOT_STEP

    # ── The day as the letterhead names it ────────────────────────────────
    title = str(event.title or 'Program').strip() or 'Program'
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
    ministry = _program_department_name(department_code, department_name)
    if ministry:
        meta.append(ministry)
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
        """One row's spoken pieces. A session carries the day's shape, so it
        speaks in bold and leads with its own hour in the ministry's
        accent; an activity beneath it speaks in plain type with a grey
        hour — the eye finds the sessions first and reads down into them.
        The hour stands in a column of its own, so every name in the sheet
        begins at the same place and the people carrying a row sit level
        with that row's own name."""
        left = side + row['indent']
        name_x = left + PROGRAM_TIME_COL
        width = content_w - row['indent'] - PROGRAM_TIME_COL
        session = row['indent'] == 0
        # The size an activity's name is set at — and the size a facilitator
        # is written at, so the people carrying a row read at the name's own
        # ink rather than a step beneath it.
        ACTIVITY_SIZE = 10.5
        size = 12.5 if session else ACTIVITY_SIZE
        font = 'Helvetica-Bold' if session else 'Helvetica'
        hour_colour = ACCENT if session else GREY
        title = row['title'] or '\u2014'
        hour = row['hours'] or ''
        lines = []
        # A run of blank lines the desk pressed before this row — each one
        # raised as its own invisible step, so the paper reads the spacing
        # the verse or the song asked for.
        for _ in range(int(row.get('gap') or 0)):
            lines.append(('', 'Helvetica', size, DARK, 2.5, name_x))
        if hour:
            # The hour leads the row in its own colour, right up against the
            # name's edge; the name begins there on the same baseline — a
            # negative step keeps the pair on the one line they draw.
            hour_x = max(left, name_x - PROGRAM_TIME_GAP - stringWidth(hour, font, size))
            lines.append((hour, font, size, hour_colour, -size, hour_x))
        for piece in wrap(title, font, size, width):
            # Every line of the name — the first riding the hour's baseline
            # when the row has one — sits at the column's far edge, so the
            # names run down the sheet in one line.
            lines.append((piece, font, size, DARK, 2.5, name_x))
        for name, role in row['people']:
            # The bullet is written in the row's own font, at the row's own
            # name size — but a step in from it, so the people under a row
            # read farther from the name's level than a continuation of it
            # would. The step narrows the line's own measure, so a wrap
            # never carries them past the sheet's margin.
            bullet = f'\u2022 {name}' + (f' \u2013 {role}' if role else '')
            lines.extend(_people_entries(bullet, font, GREY, ACTIVITY_SIZE,
                                         width - PROGRAM_PEOPLE_INDENT,
                                         name_x + PROGRAM_PEOPLE_INDENT))
        return lines

    def row_height(row):
        """What one row consumes: its lines and the breath after them — the
        same arithmetic the ink draws with, so the two never drift apart."""
        return sum(size + space for (_t, _f, size, _c, space, _x) in row_lines(row)) + 8

    # The rows are fitted before the paper is drawn: the page count the
    # foot speaks must be known before a foot exists. The head that stands
    # over the first page is measured by the same arithmetic the head draws
    # with — the mark, the shout, the day, its meta — so ink and budget
    # never drift apart. A continuation page carries no head at all: it
    # starts straight into the rows, so it holds whatever the top of the
    # sheet gives back.
    # When a page ends with little room left, the next session begins on a
    # fresh page instead of being squeezed into the foot. The factor is kept
    # small on purpose: a session can always be crowded out, so only a page
    # whose remainder is tight enough to look cramped is broken early — never
    # a page that still comfortably holds the session after it.
    SESSION_FOOT_FACTOR = 0.25
    logo_h = 15 * mm
    head_bottom = (
        (page_h - 30)                                   # the mark's top
        - (logo_h + 22)                                 # the mark and its breath
        - 26                                            # the rule's step
        - 26                                            # the kicker's line
        - 26                                            # the air before the name
        - title_size * 1.22 * len(title_pieces)         # the name's lines
        + title_size * 0.35                             # the name's breath back
        - 6                                             # the breath before the meta
        - 14 * len(meta)                                # the meta's spoken lines
        - 16                                            # the air below the head
    )
    usable_first = head_bottom - (foot_top + 8)
    if usable_first < 120:
        usable_first = 120
    usable_next = (page_h - 34) - (foot_top + 8)
    if usable_next < 120:
        usable_next = 120

    def budget_for(page_i):
        """The column a page can hold: the first gives the letterhead its
        room, every page after it starts at the top of the sheet."""
        return usable_first if page_i == 0 else usable_next

    pages_rows = [[]]
    running = budget_for(0)
    for position, row in enumerate(rows):
        lines = row_lines(row)
        height = row_height(row)
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
            need += row_height(rows[position + 1])
        if pages_rows[-1] and need > running:
            pages_rows.append([])
            running = budget_for(len(pages_rows) - 1)
        # When a page ends with too little room for the next session, the
        # next session starts on a fresh page instead of being squeezed into
        # the foot. The factor is kept small on purpose: a session can always
        # be crowded out, so only a page whose remainder is tight enough to
        # look cramped is broken early — never a page that still comfortably
        # holds the session after it.
        if pages_rows[-1] and position + 1 < len(rows) and rows[position + 1]['indent'] == 0:
            next_need = row_height(rows[position + 1])
            if next_need <= running and next_need > running * SESSION_FOOT_FACTOR:
                pages_rows.append([])
                running = budget_for(len(pages_rows) - 1)
        pages_rows[-1].append((row, lines))
        running -= height

    # ── The ink ───────────────────────────────────────────────────────────
    for page_i, page_rows_list in enumerate(pages_rows):
        # The letterhead stands over the first page alone; what follows
        # starts straight into the day.
        y = head(title_pieces, title_size, meta) if page_i == 0 else page_h - 34
        for row, lines in page_rows_list:
            x = side + row['indent']
            height = row_height(row)
            session = row['indent'] == 0
            if session:
                # The session's wash: its own accent almost let go — a card
                # the hour and the name sit in, drawn before the ink from
                # the same numbers the flow measured it by. It stops short
                # of the row's breath at either end, so a session that runs
                # straight into the next keeps a card of its own.
                band_bottom = y - (height - 8) - 2
                band_top = y + 2
                c.setFillColor(tint(ACCENT, 0.92))
                c.roundRect(side - 8, band_bottom, content_w + 16,
                            band_top - band_bottom, 4, fill=1, stroke=0)
            for text, font, size, colour, space, lx in lines:
                c.setFont(font, size)
                c.setFillColor(colour)
                y -= size
                c.drawString(lx, y, text)
                y -= space
            # The wash already sets a session apart; the hairline belongs to
            # the activities it holds.
            if not session:
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
    mark, the day and its ministry over the church's own art, which runs
    the panel's full width and off the foot of the sheet with no margin to
    frame it — and the back panel on its left, which opens with the church's mission
    and its vision (the same statements the About page speaks) and keeps its
    welcome — where to find it, its week of worship, and how to give — at the
    fold's foot. Gradients stay inside the palette's own sand and ember, the
    washes printing as flat light rather than loud colour.

    A day too long for one spread flows onto another sheet — and that sheet
    grows no cover and no welcome of its own. The order simply continues
    from face to face, so a reader turns through the day straight from the
    first cover to its end.

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
        """One row's spoken pieces: a session's hour and its name sharing
        one bold line, an activity beneath them set in plain type, and the
        people carrying either level with that name — the same reading the
        plain sheet lays down, so the eye finds the sessions first on
        either paper and the names fall in one line down both."""
        width = panel_w - 2 * side - row['indent'] - PROGRAM_TIME_COL
        lines = []
        session = row['indent'] == 0
        # The activity's own size — the same ink a facilitator is written
        # at, so the people carrying a row read at the name's own size.
        ACTIVITY_SIZE = 11
        size = 12.5 if session else ACTIVITY_SIZE
        font = 'Helvetica-Bold' if session else 'Helvetica'
        title = row['title'] or '\u2014'
        hour = row['hours'] or ''
        # The name's own left edge: the hour holds a column of its own at
        # the row's left, so every name — and the people carrying it —
        # begins at the same place whatever that row's hour said.
        name_x = PROGRAM_TIME_COL
        # A run of blank lines the desk pressed before this row — the same
        # spacing the plain sheet carries, so both papers read alike.
        for _ in range(int(row.get('gap') or 0)):
            lines.append(('', font, size, DARK, 2.5, name_x))
        if hour:
            hour_x = max(0, name_x - PROGRAM_TIME_GAP - stringWidth(hour, font, size))
            lines.append((hour, font, size, DARK, -size, hour_x))
        for piece in wrap(title, font, size, width):
            lines.append((piece, font, size, DARK, 2.5, name_x))
        for name, role in row['people']:
            # The same step in the plain sheet takes — the people sit farther
            # from the name's level than the name's own line, measured off
            # the line's own width so the panel's margin holds them.
            text = f'\u2022 {name}' + (f' \u2013 {role}' if role else '')
            lines.extend(_people_entries(text, font, GREY, ACTIVITY_SIZE,
                                         width - PROGRAM_PEOPLE_INDENT,
                                         name_x + PROGRAM_PEOPLE_INDENT))
        return lines

    def row_height(row):
        # What the panel consumes for one row: its lines, the hairline under
        # it, and the breath after. Drawn and measured from the same numbers,
        # so the flow never drifts from where the ink lands.
        return sum(size + space for (_t, _f, size, _c, space, _x) in row_lines(row)) + 8

    # ── Fitting the rows onto panels: two columns of one spread per sheet ─

    # The same factor the plain sheet reads: a column whose remainder is
    # tight enough to look cramped hands the next session its own fresh
    # column rather than squeezing it (0.25 — one quarter of the panel).
    SESSION_FOOT_FACTOR = 0.25

    usable_h = page_h - headroom - footroom
    spreads = [[[], []]]
    y_left = usable_h
    y_right = usable_h
    col_i = 0
    row_i = 0
    while row_i < len(rows):
        row = rows[row_i]
        lines = row_lines(row)
        height = sum(size + space for (_t, _f, size, _c, space, _x) in lines) + 8
        column = spreads[-1][col_i]
        y_now = y_left if col_i == 0 else y_right

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
            need += sum(size + space for (_t, _f, size, _c, space, _x) in next_lines) + 8

        if column and need > y_now:
            if col_i == 0:
                col_i = 1
            else:
                spreads.append([[], []])
                y_left = usable_h
                y_right = usable_h
                col_i = 0
            continue

        # When a column ends with too little room for the next session, the
        # next session starts on a fresh column instead of being squeezed
        # into the foot — the same reading the plain sheet lays down.
        if column and row_i + 1 < len(rows) and rows[row_i + 1]['indent'] == 0:
            next_need = (
                sum(size + space for (_t, _f, size, _c, space, _x) in row_lines(rows[row_i + 1])) + 8
            )
            if next_need <= y_now and next_need > y_now * SESSION_FOOT_FACTOR:
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
        cover_meta.append(parsed_day.strftime('%d%m%Y'))
    except ValueError:
        if date_text:
            cover_meta.append(date_text)
    if department_name:
        cover_meta.append(_program_department_name(department_code, department_name))
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

    def draw_cover(c, x0):
        cx = x0 + panel_w / 2
        content_w = panel_w - 2 * side
        title = str(event.title or 'Program').strip() or 'Program'
        # The church's own poster stands where a faint symbol once did —
        # printed whole (its letterhead and its lines included, as the
        # church asked) rather than drawn faint — ringed in the panel's
        # hairline and settled just above the foot band. The box is set
        # by the room the words above it leave, and takes the poster's
        # own shape: this download is square, so it runs taller down the
        # cover than the wall's wide rendering did, into the space the
        # panel has to give.
        # The church's own poster is the cover's ground: it runs the
        # panel's full width and bleeds past the foot of the page, so
        # nothing frames it — no margin of linen, no ring of hairline
        # round a picture hung on a wall. Its letterhead and its lines
        # print whole, as the church asked; only the photograph's own
        # foreground runs off the edge of the sheet.
        photo_w = panel_w
        photo_h = panel_w / _CHURCH_BUILDING_RATIO
        FLOOR = 360.0                  # the poster keeps at least this much

        def words_bottom(title_size, meta_leading=13):
            """The cover's words measured without inking them — the mark,
            the shout, the day and its meta — and the last baseline they
            land on, so the poster knows how much of the page is its own."""
            y = page_h - 24 - 12 * mm - 10 - 24
            held = wrap(title, 'Helvetica-Bold', title_size, content_w)
            y -= len(held) * title_size * 1.22
            y -= 14 + 14                      # the stroke's breath and the meta's
            y -= max(0, len(cover_meta) - 1) * meta_leading
            return held, y

        # The day's name is set at the largest size the room above the
        # poster still holds, so a long title gives way before the words
        # crowd the church's own letterhead.
        fitted = None
        for candidate in (21, 19, 17, 15, 13):
            held, bottom = words_bottom(candidate)
            fitted = (candidate, held, bottom)
            if bottom >= FLOOR:
                break
        title_size, pieces, last_baseline = fitted

        photo_top = last_baseline - 8
        c.saveState()
        ground = c.beginPath()
        ground.rect(x0, 0, panel_w, page_h)
        c.clipPath(ground, stroke=0, fill=0)
        c.drawImage(_CHURCH_BUILDING, x0, photo_top - photo_h, photo_w, photo_h)
        c.restoreState()
        # The words, measured above and now inked in the same steps:
        # the mark at the head, the shout, the name of the day, and the
        # day itself — each landing where the arithmetic said it would.
        y = page_h - 24
        _draw_logo(c, cx, y, 12 * mm, line_2=_PROGRAM_LOCKUP_LINE_2)
        y -= 12 * mm
        y -= 10
        kicker = 'ORDER OF SERVICE'
        tracking = 4
        c.setFont('Helvetica-Bold', 9)
        c.setFillColor(ACCENT)
        kick_w = c.stringWidth(kicker, 'Helvetica-Bold', 9) + tracking * (len(kicker) - 1)
        ktext = c.beginText(cx - kick_w / 2, y)
        # Letter-spacing lives in the text state, so it is cleared inside
        # the same line: otherwise every line drawn after the kicker
        # inherits the tracking and drifts wide of its measure.
        ktext.setCharSpace(tracking)
        ktext.textOut(kicker)
        ktext.setCharSpace(0)
        c.drawText(ktext)
        y -= 24
        c.setFillColor(DARK)
        c.setFont('Helvetica-Bold', title_size)
        for piece in pieces:
            c.drawCentredString(cx, y, piece)
            y -= title_size * 1.22
        # A short gradient stroke ties the name to its day — the
        # department's own colour easing into the lockup's gold, the
        # accent the inside spread gives the hours.
        wash(cx - 22, y + 6, 44, 2, [ACCENT, GOLD], horizontal=True)
        # No rule under the title: the line that ran between the day and
        # its date is off the paper, so the date follows the stroke directly.
        y -= 14
        y -= 14
        for bit in cover_meta:
            c.setFont('Helvetica', 10)
            c.setFillColor(GREY)
            c.drawCentredString(cx, y, bit)
            y -= 13
        # A band of colour closes the cover at its foot: dark easing into
        # the department's colour easing into the lockup's gold — the
        # church's paper, the day's identity, standing where a fold meets
        # a reader's thumb.
        wash(x0, 16, panel_w, 5, [DARK, ACCENT, GOLD], horizontal=True)

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

        # The giving QR, at the panel's foot beside the welcome: the system's
        # own giving page, opened with the day's account already chosen —
        # the scanner arrives at the form, not the front door.
        qr_url = (contact.get('give_url') or '').strip()
        if qr_url:
            qr_size = 12 * mm
            qr_x = x + w - qr_size
            _draw_qr(c, qr_url, qr_x, 6, qr_size)
            c.setFont('Helvetica-Bold', 7)
            c.setFillColor(EMBER)
            c.drawRightString(qr_x - 8, 26, 'Scan to give')
            c.setFont('Helvetica', 6.5)
            c.setFillColor(GREY)
            c.drawRightString(qr_x - 8, 15, 'through the system')

    def draw_row(c, x, y, row, lines):
        """Draw one row's lines, rule under it, and step to the next."""
        for text, font, size, colour, space, lx in lines:
            c.setFont(font, size)
            c.setFillColor(colour)
            y -= size
            c.drawString(x + lx, y, text)
            y -= space
        c.setStrokeColor(RULE)
        c.setLineWidth(0.4)
        c.line(x, y - 2, x + (panel_w - 2 * side - row['indent']), y - 2)
        return y - 8

    c = canvas.Canvas(buffer, pagesize=(page_w, page_h))

    def draw_program_face(spread, continued):
        """One face of the order — the two panels the fold holds, headed by
        the label a reader turns to: the day's own on the first face, and
        continued on every face after it."""
        label = 'Order of Service \u2013 continued' if continued else 'Order of Service'
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

    # ── The sheets ──────────────────────────────────────────────
    # The first sheet's outside is the day itself: the church's welcome on
    # the back panel, the cover on the right. Every face    after it is a page
    # of the order — a day too long for one spread continues straight onto
    # the next face rather than growing a second cover and a second welcome,
    # so the booklet reads from the first cover to its end without a break.
    # Each sheet still prints as two faces, so duplex pairing holds.
    #
    # The same generous-break rule that the plain sheet uses — a session that
    # would only just fit at the foot moves to the next page — is already
    # baked into the brochure's fitter: spreads are built one row at a time,
    # a session head and the activity it opens are never split across faces,
    # and the column that still has room remembers how tight it is, so a
    # session that would sit uncomfortably at the bottom of a spread keeps
    # its shape on the next one instead.
    continuation = spreads[1:]
    sheet_count = 1 + (len(continuation) + 1) // 2
    for sheet_i in range(sheet_count):
        if sheet_i == 0:
            # The sheet's outside wears the paper's light: linen easing to
            # white from head to foot, one wash across the whole sheet.
            wash(0, 0, page_w, page_h, [LINEN, PLATE])
            # ── The sheet's outside: the church's welcome left, the cover
            # right ──
            draw_back(c, 0)
            draw_cover(c, panel_w)
            fold_guides()
            c.showPage()
            # ── The inside spread: the order of service down both panels ──
            draw_program_face(spreads[0], continued=False)
            continue
        outside = continuation[2 * (sheet_i - 1)]
        draw_program_face(outside, continued=True)
        inside_at = 2 * (sheet_i - 1) + 1
        if inside_at < len(continuation):
            draw_program_face(continuation[inside_at], continued=True)
        else:
            # The last sheet may have only its outside to say: its inside is
            # left as plain paper, so the two faces still pair for duplex
            # printing rather than shifting every sheet after it.
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
    story.append(Paragraph(f"Generated: {datetime.now().strftime('%d%m%Y, %I:%M %p')}", st["meta"]))

    filter_parts = []
    if start_date and end_date:
        filter_parts.append(f"Period: {date_compact(start_date)} to {date_compact(end_date)}")
    elif start_date:
        filter_parts.append(f"From: {date_compact(start_date)}")
    elif end_date:
        filter_parts.append(f"Up to: {date_compact(end_date)}")
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
                    return dt.strftime("%d%m%Y")
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

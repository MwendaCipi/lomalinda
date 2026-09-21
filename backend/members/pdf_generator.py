import io
from decimal import Decimal
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    KeepTogether,
    HRFlowable,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas


class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas to add 'Page X of Y' and running footer dynamically.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
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
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#617068"))
        
        # Draw bottom line
        self.setStrokeColor(colors.HexColor("#dfdbd1"))
        self.setLineWidth(0.5)
        self.line(1.5 * cm, 1.8 * cm, A4[0] - 1.5 * cm, 1.8 * cm)
        
        # Footer text
        footer_text = "Seventh-day Adventist Church • Official Financial & Administrative Record"
        page_text = f"Page {self._pageNumber} of {page_count}"
        
        self.drawString(1.5 * cm, 1.2 * cm, footer_text)
        self.drawRightString(A4[0] - 1.5 * cm, 1.2 * cm, page_text)
        self.restoreState()


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

    return {
        "title": title_style,
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


def generate_reconciliation_pdf(
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
):
    """
    Generates NEKF-format Cash Count & Offering Report Summary PDF.
    """
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
        story.append(Paragraph(f"<b>{church_name.upper()}</b>", st["title"]))
        subtitle_text = f"INDIVIDUAL CONTRIBUTIONS REPORT - {purpose_title.upper()}" if purpose_title else "INDIVIDUAL MEMBER & COLLECTION CONTRIBUTIONS REPORT"
        story.append(Paragraph(f"<b>{subtitle_text}</b>", st["subtitle"]))
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

        ind_headers = ["Contributor Name", "Date", "Purpose", "Type & Mode", "Receipt / Ref", "Amount (KES)"]
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
            story.append(Paragraph("<b>Giving Purpose Breakdown</b>", st["h2"]))
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
    story.append(Paragraph("<b>SEVENTH DAY ADVENTIST CHURCH</b>", st["subtitle"]))
    story.append(Paragraph(f"<b>{(field_name or 'NORTH EAST KENYA FIELD').upper()}</b>", st["title"]))
    from datetime import datetime as _dt
    try:
        dt_start = _dt.strptime(start_date, "%Y-%m-%d")
        month_label = dt_start.strftime("%B %Y").upper()
    except Exception:
        month_label = start_date
    try:
        dt_end = _dt.strptime(end_date, "%Y-%m-%d")
        end_date_str = dt_end.strftime("%d.%m.%Y")
    except Exception:
        end_date_str = end_date

    story.append(Paragraph(f"<b>CASH COUNT AND OFFERING REPORT SUMMARY ({month_label})</b>", st["subtitle"]))
    meta_text = f"Name of Church: {church_name}"
    if district:
        meta_text += f" &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; District: {district}"
    story.append(Paragraph(meta_text, st["meta"]))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#26352f"), spaceAfter=10))

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
    sig_data = [[
        Paragraph("<b>Signed By:</b><br/><br/>Name: ______________________<br/>Treasurer Sign: _______________", st["cell"]),
        Paragraph("Name: ______________________<br/>Deacon Sign: ________________", st["cell"]),
        Paragraph("Name: ______________________<br/>Elder Sign: _________________", st["cell"]),
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


def generate_member_giving_statement_pdf(church_name, member_name, member_email, start_date, end_date, givings, purpose_totals, grand_total):
    """
    Generates Member Official Contribution Statement PDF.
    """
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

    story.append(Paragraph(f"SEVENTH-DAY ADVENTIST CHURCH", st["subtitle"]))
    story.append(Paragraph(f"{church_name.upper()}", st["title"]))
    story.append(Paragraph("MEMBER OFFICIAL CONTRIBUTION STATEMENT", st["subtitle"]))
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

    sign_data = [
        [
            Paragraph("<b>Church Treasurer Name:</b> ___________________________<br/><b>Signature:</b> ___________________________", st["cell"]),
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

    story.append(Paragraph(f"SEVENTH-DAY ADVENTIST CHURCH", st["subtitle"]))
    story.append(Paragraph(f"{church_name.upper()}", st["title"]))
    story.append(Paragraph("BUSINESS MEETING AGENDA & MINUTES PACKET", st["subtitle"]))
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

    # Header
    story.append(Paragraph(church_name.upper(), st["church_name"]))
    story.append(Spacer(1, 4))
    story.append(Paragraph("OFFICIAL USERS DIRECTORY" if friend_count else "OFFICIAL MEMBER DIRECTORY", st["report_title"]))
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
        ["Total Users", "Members", "Friends", "Disfellowshipped"],
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
            status_text = "Disfellowshipped"
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
    # Disfellowshipped rows
    for i, m in enumerate(members, 1):
        if m.get('is_disfellowshipped'):
            style_cmds.append(("TEXTCOLOR", (4, i), (4, i), colors.HexColor("#b91c1c")))
            style_cmds.append(("FONTNAME", (4, i), (4, i), "Helvetica-Bold"))

    member_table.setStyle(TableStyle(style_cmds))
    story.append(member_table)

    doc.build(story, canvasmaker=NumberedCanvas)
    buffer.seek(0)
    return buffer.getvalue()


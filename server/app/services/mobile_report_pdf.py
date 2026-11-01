"""Vrika-branded PDF report for mobile application static analysis."""

from __future__ import annotations

import base64
import io
import logging
import re
from datetime import UTC, datetime
from html import unescape
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

logger = logging.getLogger(__name__)

_ASSETS = Path(__file__).resolve().parent.parent / "assets"
_FONT = "PlusJakartaSans"

PURPLE = colors.HexColor("#684CB6")
PURPLE_DARK = colors.HexColor("#22005D")
PURPLE_PALE = colors.HexColor("#F3F0FA")
TEXT = colors.HexColor("#1B1B21")
MUTED = colors.HexColor("#6B6A78")
GRID = colors.HexColor("#E5E4EF")
CARD_BG = colors.HexColor("#F7F6FC")

SEVERITY = {
    "high": ("High", colors.HexColor("#A8364B")),
    "warning": ("Medium", colors.HexColor("#D97706")),
    "hotspot": ("Hotspot", colors.HexColor("#684CB6")),
    "info": ("Info", colors.HexColor("#0284C7")),
    "secure": ("Secure", colors.HexColor("#006D4B")),
}
SEVERITY_ORDER = ["high", "warning", "hotspot", "info", "secure"]

PAGE_MARGIN = 0.6 * inch
# SimpleDocTemplate frames add 6pt padding on each side.
CONTENT_W = A4[0] - 2 * PAGE_MARGIN - 12


def _register_font() -> str:
    if _FONT in pdfmetrics.getRegisteredFontNames():
        return _FONT
    try:
        pdfmetrics.registerFont(TTFont(_FONT, str(_ASSETS / "PlusJakartaSans-Regular.ttf")))
        pdfmetrics.registerFontFamily(_FONT, normal=_FONT, bold=_FONT, italic=_FONT, boldItalic=_FONT)
        return _FONT
    except Exception:
        logger.exception("Falling back to Helvetica for mobile PDF")
        return "Helvetica"


def _clean(value: Any, limit: int = 600) -> str:
    """Engine text embeds HTML; flatten it and escape for ReportLab markup."""
    if value is None:
        return ""
    text = value if isinstance(value, str) else str(value)
    text = re.sub(r"<br\s*/?>", " ", text, flags=re.I)
    text = unescape(re.sub(r"<[^>]+>", "", text)).strip()
    if len(text) > limit:
        text = text[: limit - 1] + "…"
    return escape(text)


def _obj(v: Any) -> dict[str, Any]:
    return v if isinstance(v, dict) else {}


def _arr(v: Any) -> list[Any]:
    return v if isinstance(v, list) else []


def _norm_sev(raw: Any) -> str:
    v = str(raw or "").lower()
    if v in {"high", "critical", "dangerous", "bad"}:
        return "high"
    if v in {"warning", "medium"}:
        return "warning"
    if v in {"secure", "good"}:
        return "secure"
    if v == "hotspot":
        return "hotspot"
    return "info"


def _hex(color: colors.Color) -> str:
    return "#" + color.hexval()[2:]


def _grade(score: Any) -> str:
    if not isinstance(score, (int, float)):
        return "–"
    return "A" if score >= 75 else "B" if score >= 60 else "C" if score >= 40 else "F"


class MobileReportPdf:
    def __init__(self, report: dict[str, Any], scorecard: dict[str, Any] | None, scan: dict[str, Any], logo: bytes | None) -> None:
        self.report = report
        self.card = scorecard or {}
        self.scan = scan
        self.logo = logo
        self.font = _register_font()
        f = self.font
        self.s_body = ParagraphStyle("b", fontName=f, fontSize=9, leading=13, textColor=TEXT)
        self.s_muted = ParagraphStyle("m", fontName=f, fontSize=7.5, leading=10, textColor=MUTED)
        self.s_label = ParagraphStyle("l", fontName=f, fontSize=7, leading=9, textColor=MUTED)
        self.s_title = ParagraphStyle("t", fontName=f, fontSize=24, leading=29, textColor=TEXT)
        self.s_subtitle = ParagraphStyle("st", fontName=f, fontSize=10.5, leading=14, textColor=PURPLE)
        self.s_section = ParagraphStyle("s", fontName=f, fontSize=13, leading=16, textColor=TEXT)
        self.s_th = ParagraphStyle("th", fontName=f, fontSize=7.5, leading=10, textColor=MUTED)
        self.s_td = ParagraphStyle("td", fontName=f, fontSize=8.2, leading=11.5, textColor=TEXT)
        self.s_td_mono = ParagraphStyle("tdm", parent=self.s_td, fontName="Courier", fontSize=7.4, leading=10)
        self.s_meta_right = ParagraphStyle("mr", parent=self.s_muted, alignment=TA_RIGHT)

    # ---------- building blocks ----------

    def _section(self, title: str) -> list[Any]:
        band = Table([[Paragraph(escape(title), self.s_section)]], colWidths=[CONTENT_W])
        band.setStyle(
            TableStyle(
                [
                    ("LINEBEFORE", (0, 0), (0, -1), 3, PURPLE),
                    ("LINEBELOW", (0, 0), (-1, -1), 0.5, GRID),
                    ("LEFTPADDING", (0, 0), (-1, -1), 10),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        band.keepWithNext = True
        gap = Spacer(1, 8)
        gap.keepWithNext = True
        return [Spacer(1, 14), band, gap]

    def _sev_cell(self, sev: str) -> Paragraph:
        label, color = SEVERITY[sev]
        return Paragraph(f'<font color="{_hex(color)}">●</font> {label}', self.s_td)

    def _table(self, headers: list[str], rows: list[list[Any]], widths: list[float]) -> Table:
        data = [[Paragraph(escape(h).upper(), self.s_th) for h in headers]]
        for r in rows:
            data.append([c if not isinstance(c, str) else Paragraph(c, self.s_td) for c in r])
        t = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
        t.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), PURPLE_PALE),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 7),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FBFAFE")]),
                    ("LINEBELOW", (0, 0), (-1, -1), 0.4, GRID),
                ]
            )
        )
        return t

    def _logo_flowable(self) -> Any:
        for source in (self.logo, None):
            try:
                if source:
                    data = source
                else:
                    data = (_ASSETS / "vrika_logo.png").read_bytes()
                reader = ImageReader(io.BytesIO(data))
                iw, ih = reader.getSize()
                scale = min(1.6 * inch / iw, 0.55 * inch / ih)
                return Image(io.BytesIO(data), width=iw * scale, height=ih * scale)
            except Exception:
                logger.warning("Report logo unreadable; trying default")
        return Paragraph("VRIKA", self.s_subtitle)

    def _severity_bar(self, counts: dict[str, int]) -> Drawing:
        h = 26
        d = Drawing(CONTENT_W, h + 16)
        total = sum(counts.get(k, 0) for k in SEVERITY_ORDER) or 1
        x = 0.0
        for k in SEVERITY_ORDER:
            n = counts.get(k, 0)
            if not n:
                continue
            w = CONTENT_W * n / total
            d.add(Rect(x, 16, w, 10, fillColor=SEVERITY[k][1], strokeColor=None))
            x += w
        lx = 0.0
        for k in SEVERITY_ORDER:
            label = f"{SEVERITY[k][0]}  {counts.get(k, 0)}"
            d.add(Rect(lx, 2, 7, 7, fillColor=SEVERITY[k][1], strokeColor=None))
            d.add(String(lx + 11, 2, label, fontName=self.font, fontSize=7.5, fillColor=MUTED))
            lx += 92
        return d

    # ---------- sections ----------

    def _header(self) -> list[Any]:
        r = self.report
        platform = "iOS" if r.get("bundle_id") or str(self.scan.get("scan_type", "")).lower() == "ipa" else "Android"
        date = datetime.now(UTC).strftime("%b %d, %Y")
        masthead = Table(
            [[self._logo_flowable(), Paragraph(f"MOBILE APPLICATION SECURITY REPORT<br/>{platform.upper()} · {date}", self.s_meta_right)]],
            colWidths=[CONTENT_W * 0.4, CONTENT_W * 0.6],
        )
        masthead.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 16),
                    ("LINEBELOW", (0, 0), (-1, -1), 0.5, GRID),
                ]
            )
        )
        name = _clean(r.get("app_name") or self.scan.get("app_name") or r.get("file_name"), 120)
        pkg = _clean(r.get("package_name") or r.get("bundle_id"), 160)
        version = _clean(r.get("version_name") or r.get("app_version"), 40)
        sub = " · ".join(x for x in [pkg, f"v{version}" if version else ""] if x)
        return [masthead, Spacer(1, 18), Paragraph(name or "Application", self.s_title), Spacer(1, 4), Paragraph(sub, self.s_subtitle), Spacer(1, 18)]

    def _counts(self) -> dict[str, int]:
        return {k: len(_arr(self.card.get(k))) for k in SEVERITY_ORDER}

    def _metrics(self) -> list[Any]:
        counts = self._counts()
        score = self.card.get("security_score")
        trackers = self.card.get("total_trackers")
        trackers_found = len(_arr(_obj(self.report.get("trackers")).get("trackers")))
        cards = [
            ("SECURITY SCORE", f"{score if score is not None else '–'}", f"Grade {_grade(score)} · out of 100", PURPLE),
            ("HIGH RISK", str(counts["high"]), "Findings to fix first", SEVERITY["high"][1]),
            ("MEDIUM RISK", str(counts["warning"]), "Findings to plan", SEVERITY["warning"][1]),
            ("TRACKERS", str(trackers_found), f"of {trackers} known signatures" if trackers else "Privacy trackers detected", TEXT),
        ]
        gap = 8
        w = (CONTENT_W - gap * 3) / 4
        cells = []
        for label, value, detail, color in cards:
            c = Table(
                [
                    [Paragraph(label, self.s_label)],
                    [Paragraph(f'<font size="22" color="{_hex(color)}">{escape(value)}</font>', ParagraphStyle("v", fontName=self.font, leading=26))],
                    [Paragraph(escape(detail), self.s_muted)],
                ],
                colWidths=[w],
            )
            c.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
                        ("LINEABOVE", (0, 0), (-1, 0), 2, color),
                        ("LEFTPADDING", (0, 0), (-1, -1), 9),
                        ("TOPPADDING", (0, 0), (-1, 0), 9),
                        ("BOTTOMPADDING", (0, -1), (-1, -1), 9),
                    ]
                )
            )
            cells += [c, ""]
        row = Table([cells[:-1]], colWidths=[w, gap, w, gap, w, gap, w])
        row.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
        return [row, Spacer(1, 14), self._severity_bar(counts)]

    def _summary(self) -> list[Any]:
        counts = self._counts()
        score = self.card.get("security_score")
        name = _clean(self.report.get("app_name") or self.scan.get("file_name"), 120) or "The application"
        text = (
            f"{name} received a security score of <b>{score if score is not None else 'n/a'}</b> "
            f"(grade {_grade(score)}). The analysis identified <b>{counts['high']}</b> high-risk and "
            f"<b>{counts['warning']}</b> medium-risk findings, plus {counts['hotspot']} security hotspots that need manual review. "
        )
        top = [_clean(f.get("title"), 140) for f in _arr(self.card.get("high"))[:3] if isinstance(f, dict)]
        if top:
            text += "Priority issues include: " + "; ".join(top) + "."
        elif not counts["high"]:
            text += "No high-risk issues were detected."
        out = self._section("Executive summary")
        out.append(Paragraph(text, self.s_body))
        return out

    def _app_info(self) -> list[Any]:
        r = self.report
        pairs = [
            ("File name", r.get("file_name")),
            ("Size", r.get("size")),
            ("Package / Bundle ID", r.get("package_name") or r.get("bundle_id")),
            ("Version", " · ".join(str(x) for x in [r.get("version_name") or r.get("app_version"), r.get("version_code") or r.get("build")] if x)),
            ("Target SDK", r.get("target_sdk")),
            ("Min SDK / OS", r.get("min_sdk") or r.get("min_os_version")),
            ("Main activity", r.get("main_activity")),
            ("MD5", r.get("md5")),
            ("SHA-256", r.get("sha256")),
        ]
        rows = [[Paragraph(escape(k), self.s_muted), Paragraph(_clean(v, 200), self.s_td_mono if k in {"MD5", "SHA-256"} else self.s_td)] for k, v in pairs if v]
        t = Table(rows, colWidths=[CONTENT_W * 0.26, CONTENT_W * 0.74])
        t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.4, GRID), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
        return self._section("Application information") + [t]

    def _scorecard_findings(self) -> list[Any]:
        rows = []
        for sev in ["high", "warning", "hotspot"]:
            for f in _arr(self.card.get(sev)):
                f = _obj(f)
                rows.append([self._sev_cell(sev), f"<b>{_clean(f.get('title'), 200)}</b><br/>{_clean(f.get('description'), 420)}", _clean(f.get("section"), 30)])
        if not rows:
            return []
        return self._section("Key findings") + [self._table(["Severity", "Finding", "Area"], rows, [CONTENT_W * 0.14, CONTENT_W * 0.72, CONTENT_W * 0.14])]

    def _code_findings(self) -> list[Any]:
        findings = _obj(_obj(self.report.get("code_analysis")).get("findings"))
        rows = []
        for rule, v in findings.items():
            md = _obj(_obj(v).get("metadata"))
            sev = _norm_sev(md.get("severity"))
            if sev in {"secure", "info"}:
                continue
            std = " · ".join(_clean(x, 60) for x in [md.get("cwe"), md.get("owasp-mobile"), md.get("masvs")] if x)
            files = list(_obj(_obj(v).get("files")).keys())
            where = "<br/>".join(_clean(p, 90) for p in files[:3]) + (f"<br/>+{len(files) - 3} more" if len(files) > 3 else "")
            rows.append((SEVERITY_ORDER.index(sev), [self._sev_cell(sev), f"<b>{_clean(md.get('description'), 220)}</b><br/><font color='#6B6A78' size='7'>{std}</font>", Paragraph(where, self.s_td_mono)]))
        if not rows:
            return []
        rows.sort(key=lambda r: r[0])
        return self._section("Code analysis") + [self._table(["Severity", "Issue & standards", "Locations"], [r[1] for r in rows], [CONTENT_W * 0.13, CONTENT_W * 0.5, CONTENT_W * 0.37])]

    def _config_findings(self) -> list[Any]:
        rows = []
        for f in _arr(_obj(self.report.get("manifest_analysis")).get("manifest_findings")):
            f = _obj(f)
            sev = _norm_sev(f.get("severity"))
            if sev in {"info", "secure"}:
                continue
            rows.append((SEVERITY_ORDER.index(sev), [self._sev_cell(sev), f"<b>{_clean(f.get('title'), 200)}</b><br/>{_clean(f.get('description'), 400)}"]))
        for f in _arr(_obj(self.report.get("network_security")).get("network_findings")) + _arr(_obj(self.report.get("ats_analysis")).get("ats_findings")):
            f = _obj(f)
            sev = _norm_sev(f.get("severity"))
            if sev in {"info", "secure"}:
                continue
            rows.append((SEVERITY_ORDER.index(sev), [self._sev_cell(sev), f"<b>{_clean(f.get('issue') or 'Network security', 160)}</b><br/>{_clean(f.get('description'), 400)}"]))
        if not rows:
            return []
        rows.sort(key=lambda r: r[0])
        return self._section("Configuration & network security") + [self._table(["Severity", "Finding"], [r[1] for r in rows], [CONTENT_W * 0.13, CONTENT_W * 0.87])]

    def _permissions(self) -> list[Any]:
        perms = _obj(self.report.get("permissions"))
        malware = set(map(str, _arr(_obj(self.report.get("malware_permissions")).get("top_malware_permissions"))))
        rows = []
        for name, v in perms.items():
            v = _obj(v)
            status = str(v.get("status") or "")
            if status not in {"dangerous", "unknown"} and name not in malware:
                continue
            flag = " <font color='#A8364B' size='7'>MALWARE-ASSOCIATED</font>" if name in malware else ""
            rows.append([Paragraph(_clean(name, 120), self.s_td_mono), self._sev_cell("high" if status == "dangerous" else "warning"), f"<b>{_clean(v.get('info'), 120)}</b>{flag}<br/>{_clean(v.get('description'), 260)}"])
        if not rows:
            return []
        return self._section(f"Sensitive permissions ({len(rows)} of {len(perms)})") + [self._table(["Permission", "Status", "Description"], rows, [CONTENT_W * 0.34, CONTENT_W * 0.13, CONTENT_W * 0.53])]

    def _certificate(self) -> list[Any]:
        rows = []
        for f in _arr(_obj(self.report.get("certificate_analysis")).get("certificate_findings")):
            f = _arr(f)
            if len(f) < 3:
                continue
            sev = _norm_sev(f[0])
            rows.append([self._sev_cell(sev), f"<b>{_clean(f[2], 160)}</b><br/>{_clean(f[1], 360)}"])
        if not rows:
            return []
        return self._section("Signing certificate") + [self._table(["Severity", "Finding"], rows, [CONTENT_W * 0.13, CONTENT_W * 0.87])]

    def _binary(self) -> list[Any]:
        rows = []
        binary = self.report.get("binary_analysis")
        for lib in _arr(binary):
            lib = _obj(lib)
            name = str(lib.get("name") or "")
            for key, val in lib.items():
                val = _obj(val)
                sev = _norm_sev(val.get("severity")) if val.get("severity") else None
                if sev in {"high", "warning"}:
                    rows.append([self._sev_cell(sev), f"<b>{escape(key.replace('_', ' ').upper())}</b> — {_clean(name.split('/')[-1], 80)}<br/>{_clean(val.get('description'), 300)}"])
        for issue, val in _obj(_obj(binary).get("findings")).items():
            val = _obj(val)
            sev = _norm_sev(val.get("severity"))
            if sev in {"high", "warning"}:
                rows.append([self._sev_cell(sev), f"<b>{_clean(issue, 160)}</b><br/>{_clean(val.get('detailed_desc'), 300)}"])
        if not rows:
            return []
        return self._section("Binary hardening") + [self._table(["Severity", "Finding"], rows[:80], [CONTENT_W * 0.13, CONTENT_W * 0.87])]

    def _privacy(self) -> list[Any]:
        out: list[Any] = []
        trackers = [_obj(t) for t in _arr(_obj(self.report.get("trackers")).get("trackers"))]
        if trackers:
            rows = [[_clean(t.get("name"), 80), _clean(t.get("categories"), 120)] for t in trackers]
            out += self._section(f"Privacy trackers ({len(trackers)})") + [self._table(["Tracker", "Categories"], rows, [CONTENT_W * 0.4, CONTENT_W * 0.6])]
        domains = _obj(self.report.get("domains"))
        bad = [(d, _obj(v)) for d, v in domains.items() if str(_obj(v).get("bad", "")).lower() == "yes" or _obj(v).get("ofac")]
        if domains:
            rows = []
            for d, v in (bad or list((k, _obj(v)) for k, v in domains.items()))[:60]:
                geo = _obj(v.get("geolocation"))
                where = ", ".join(str(x) for x in [geo.get("city"), geo.get("country_long")] if x)
                status = "Malicious" if str(v.get("bad", "")).lower() == "yes" else "OFAC" if v.get("ofac") else "OK"
                rows.append([Paragraph(_clean(d, 90), self.s_td_mono), _clean(where, 80), _clean(status, 20)])
            title = f"Flagged domains ({len(bad)})" if bad else f"Contacted domains ({len(domains)})"
            out += self._section(title) + [self._table(["Domain", "Location", "Status"], rows, [CONTENT_W * 0.5, CONTENT_W * 0.35, CONTENT_W * 0.15])]
        return out

    def _secrets(self) -> list[Any]:
        secrets = [str(s) for s in _arr(self.report.get("secrets"))]
        if not secrets:
            return []
        rows = [[Paragraph(_clean(s, 160), self.s_td_mono)] for s in secrets[:50]]
        note = Paragraph(f"Showing {min(50, len(secrets))} of {len(secrets)} possible hardcoded secrets. Verify and rotate any real credentials.", self.s_muted)
        return self._section("Possible hardcoded secrets") + [note, Spacer(1, 6), self._table(["Value"], rows, [CONTENT_W])]

    # ---------- page chrome ----------

    def _chrome(self, canvas, doc) -> None:
        canvas.saveState()
        canvas.setFillColor(PURPLE)
        canvas.rect(0, A4[1] - 4, A4[0], 4, stroke=0, fill=1)
        canvas.setStrokeColor(GRID)
        canvas.setLineWidth(0.5)
        canvas.line(PAGE_MARGIN, 0.45 * inch, A4[0] - PAGE_MARGIN, 0.45 * inch)
        canvas.setFont(self.font, 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(PAGE_MARGIN, 0.28 * inch, f"Page {doc.page}")
        canvas.drawRightString(A4[0] - PAGE_MARGIN, 0.28 * inch, "VRIKA · Confidential")
        if doc.page > 1:
            canvas.drawString(PAGE_MARGIN, A4[1] - 0.36 * inch, "Mobile Application Security Report")
            canvas.drawRightString(A4[0] - PAGE_MARGIN, A4[1] - 0.36 * inch, _clean(self.report.get("app_name") or self.scan.get("file_name"), 60))
        canvas.restoreState()

    def build(self) -> bytes:
        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf,
            pagesize=A4,
            leftMargin=PAGE_MARGIN,
            rightMargin=PAGE_MARGIN,
            topMargin=PAGE_MARGIN,
            bottomMargin=PAGE_MARGIN,
            title="Vrika Mobile Application Security Report",
            author="VRIKA",
            creator="VRIKA Mobile Security",
        )
        story: list[Any] = []
        story += self._header()
        story += self._metrics()
        story += self._summary()
        story.append(KeepTogether(self._app_info()))
        body = (
            self._scorecard_findings()
            + self._code_findings()
            + self._config_findings()
            + self._permissions()
            + self._certificate()
            + self._binary()
            + self._privacy()
            + self._secrets()
        )
        if body:
            story.append(PageBreak())
            story += body
        doc.build(story, onFirstPage=self._chrome, onLaterPages=self._chrome)
        return buf.getvalue()


def build_mobile_report_pdf(
    report: dict[str, Any],
    scorecard: dict[str, Any] | None,
    scan: dict[str, Any],
    logo_base64: str | None = None,
) -> bytes:
    logo = None
    if logo_base64:
        try:
            logo = base64.b64decode(logo_base64, validate=True)
        except ValueError:
            logo = None
    return MobileReportPdf(report, scorecard, scan, logo).build()

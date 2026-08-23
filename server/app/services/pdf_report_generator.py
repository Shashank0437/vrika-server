"""
server/app/services/pdf_report_generator.py

Generates high-impact, professional Executive and Full PDF security reports
for Vrika Cloud Security scans and Attack Graph generation.
"""

from __future__ import annotations

import io
from datetime import UTC, datetime
from typing import Any, Dict, List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


class NumberedCanvas:
    """Canvas wrapper to draw running header and footer with total page count."""

    def __init__(self, *args: Any, **kwargs: Any):
        pass


def _create_vrika_palette() -> Dict[str, colors.Color]:
    return {
        "primary": colors.HexColor("#7c3aed"),       # Vrika Purple
        "primary_dark": colors.HexColor("#5b21b6"),
        "primary_light": colors.HexColor("#ede9fe"),
        "accent": colors.HexColor("#06b6d4"),        # Cyan
        "dark_bg": colors.HexColor("#0f0a1c"),
        "card_bg": colors.HexColor("#1b132e"),
        "text_dark": colors.HexColor("#1e1b2e"),
        "text_muted": colors.HexColor("#64748b"),
        "border": colors.HexColor("#e2e8f0"),
        "critical": colors.HexColor("#ef4444"),
        "high": colors.HexColor("#f97316"),
        "medium": colors.HexColor("#eab308"),
        "low": colors.HexColor("#38bdf8"),
        "passed": colors.HexColor("#22c55e"),
    }


def generate_executive_pdf_report(
    *,
    organization_name: str,
    provider: str,
    account_id: str,
    account_name: Optional[str] = None,
    scan_id: str,
    compliance_score: int = 100,
    scanned_resources: int = 0,
    findings: Optional[Dict[str, int]] = None,
    attack_paths_count: int = 0,
    top_attack_path: Optional[str] = None,
) -> bytes:
    """Generate a sleek, 2-page Executive PDF Report summary."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40,
    )

    palette = _create_vrika_palette()
    styles = getSampleStyleSheet()

    # Custom typography styles
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=palette["primary_dark"],
        spaceAfter=4,
    )
    subtitle_style = ParagraphStyle(
        "DocSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=14,
        textColor=palette["accent"],
        spaceAfter=14,
        textTransform="uppercase",
    )
    section_heading = ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        textColor=palette["primary_dark"],
        spaceBefore=12,
        spaceAfter=8,
    )
    body_style = ParagraphStyle(
        "BodyDark",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=palette["text_dark"],
    )
    muted_style = ParagraphStyle(
        "BodyMuted",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=palette["text_muted"],
    )
    badge_style = ParagraphStyle(
        "BadgeText",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        alignment=1,  # Center
    )

    story: List[Any] = []

    # 1. Header Banner
    story.append(Paragraph("VRIKA CLOUD SECURITY", subtitle_style))
    story.append(Paragraph("Executive Threat & Posture Report", title_style))
    now_str = datetime.now(UTC).strftime("%B %d, %Y - %H:%M UTC")
    story.append(
        Paragraph(
            f"Generated for <b>{organization_name}</b> | Target Account: <b>{account_id}</b> ({provider.upper()})",
            body_style,
        )
    )
    story.append(Spacer(1, 10))
    story.append(
        HRFlowable(
            width="100%",
            thickness=2,
            color=palette["primary"],
            spaceBefore=4,
            spaceAfter=14,
        )
    )

    # 2. Metadata Grid Table
    acc_display = f"{account_id} ({account_name})" if account_name else account_id
    meta_data = [
        [
            Paragraph("<b>Organization:</b>", body_style),
            Paragraph(organization_name, body_style),
            Paragraph("<b>Cloud Provider:</b>", body_style),
            Paragraph(provider.upper(), body_style),
        ],
        [
            Paragraph("<b>Target Account:</b>", body_style),
            Paragraph(acc_display, body_style),
            Paragraph("<b>Scan Identifier:</b>", body_style),
            Paragraph(scan_id, body_style),
        ],
        [
            Paragraph("<b>Assessment Date:</b>", body_style),
            Paragraph(now_str, body_style),
            Paragraph("<b>Report Classification:</b>", body_style),
            Paragraph("<font color='#ef4444'><b>RESTRICTED / CONFIDENTIAL</b></font>", body_style),
        ],
    ]
    meta_table = Table(meta_data, colWidths=[110, 150, 110, 160])
    meta_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), palette["primary_light"]),
                ("BOX", (0, 0), (-1, -1), 1, palette["border"]),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, palette["border"]),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(meta_table)
    story.append(Spacer(1, 16))

    # 3. Executive KPI Dashboard Cards (Score, Resources, Attack Paths)
    score_color = "#22c55e" if compliance_score >= 80 else ("#eab308" if compliance_score >= 60 else "#ef4444")
    path_color = "#ef4444" if attack_paths_count > 0 else "#22c55e"

    kpi_data = [
        [
            Paragraph(
                f"<font size='18' color='{score_color}'><b>{compliance_score}%</b></font><br/><font size='8' color='#64748b'>COMPLIANCE SCORE</font>",
                ParagraphStyle("KPICenter", alignment=1),
            ),
            Paragraph(
                f"<font size='18' color='#0284c7'><b>{scanned_resources}</b></font><br/><font size='8' color='#64748b'>AUDITED ASSETS</font>",
                ParagraphStyle("KPICenter", alignment=1),
            ),
            Paragraph(
                f"<font size='18' color='{path_color}'><b>{attack_paths_count}</b></font><br/><font size='8' color='#64748b'>EXPLOIT PATHS</font>",
                ParagraphStyle("KPICenter", alignment=1),
            ),
        ]
    ]
    kpi_table = Table(kpi_data, colWidths=[176, 176, 178])
    kpi_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                ("BOX", (0, 0), (-1, -1), 1.5, palette["primary"]),
                ("INNERGRID", (0, 0), (-1, -1), 1, palette["border"]),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 12),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
            ]
        )
    )
    story.append(kpi_table)
    story.append(Spacer(1, 16))

    # 4. Findings Severity Table
    story.append(Paragraph("Findings & Vulnerability Distribution", section_heading))
    f = findings or {"critical": 0, "high": 0, "medium": 0, "low": 0, "passed": 0}
    findings_data = [
        [
            Paragraph("<b>Severity Tier</b>", body_style),
            Paragraph("<b>Count</b>", body_style),
            Paragraph("<b>Posture Impact</b>", body_style),
            Paragraph("<b>Action SLA</b>", body_style),
        ],
        [
            Paragraph("<font color='#ef4444'><b>CRITICAL</b></font>", body_style),
            str(f.get("critical", 0)),
            "Immediate exploit risk / public data exposure",
            "Within 24 Hours",
        ],
        [
            Paragraph("<font color='#f97316'><b>HIGH</b></font>", body_style),
            str(f.get("high", 0)),
            "Privilege escalation & unsegmented boundaries",
            "Within 7 Days",
        ],
        [
            Paragraph("<font color='#eab308'><b>MEDIUM</b></font>", body_style),
            str(f.get("medium", 0)),
            "Non-compliant configuration & telemetry gaps",
            "Within 30 Days",
        ],
        [
            Paragraph("<font color='#38bdf8'><b>LOW / INFO</b></font>", body_style),
            str(f.get("low", 0)),
            "Minor deviations & hardening opportunities",
            "Next Maintenance Cycle",
        ],
        [
            Paragraph("<font color='#22c55e'><b>PASSED CHECKS</b></font>", body_style),
            str(f.get("passed", 0)),
            "Compliant controls aligned with CIS & NIST",
            "Maintained",
        ],
    ]
    findings_table = Table(findings_data, colWidths=[100, 60, 240, 130])
    findings_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), palette["primary_light"]),
                ("TEXTCOLOR", (0, 0), (-1, 0), palette["primary_dark"]),
                ("BOX", (0, 0), (-1, -1), 1, palette["border"]),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, palette["border"]),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ]
        )
    )
    story.append(findings_table)
    story.append(Spacer(1, 16))

    # 5. Attack Graph & Breach Chain Highlight
    story.append(Paragraph("Attack Graph & Threat Path Analysis", section_heading))
    if top_attack_path:
        attack_box_data = [
            [
                Paragraph(
                    f"<b>Top Critical Exploit Chain:</b><br/>"
                    f"<font color='#831843' face='Courier-Bold'><b>{top_attack_path}</b></font><br/><br/>"
                    f"<font color='#64748b' size='8'>This attack path correlates misconfigurations, IAM roles, and network exposure "
                    f"to construct an adversary's probable movement vector into high-value assets.</font>",
                    body_style,
                )
            ]
        ]
        attack_table = Table(attack_box_data, colWidths=[530])
        attack_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fdf2f8")),
                    ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#f472b6")),
                    ("TOPPADDING", (0, 0), (-1, -1), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                    ("LEFTPADDING", (0, 0), (-1, -1), 12),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ]
            )
        )
        story.append(attack_table)
    else:
        story.append(
            Paragraph(
                "No critical end-to-end multi-step breach paths detected during this scan interval.",
                body_style,
            )
        )

    story.append(Spacer(1, 14))

    # 6. Strategic Recommendations
    story.append(Paragraph("Immediate Remediation Priorities", section_heading))
    recs = [
        "1. <b>Sever Public Exposure:</b> Restrict ingress security group rules exposing SSH (22) and RDP (3389) to the public internet.",
        "2. <b>Enforce Least Privilege:</b> Audit IAM roles possessing wildcard `*` permissions attached to compute instances.",
        "3. <b>Enable Bucket Protection:</b> Ensure object storage buckets enforce default SSE-KMS encryption and public access blocks.",
        "4. <b>Audit Logs & Retention:</b> Confirm CloudTrail / Audit Logs are enabled across all active regions with log file integrity validation.",
    ]
    for r in recs:
        story.append(Paragraph(r, body_style))
        story.append(Spacer(1, 3))

    # 7. Footer
    story.append(Spacer(1, 20))
    story.append(
        HRFlowable(
            width="100%",
            thickness=1,
            color=palette["border"],
            spaceBefore=6,
            spaceAfter=8,
        )
    )
    story.append(
        Paragraph(
            f"Vrika Cloud Security Platform | Executive Security Summary | Confidential to {organization_name}",
            muted_style,
        )
    )

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()

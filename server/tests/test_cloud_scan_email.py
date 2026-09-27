"""Cloud email rendering and dispatch, without real scans or outbound email."""

import asyncio
from email import message_from_string
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from bson import ObjectId

from app.constants import ORGANIZATIONS_COLLECTION, USERS_COLLECTION
from app.services import brevo_email, cloud_scan_notifications, smtp_service


@pytest.fixture
def email_context():
    return {
        "organization_name": "Example Organization",
        "provider": "azure",
        "account_id": "example-subscription",
        "account_name": "Example account",
        "scan_id": "12345678-example-scan",
        "compliance_score": 67,
        "scanned_resources": 123,
        "findings": {"critical": 2, "high": 3, "medium": 4, "low": 5},
        "attack_paths_count": 0,
        "dashboard_url": "https://example.test/dashboard/cloud-security",
        "completed_at": "2026-01-01 12:00 UTC",
    }


@pytest.mark.parametrize(
    ("provider", "label"),
    [
        ("aws", "Amazon Web Services"),
        ("azure", "Microsoft Azure"),
        ("Azure", "Microsoft Azure"),
        ("gcp", "Google Cloud"),
        ("google", "Google Cloud"),
        ("googlecloud", "Google Cloud"),
        ("kubernetes", "Kubernetes"),
        ("k8s", "Kubernetes"),
        ("docker", "Container Registry"),
        ("image", "Container Registry"),
        ("oci", "OCI"),
    ],
)
def test_provider_header_is_image_independent(email_context, provider, label):
    subject, html, text = cloud_scan_notifications.render_cloud_scan_email(
        **{**email_context, "provider": provider}
    )
    assert label in html
    assert "VRIKA" in html
    assert "Cloud Security" in html
    assert "<img" not in html.lower()
    assert "<svg" not in html.lower()
    assert "data:image" not in html.lower()
    assert "cid:" not in html.lower()
    assert len(html.encode("utf-8")) < 20 * 1024
    assert subject == f"Vrika Cloud Scan Complete — {provider.upper()} (example-subscription)"
    for value in ("Example Organization", "example-subscription", "67%", "123"):
        assert value in html
    assert email_context["dashboard_url"] in html
    assert "12345678-exam" in html
    assert "2026-01-01 12:00 UTC" in html
    assert "Executive Summary" in html
    assert "Technical Findings Report" in html
    assert "example-subscription" in text


@pytest.mark.parametrize(
    ("findings", "status"),
    [
        ({"critical": 2, "high": 3, "medium": 4, "low": 5}, "ACTION REQUIRED"),
        ({"critical": 0, "high": 3}, "REVIEW NEEDED"),
        ({}, "PASSED"),
    ],
)
def test_findings_status_is_preserved(email_context, findings, status):
    _, html, _ = cloud_scan_notifications.render_cloud_scan_email(
        **{**email_context, "findings": findings}
    )
    assert status in html
    for other_status in ("ACTION REQUIRED", "REVIEW NEEDED", "PASSED"):
        if other_status != status:
            assert other_status not in html


def test_header_escapes_untrusted_labels(email_context):
    _, html, _ = cloud_scan_notifications.render_cloud_scan_email(
        **{
            **email_context,
            "provider": '<img src="x" onerror="alert(1)">',
            "organization_name": "<script>example</script>",
            "account_name": "R&D <account>",
        }
    )
    assert "<img" not in html.lower()
    assert "<script" not in html.lower()
    assert "&lt;IMG" in html
    assert "&lt;script&gt;example&lt;/script&gt;" in html
    assert "R&amp;D &lt;account&gt;" in html


@pytest.mark.parametrize("transport", ["smtp", "brevo"])
def test_notification_dispatch_preserves_readable_email(
    monkeypatch, email_context, transport
):
    org_id = ObjectId()
    organizations = MagicMock()
    organizations.find_one = AsyncMock(return_value={"name": "Example Organization"})
    users = MagicMock()
    users.find.return_value.__aiter__.return_value = [
        {"email": "teammate@example.test"}
    ]
    db = MagicMock()
    db.__getitem__.side_effect = {
        ORGANIZATIONS_COLLECTION: organizations,
        USERS_COLLECTION: users,
    }.__getitem__
    smtp_config = {
        "enabled": True,
        "host": "smtp.example.test",
        "port": 2525,
        "security": "none",
        "from_email": "no-reply@example.test",
    }
    monkeypatch.setattr(
        smtp_service,
        "get_org_smtp_config",
        AsyncMock(return_value=smtp_config if transport == "smtp" else None),
    )
    smtp = MagicMock()
    monkeypatch.setattr(smtp_service.smtplib, "SMTP", smtp)
    brevo = AsyncMock()
    monkeypatch.setattr(brevo_email, "send_transactional_email", brevo)
    settings = SimpleNamespace(
        frontend_url="https://example.test",
        brevo_api_key="test-only",
        brevo_sender_email="no-reply@example.test",
    )
    attachments = [
        {"filename": "executive.pdf", "content": b"%PDF-executive"},
        {"filename": "technical.pdf", "content": b"%PDF-technical"},
    ]
    context = {
        key: value
        for key, value in email_context.items()
        if key not in ("organization_name", "dashboard_url", "completed_at")
    }
    result = asyncio.run(
        cloud_scan_notifications.send_cloud_scan_completed_notification(
            db,
            settings,
            org_id=org_id,
            scanner_email="Scanner@example.test",
            pdf_attachments=attachments,
            **context,
        )
    )
    assert result["status"] == "sent"
    if transport == "smtp":
        brevo.assert_not_awaited()
        send = smtp.return_value.__enter__.return_value.sendmail
        send.assert_called_once()
        _, recipients, wire_message = send.call_args.args
        assert recipients == ["scanner@example.test", "teammate@example.test"]
        message = message_from_string(wire_message)
        assert message["To"] == "scanner@example.test"
        assert message["Cc"] == "teammate@example.test"
        parts = list(message.walk())
        html = next(p for p in parts if p.get_content_type() == "text/html")
        html = html.get_payload(decode=True).decode("utf-8")
        assert any(p.get_content_type() == "text/plain" for p in parts)
        assert {
            p.get_filename(): p.get_payload(decode=True)
            for p in parts
            if p.get_content_disposition() == "attachment"
        } == {a["filename"]: a["content"] for a in attachments}
    else:
        smtp.assert_not_called()
        brevo.assert_awaited_once()
        assert brevo.call_args.kwargs["to_addresses"] == [
            "scanner@example.test",
            "teammate@example.test",
        ]
        html = brevo.call_args.kwargs["html"]
        assert "example-subscription" in brevo.call_args.kwargs["text"]
    assert "Microsoft Azure" in html
    assert "VRIKA" in html
    assert "<img" not in html
    assert "data:image" not in html

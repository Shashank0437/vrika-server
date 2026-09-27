import asyncio
import base64
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from bson import ObjectId
from fastapi import BackgroundTasks
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

from app.db import get_database
from app.dependencies.auth import require_auth_user
from app.main import app
from app.routers import internal_config
from app.services import cloud_scan_notifications as mail


@pytest.fixture
def workspace(monkeypatch):
    db = AsyncMongoMockClient().project_email_tests
    org, foreign_org, project, other_project = (ObjectId() for _ in range(4))
    provider, other_provider, foreign_provider, tenant = (str(uuid4()) for _ in range(4))

    def binding(role, scope_type="project", scope_id=None):
        return {"role": role, "scope_type": scope_type, "scope_id": scope_id or str(project)}

    def user(name, bindings, organization_id=org, **extra):
        return {
            "_id": ObjectId(), "email": f"{name}@example.test",
            "organization_id": organization_id, "role_bindings": bindings, **extra,
        }

    users = {
        role: user(role, [binding(role)]) for role in ("viewer", "analyst", "lead")
    }
    users.update({
        "roster_cloud": user("roster-cloud", [binding("analyst", "module", "cloud_security")]),
        "roster_admin": user("roster-admin", [{"role": "admin", "scope_type": "global", "scope_id": None}]),
        "owner": user("owner", [{"role": "admin", "scope_type": "global", "scope_id": None}]),
        "legacy_admin": user("legacy-admin", [], roles=["tenant_admin"]),
        "demoted_admin": user("demoted-admin", [], roles=["tenant_admin"]),
        "pending_admin": user(
            "pending-admin", [{"role": "admin", "scope_type": "global", "scope_id": None}],
            pending_access_change={"bindings": []},
        ),
        "foreign_admin": user(
            "foreign-admin", [{"role": "admin", "scope_type": "global", "scope_id": None}],
            organization_id=foreign_org,
        ),
        "module": user("module", [binding("viewer", "module", "cloud_security")]),
        "other": user("other", [binding("viewer", scope_id=str(other_project))]),
        "web": user("web", [binding("analyst", "module", "web_security")]),
        "no_access": user("no-access", []),
        "pending": user("pending", [binding("lead")], pending_access_change={"bindings": []}),
        "foreign": user("foreign", [binding("lead")], organization_id=foreign_org),
        "duplicate": user("duplicate", [binding("viewer")]),
    })
    users["legacy_admin"].pop("role_bindings")
    users["duplicate"]["email"] = " VIEWER@example.test "
    roster = [str(users[key]["_id"]) for key in ("roster_cloud", "roster_admin", "web", "no_access")]

    async def seed():
        await db.organizations.insert_one({"_id": org, "name": "Example"})
        await db.projects.insert_many([
            {"_id": project, "organization_id": org, "name": "SECOPS",
             "cloud_provider_ids": [provider], "member_ids": roster},
            {"_id": other_project, "organization_id": org, "name": "OTHER",
             "cloud_provider_ids": [other_provider], "member_ids": []},
            {"_id": ObjectId(), "organization_id": foreign_org, "name": "Foreign",
             "cloud_provider_ids": [foreign_provider], "member_ids": []},
        ])
        await db.users.insert_many(list(users.values()))
        await db.prowler_tenant_links.insert_one({
            "prowler_tenant_id": tenant,
            "vrika_organization_id": org,
            "prowler_owner_email": users["owner"]["email"],
        })

    asyncio.run(seed())
    send = AsyncMock(return_value={"status": "sent"})
    monkeypatch.setattr(mail, "send_mail_for_org", send)
    monkeypatch.setattr(
        "app.services.pdf_report_generator.generate_executive_pdf_report",
        lambda **kwargs: b"%PDF-unit-test",
    )
    settings = SimpleNamespace(frontend_url="https://example.test")
    allowed = {
        users[key]["email"]
        for key in ("viewer", "analyst", "lead", "roster_cloud", "roster_admin", "owner", "legacy_admin")
    }
    return SimpleNamespace(
        db=db, org=org, project=project, provider=provider, other_provider=other_provider,
        foreign_provider=foreign_provider, tenant=tenant, users=users, send=send,
        settings=settings, allowed=allowed,
    )


def recipients(call):
    return {call.kwargs["to"], *(call.kwargs.get("cc") or [])}


@pytest.mark.parametrize("scanner", ["owner", "viewer", "module"])
@pytest.mark.parametrize("kind", ["report", "attack"])
def test_only_authorized_project_members_and_org_admins_receive_mail(workspace, scanner, kind):
    w = workspace
    send = (mail.send_cloud_scan_completed_notification if kind == "report"
            else mail.send_attack_paths_completed_notification)
    asyncio.run(send(
        w.db, w.settings, org_id=w.org, provider_id=w.provider,
        scanner_email=w.users[scanner]["email"], provider="azure",
        account_id="same-account", scan_id=str(uuid4()),
    ))
    w.send.assert_awaited_once()
    assert recipients(w.send.call_args) == w.allowed
    if scanner == "viewer":
        assert w.send.call_args.kwargs["to"] == "viewer@example.test"
    assert "SECOPS" in w.send.call_args.kwargs["html_body"]
    assert "Project: SECOPS" in w.send.call_args.kwargs["body"]


def test_different_project_receives_its_members_plus_org_admins(workspace):
    w = workspace
    _, to, cc = asyncio.run(mail.resolve_project_recipients(
        w.db, w.org, w.other_provider, w.users["owner"]["email"]
    ))
    assert {to, *cc} == {
        "other@example.test", "owner@example.test", "roster-admin@example.test",
        "legacy-admin@example.test",
    }


def test_admin_receives_when_project_has_no_other_eligible_members(workspace):
    w = workspace
    asyncio.run(w.db.users.delete_many({"_id": {"$ne": w.users["owner"]["_id"]}}))
    _, to, cc = asyncio.run(mail.resolve_project_recipients(w.db, w.org, w.provider))
    assert to == "owner@example.test"
    assert cc == []


def test_retry_excludes_newly_demoted_admin(workspace):
    w = workspace

    async def first_send(*args, **kwargs):
        if w.send.await_count == 1:
            await w.db.users.update_one(
                {"_id": w.users["owner"]["_id"]},
                {"$set": {"role_bindings": [], "roles": ["tenant_admin"]}},
            )
            raise RuntimeError("SMTP attachment failure")
        return {"status": "sent"}

    w.send.side_effect = first_send
    asyncio.run(mail.send_cloud_scan_completed_notification(
        w.db, w.settings, org_id=w.org, provider_id=w.provider,
        scanner_email="owner@example.test", provider="azure",
        account_id="same-account", scan_id=str(uuid4()),
    ))
    assert w.send.await_count == 2
    assert recipients(w.send.call_args_list[0]) == w.allowed
    assert recipients(w.send.call_args_list[1]) == w.allowed - {"owner@example.test"}


@pytest.mark.parametrize("case", ["unassigned", "foreign", "ambiguous", "empty"])
def test_unsafe_routing_blocks_without_organization_fallback(workspace, case):
    w = workspace
    provider = w.provider

    async def prepare():
        if case == "ambiguous":
            await w.db.projects.insert_one({
                "organization_id": w.org, "name": "Duplicate",
                "cloud_provider_ids": [w.provider],
            })
        elif case == "empty":
            await w.db.users.delete_many({"organization_id": w.org})

    asyncio.run(prepare())
    if case == "unassigned":
        provider = str(uuid4())
    elif case == "foreign":
        provider = w.foreign_provider
    with pytest.raises(mail.NotificationRoutingError):
        asyncio.run(mail.send_cloud_scan_completed_notification(
            w.db, w.settings, org_id=w.org, provider_id=provider,
            scanner_email=w.users["owner"]["email"], provider="aws",
            account_id="same-account", scan_id=str(uuid4()),
        ))
    w.send.assert_not_awaited()


def test_retry_rechecks_membership(workspace):
    w = workspace

    async def first_send(*args, **kwargs):
        if w.send.await_count == 1:
            await w.db.users.delete_many({"email": {"$in": [
                "viewer@example.test", " VIEWER@example.test ",
            ]}})
            raise RuntimeError("SMTP attachment failure")
        return {"status": "sent"}

    w.send.side_effect = first_send
    asyncio.run(mail.send_cloud_scan_completed_notification(
        w.db, w.settings, org_id=w.org, provider_id=w.provider,
        scanner_email="viewer@example.test", provider="gcp",
        account_id="same-account", scan_id=str(uuid4()),
    ))
    assert w.send.await_count == 2
    assert recipients(w.send.call_args_list[0]) == w.allowed
    assert recipients(w.send.call_args_list[1]) == w.allowed - {"viewer@example.test"}


def test_retry_blocks_if_provider_project_changes(workspace):
    w = workspace

    async def fail_and_move(*args, **kwargs):
        await w.db.projects.update_one(
            {"_id": w.project}, {"$set": {"cloud_provider_ids": []}}
        )
        await w.db.projects.update_one(
            {"cloud_provider_ids": w.other_provider},
            {"$push": {"cloud_provider_ids": w.provider}},
        )
        raise RuntimeError("SMTP unavailable")

    w.send.side_effect = fail_and_move
    with pytest.raises(mail.NotificationRoutingError, match="project changed"):
        asyncio.run(mail.send_cloud_scan_completed_notification(
            w.db, w.settings, org_id=w.org, provider_id=w.provider,
            scanner_email="viewer@example.test", provider="gcp",
            account_id="same-account", scan_id=str(uuid4()),
        ))
    w.send.assert_awaited_once()
    assert recipients(w.send.call_args) == w.allowed


@pytest.fixture
def client(workspace):
    app.dependency_overrides[get_database] = lambda: workspace.db
    app.dependency_overrides[internal_config._require_internal_secret] = lambda: None
    app.dependency_overrides[require_auth_user] = lambda: workspace.users["lead"]
    yield TestClient(app)
    app.dependency_overrides.clear()


def payload(w):
    return {
        "prowler_tenant_id": w.tenant, "scan_id": str(uuid4()),
        "provider_id": w.provider, "provider": "azure", "account_id": "same-account",
        "executive_pdf_base64": base64.b64encode(b"%PDF-executive").decode(),
        "full_pdf_base64": base64.b64encode(b"%PDF-technical").decode(),
    }


@pytest.mark.parametrize("endpoint", ["notify-scan-completed", "notify-attack-paths-completed"])
def test_internal_endpoints_route_only_to_project(workspace, client, endpoint):
    response = client.post(f"/internal/{endpoint}", json=payload(workspace))
    assert response.status_code == (202 if endpoint == "notify-scan-completed" else 200)
    workspace.send.assert_awaited_once()
    assert recipients(workspace.send.call_args) == workspace.allowed
    if endpoint == "notify-scan-completed":
        assert [a["content"] for a in workspace.send.call_args.kwargs["attachments"]] == [
            b"%PDF-executive", b"%PDF-technical",
        ]


@pytest.mark.parametrize("endpoint", [
    "/internal/notify-scan-completed",
    "/internal/notify-attack-paths-completed",
    "/auth/cloud-security/notify-scan-completed",
])
@pytest.mark.parametrize("case,status", [
    ("missing_provider", 422), ("invalid_provider", 422),
    ("unassigned", 409), ("foreign", 409), ("empty", 409),
])
def test_endpoints_reject_unresolvable_scope(workspace, client, endpoint, case, status):
    data = payload(workspace)
    if case == "missing_provider":
        data.pop("provider_id")
    elif case == "invalid_provider":
        data["provider_id"] = "not-a-uuid"
    elif case == "unassigned":
        data["provider_id"] = str(uuid4())
    elif case == "foreign":
        data["provider_id"] = workspace.foreign_provider
    else:
        asyncio.run(workspace.db.users.delete_many({"organization_id": workspace.org}))
    response = client.post(endpoint, json=data)
    assert response.status_code == status, response.text
    workspace.send.assert_not_awaited()


@pytest.mark.parametrize("actor,status", [("lead", 200), ("other", 403), ("viewer", 403)])
def test_manual_api_checks_project_execute_permission(workspace, client, actor, status):
    app.dependency_overrides[require_auth_user] = lambda: workspace.users[actor]
    response = client.post(
        "/auth/cloud-security/notify-scan-completed", json=payload(workspace)
    )
    assert response.status_code == status, response.text
    if status == 200:
        assert recipients(workspace.send.call_args) == workspace.allowed
    else:
        workspace.send.assert_not_awaited()


def test_queued_email_rechecks_project_membership(workspace, caplog):
    w = workspace

    async def run():
        background = BackgroundTasks()
        result = await internal_config.internal_notify_scan_completed(
            internal_config.InternalNotifyScanCompletedIn(**payload(w)),
            background, w.db, w.settings,
        )
        assert result["status"] == "accepted"
        await w.db.users.delete_many({"organization_id": w.org})
        await background()

    asyncio.run(run())
    w.send.assert_not_awaited()
    assert "notification failed to send" in caplog.text


def test_owner_email_is_not_required_for_project_delivery(workspace, client):
    asyncio.run(workspace.db.prowler_tenant_links.update_one(
        {"prowler_tenant_id": workspace.tenant}, {"$unset": {"prowler_owner_email": ""}}
    ))
    response = client.post("/internal/notify-scan-completed", json=payload(workspace))
    assert response.status_code == 202, response.text
    assert recipients(workspace.send.call_args) == workspace.allowed

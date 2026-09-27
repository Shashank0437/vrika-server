import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import get_database
from app.dependencies.auth import require_auth_user
from app.main import app
from app.services import access_management, cloud_access


@pytest.fixture
def workspace(monkeypatch):
    db = AsyncMongoMockClient().access_tests
    org, other_org, project1, project2 = (ObjectId() for _ in range(4))
    viewer = {
        "_id": ObjectId(),
        "organization_id": org,
        "email": "viewer@example.test",
        "roles": ["tenant_member"],
        "role_bindings": [
            {"role": "viewer", "scope_type": "global", "scope_id": None},
        ],
    }
    lead = {
        **viewer,
        "_id": ObjectId(),
        "email": "lead@example.test",
        "role_bindings": [
            {"role": "lead", "scope_type": "project", "scope_id": str(project1)},
        ],
    }
    admin = {
        **viewer,
        "_id": ObjectId(),
        "email": "admin@example.test",
        "roles": ["tenant_admin"],
        "role_bindings": [
            {"role": "admin", "scope_type": "global", "scope_id": None},
        ],
    }

    async def seed():
        await db.users.insert_many([viewer.copy(), lead.copy(), admin.copy()])
        await db.projects.insert_many(
            [
                {"_id": project1, "organization_id": org, "name": "One"},
                {"_id": project2, "organization_id": org, "name": "Two"},
            ]
        )
        from datetime import UTC, datetime

        now = datetime.now(UTC)
        for organization_id, project_id in [
            (org, str(project1)),
            (org, str(project2)),
            (org, None),
            (other_org, str(project1)),
        ]:
            await db.agent_chat_sessions.insert_one(
                {
                    "organization_id": organization_id,
                    "project_id": project_id,
                    "user_id": admin["_id"],
                    "title": project_id or "Unassigned",
                    "created_at": now,
                    "updated_at": now,
                }
            )

    asyncio.run(seed())
    app.dependency_overrides[get_database] = lambda: db

    def use(user):
        app.dependency_overrides[require_auth_user] = lambda: user

    use(viewer)
    lock = AsyncMock()
    lock.acquire.return_value = True

    class Redis:
        def lock(self, *args, **kwargs):
            return lock

    monkeypatch.setattr(access_management, "get_redis", lambda: Redis())
    monkeypatch.setattr(cloud_access, "sync_cloud_access", AsyncMock(return_value=None))
    yield TestClient(app), db, use, viewer, lead, admin, project1, project2
    app.dependency_overrides.clear()


def test_viewer_reads_all_org_chats_but_cannot_create_or_edit(workspace):
    client, db, _, _, _, _, _, _ = workspace
    response = client.get("/workspace/agent-chat/sessions")
    assert response.status_code == 200, response.text
    assert len(response.json()) == 3
    assert (
        client.post(
            "/workspace/agent-chat/sessions", json={"title": "Denied"}
        ).status_code
        == 403
    )
    sid = response.json()[0]["id"]
    assert client.delete(f"/workspace/agent-chat/sessions/{sid}").status_code == 403
    assert (
        client.post(f"/workspace/agent-chat/sessions/{sid}/analyze").status_code == 403
    )
    assert client.get("/tenant/members").status_code == 200
    assert (
        client.post(
            "/tenant/invitations", json={"email": "x@example.test", "username": "X"}
        ).status_code
        == 403
    )


def test_lead_lists_only_own_project_and_cannot_reassign_or_escalate(workspace):
    client, db, use, _, lead, _, project1, project2 = workspace
    use(lead)
    response = client.get("/workspace/agent-chat/sessions")
    assert response.status_code == 200, response.text
    assert len(response.json()) == 1
    assert response.json()[0]["project_id"] == str(project1)
    assert (
        client.post(
            "/workspace/agent-chat/sessions", json={"title": "Denied"}
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/workspace/agent-chat/sessions", json={"project_id": str(project2)}
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/workspace/agent-chat/sessions", json={"project_id": str(project1)}
        ).status_code
        == 200
    )
    assert (
        client.put(
            f"/tenant/members/{lead['_id']}/bindings",
            json={"role_bindings": [], "expected_version": 0},
        ).status_code
        == 403
    )
    assert (
        client.put(f"/projects/{project2}/members", json={"member_ids": []}).status_code
        == 403
    )
    assert (
        client.put(
            f"/projects/{project1}/members", json={"member_ids": [str(lead["_id"])]}
        ).status_code
        == 200
    )


def test_last_admin_and_stale_version_and_cross_org_protection(workspace):
    client, db, use, viewer, _, admin, _, _ = workspace
    use(admin)
    endpoint = f"/tenant/members/{admin['_id']}/bindings"
    assert (
        client.put(
            endpoint, json={"role_bindings": [], "expected_version": 0}
        ).status_code
        == 400
    )
    assert (
        client.put(
            f"/tenant/members/{viewer['_id']}/bindings",
            json={"role_bindings": [], "expected_version": 9},
        ).status_code
        == 409
    )
    assert (
        client.put(
            f"/tenant/members/{ObjectId()}/bindings",
            json={"role_bindings": [], "expected_version": 0},
        ).status_code
        == 404
    )
    response = client.put(
        f"/tenant/members/{viewer['_id']}/bindings",
        json={"role_bindings": [], "expected_version": 0},
    )
    assert response.status_code == 200, response.text
    assert response.json()["access_version"] == 1
    assert response.json()["role_bindings"] == []
    updated = asyncio.run(db.users.find_one({"_id": viewer["_id"]}))
    use(updated)
    assert client.get("/workspace/agent-chat/sessions").status_code == 403


def test_cloud_sync_failure_does_not_report_success_or_save_bindings(
    workspace, monkeypatch
):
    from fastapi import HTTPException

    client, db, use, viewer, _, admin, _, _ = workspace
    use(admin)
    monkeypatch.setattr(
        cloud_access,
        "sync_cloud_access",
        AsyncMock(side_effect=HTTPException(503, "Cloud unavailable")),
    )
    response = client.put(
        f"/tenant/members/{viewer['_id']}/bindings",
        json={"role_bindings": [], "expected_version": 0},
    )
    assert response.status_code == 503
    updated = asyncio.run(db.users.find_one({"_id": viewer["_id"]}))
    assert updated["role_bindings"] == viewer["role_bindings"]
    assert updated["pending_access_change"]["bindings"] == []


def test_interrupted_mongo_save_recovers_without_duplicate_audit(
    workspace, monkeypatch
):
    from pymongo.errors import AutoReconnect

    client, db, use, viewer, _, admin, _, _ = workspace
    use(admin)
    collection_type = type(db.users)
    original_update = collection_type.update_one

    async def fail_commit(collection, query, update, **kwargs):
        if collection.name == "users" and "$unset" in update:
            raise AutoReconnect("simulated interrupted commit")
        return await original_update(collection, query, update, **kwargs)

    monkeypatch.setattr(collection_type, "update_one", fail_commit)
    response = client.put(
        f"/tenant/members/{viewer['_id']}/bindings",
        json={"role_bindings": [], "expected_version": 0},
    )
    assert response.status_code == 503
    pending = asyncio.run(db.users.find_one({"_id": viewer["_id"]}))
    assert pending["role_bindings"] == viewer["role_bindings"]
    assert pending["pending_access_change"]["version"] == 1
    monkeypatch.setattr(collection_type, "update_one", original_update)
    recovered = asyncio.run(access_management.resume_pending_access(db, pending))
    assert recovered["role_bindings"] == []
    assert recovered["access_version"] == 1
    assert "pending_access_change" not in recovered
    assert asyncio.run(db.access_audit.count_documents({})) == 1
    saved = asyncio.run(db.users.find_one({"_id": viewer["_id"]}))
    assert "pending_access_change" not in saved
    assert cloud_access.sync_cloud_access.await_count == 2


def test_cloud_provisioning_retries_with_same_encrypted_credential(
    workspace, monkeypatch
):
    from fastapi import HTTPException

    from app.config import get_settings
    from app.services.prowler_bridge import _provision_additional_org_user

    _, db, _, viewer, _, _, _, _ = workspace
    synchronize = AsyncMock(
        side_effect=[
            HTTPException(503, "Interrupted provisioning"),
            {"access": "test-access", "refresh": "test-refresh"},
        ]
    )
    monkeypatch.setattr(cloud_access, "sync_cloud_access", synchronize)

    async def retry():
        arguments = {"user": viewer, "org_link": {"prowler_tenant_id": "test-tenant"}}
        with pytest.raises(HTTPException):
            await _provision_additional_org_user(db, get_settings(), **arguments)
        pending = await db.prowler_provisioning.find_one({"_id": viewer["_id"]})
        first_password = synchronize.call_args.kwargs["provision"]["password"]
        assert pending["password_enc"] != first_password
        await _provision_additional_org_user(db, get_settings(), **arguments)
        assert synchronize.call_args.kwargs["provision"]["password"] == first_password
        assert await db.prowler_provisioning.count_documents({}) == 0
        assert (
            await db.prowler_user_links.count_documents(
                {"vrika_user_id": viewer["_id"]}
            )
            == 1
        )

    asyncio.run(retry())

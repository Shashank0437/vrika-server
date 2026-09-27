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
            {"role": "viewer", "scope_type": "module", "scope_id": "web_security"},
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
    assert client.get("/tenant/members").status_code == 403
    assert (
        client.post(
            "/tenant/invitations", json={"email": "x@example.test", "username": "X"}
        ).status_code
        == 403
    )


@pytest.mark.parametrize("role", ["viewer", "analyst", "lead"])
def test_lead_assigns_only_current_project_binding(workspace, role):
    client, db, use, viewer, lead, admin, project1, project2 = workspace
    other = {"role": "analyst", "scope_type": "project", "scope_id": str(project2)}
    original = [*viewer["role_bindings"], other]
    asyncio.run(db.users.update_one(
        {"_id": viewer["_id"]}, {"$set": {"role_bindings": original}}
    ))
    use(lead)
    endpoint = f"/projects/{project1}/members/{viewer['_id']}/role"
    response = client.put(endpoint, json={"role": role, "expected_version": 0})
    assert response.status_code == 200, response.text
    assert response.json()["role"] == role
    assert "role_bindings" not in response.json()
    saved = asyncio.run(db.users.find_one({"_id": viewer["_id"]}))
    assert saved["role_bindings"] == [
        *original, {"role": role, "scope_type": "project", "scope_id": str(project1)}
    ]
    project = asyncio.run(db.projects.find_one({"_id": project1}))
    assert str(viewer["_id"]) in project["member_ids"]
    assert client.put(endpoint, json={"role": "viewer", "expected_version": 0}).status_code == 409
    response = client.put(endpoint, json={"role": None, "expected_version": 1})
    assert response.status_code == 200
    saved = asyncio.run(db.users.find_one({"_id": viewer["_id"]}))
    assert saved["role_bindings"] == original
    assert not response.json()["is_member"]
    # An administrator's broader privilege survives project-role changes.
    response = client.put(
        f"/projects/{project1}/members/{admin['_id']}/role",
        json={"role": "viewer", "expected_version": 0},
    )
    assert response.status_code == 200
    saved = asyncio.run(db.users.find_one({"_id": admin["_id"]}))
    assert admin["role_bindings"][0] in saved["role_bindings"]


def test_project_role_management_denies_escalation_and_rechecks_actor(workspace):
    client, db, use, viewer, lead, _, project1, project2 = workspace
    use(lead)
    endpoint = f"/projects/{project1}/members/{viewer['_id']}/role"
    assert client.get(f"/projects/{project1}/member-roles").status_code == 200
    assert client.get(f"/projects/{project2}/member-roles").status_code == 403
    assert client.put(endpoint, json={"role": "admin", "expected_version": 0}).status_code == 422
    assert client.put(endpoint, json={
        "role": "lead", "expected_version": 0, "scope_id": str(project2)
    }).status_code == 422
    assert client.put(
        f"/projects/{project2}/members/{viewer['_id']}/role",
        json={"role": "lead", "expected_version": 0},
    ).status_code == 403
    assert client.put(
        f"/projects/{project1}/members/{ObjectId()}/role",
        json={"role": "viewer", "expected_version": 0},
    ).status_code == 404
    asyncio.run(db.users.update_one(
        {"_id": lead["_id"]}, {"$set": {"role_bindings": []}}
    ))
    # The dependency still contains the stale Lead; the lock-protected check must reject it.
    assert client.put(endpoint, json={"role": "viewer", "expected_version": 0}).status_code == 403


@pytest.mark.parametrize("role", ["viewer", "analyst"])
def test_project_viewers_and_analysts_cannot_manage_roles(workspace, role):
    client, db, use, viewer, lead, _, project1, _ = workspace
    scoped = {**viewer, "role_bindings": [
        {"role": role, "scope_type": "project", "scope_id": str(project1)}
    ]}
    asyncio.run(db.users.update_one({"_id": viewer["_id"]}, {"$set": scoped}))
    use(scoped)
    rows = client.get("/workspace/agent-chat/sessions")
    assert rows.status_code == 200 and len(rows.json()) == 1
    assert client.get(f"/projects/{project1}/member-roles").status_code == 403
    assert client.put(
        f"/projects/{project1}/members/{lead['_id']}/role",
        json={"role": "viewer", "expected_version": 0},
    ).status_code == 403
    response = client.post("/workspace/agent-chat/sessions", json={"project_id": str(project1)})
    assert response.status_code == (200 if role == "analyst" else 403)


def test_new_global_viewer_grants_are_rejected(workspace):
    client, _, use, viewer, _, admin, _, _ = workspace
    use(admin)
    assert client.put(
        f"/tenant/members/{viewer['_id']}/bindings",
        json={"role_bindings": [{"role": "viewer", "scope_type": "global", "scope_id": None}],
              "expected_version": 0},
    ).status_code == 400
    assert client.post(
        "/tenant/invitations",
        json={"email": "new@example.com", "username": "New",
              "role_bindings": [{"role": "viewer", "scope_type": "global", "scope_id": None}]},
    ).status_code == 400


def test_new_sessions_require_a_real_project_even_for_administrators(workspace):
    client, db, use, _, _, admin, project1, _ = workspace
    use(admin)
    before = asyncio.run(db.agent_chat_sessions.count_documents({}))
    for body in ({}, {"project_id": None}, {"project_id": ""}):
        response = client.post("/workspace/agent-chat/sessions", json=body)
        assert response.status_code == 422, response.text
    for project_id in ("all", "unassigned"):
        assert client.post(
            "/workspace/agent-chat/sessions", json={"project_id": project_id}
        ).status_code == 400
    assert asyncio.run(db.agent_chat_sessions.count_documents({})) == before
    assert client.post(
        "/workspace/agent-chat/sessions", json={"project_id": str(project1)}
    ).status_code == 200


def test_explicit_viewer_migration_preserves_module_reads_and_is_retryable(workspace):
    from scripts.migrate_explicit_viewers import migrate

    _, db, _, viewer, lead, _, project1, _ = workspace
    legacy = [{"role": "viewer", "scope_type": "global", "scope_id": None}]

    async def run():
        await db.users.update_one(
            {"_id": viewer["_id"]}, {"$set": {"role_bindings": legacy}}
        )
        await db.organization_invitations.insert_one({
            "organization_id": viewer["organization_id"],
            "status": "pending", "role_bindings": legacy,
        })
        await migrate(db, viewer["organization_id"])
        assert (await db.users.find_one({"_id": viewer["_id"]}))["role_bindings"] == legacy
        await migrate(db, viewer["organization_id"], apply=True)
        after = await db.users.find_one({"_id": viewer["_id"]})
        assert after["access_version"] == 1
        assert after["role_bindings"] == [
            {"role": "viewer", "scope_type": "module", "scope_id": "web_security"},
            {"role": "viewer", "scope_type": "module", "scope_id": "cloud_security"},
        ]
        invitation = await db.organization_invitations.find_one({})
        assert invitation["role_bindings"] == after["role_bindings"]
        project = await db.projects.find_one({"_id": project1})
        assert project["member_ids"] == [str(lead["_id"])]
        await migrate(db, viewer["organization_id"], apply=True)
        assert (await db.users.find_one({"_id": viewer["_id"]}))["access_version"] == 1
        assert await db.access_audit.count_documents({}) == 2

    asyncio.run(run())


def test_project_role_sync_failure_recovers_role_and_roster(workspace, monkeypatch):
    from fastapi import HTTPException

    client, db, use, viewer, lead, _, project1, _ = workspace
    use(lead)
    monkeypatch.setattr(cloud_access, "sync_cloud_access", AsyncMock(side_effect=HTTPException(503, "Cloud unavailable")))
    response = client.put(
        f"/projects/{project1}/members/{viewer['_id']}/role",
        json={"role": "analyst", "expected_version": 0},
    )
    assert response.status_code == 503
    pending = asyncio.run(db.users.find_one({"_id": viewer["_id"]}))
    assert pending["role_bindings"] == viewer["role_bindings"]
    monkeypatch.setattr(cloud_access, "sync_cloud_access", AsyncMock(return_value=None))
    saved = asyncio.run(access_management.resume_pending_access(db, pending))
    assert saved["role_bindings"][-1] == {
        "role": "analyst", "scope_type": "project", "scope_id": str(project1),
    }
    project = asyncio.run(db.projects.find_one({"_id": project1}))
    assert project["member_ids"] == [str(viewer["_id"])]


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


def test_project_filters_apply_to_history_and_chats_without_broadening_access(
    workspace,
):
    client, db, use, viewer, lead, _, project1, project2 = workspace

    async def seed_intelligence():
        docs = await db.agent_chat_sessions.find({}).to_list(None)
        for doc in docs:
            await db.agent_chat_sessions.update_one(
                {"_id": doc["_id"]},
                {
                    "$set": {
                        "session_intelligence": {
                            "session_id": str(doc["_id"]),
                            "title": doc["title"],
                            "status": "COMPLETED",
                            "summary": "",
                            "average_time_to_breach": "0m",
                            "findings_count": {"total": 0},
                            "findings": [],
                            "tools_used": [],
                            "timeline": [],
                            "targets": [],
                            "started_at": doc["created_at"].isoformat(),
                            "updated_at": doc["updated_at"].isoformat(),
                        },
                    }
                },
            )

    asyncio.run(seed_intelligence())
    for path in (
        "/workspace/agent-chat/sessions",
        "/workspace/agent-chat/session-intelligence",
    ):
        assert len(client.get(path).json()) == 3
        for pid in (project1, project2):
            response = client.get(path, params={"project_id": str(pid)})
            assert response.status_code == 200, response.text
            assert len(response.json()) == 1
            assert response.json()[0]["project_id"] == str(pid)
        response = client.get(path, params={"project_id": "unassigned"})
        assert response.status_code == 200 and len(response.json()) == 1
        assert response.json()[0]["project_id"] is None
        assert (
            client.get(path, params={"project_id": str(ObjectId())}).status_code == 404
        )
        assert client.get(path, params={"project_id": "invalid"}).status_code == 400
        use(lead)
        assert len(client.get(path, params={"project_id": str(project1)}).json()) == 1
        assert client.get(path, params={"project_id": str(project2)}).status_code == 403
        assert client.get(path, params={"project_id": "unassigned"}).status_code == 403
        use(viewer)


def test_project_query_filters_before_limit_and_supports_legacy_unassigned(workspace):
    from datetime import UTC, datetime, timedelta

    from app.services.agent_chat import list_sessions
    from app.services.session_intelligence import list_session_intelligence

    _, db, _, viewer, _, admin, project1, project2 = workspace

    async def check():
        future = datetime.now(UTC) + timedelta(days=1)
        await db.agent_chat_sessions.insert_one(
            {
                "organization_id": viewer["organization_id"],
                "user_id": admin["_id"],
                "title": "Legacy no project",
                "updated_at": datetime.now(UTC),
            }
        )
        await db.agent_chat_sessions.insert_many(
            [
                {
                    "organization_id": viewer["organization_id"],
                    "user_id": admin["_id"],
                    "project_id": str(project2),
                    "title": "Other project",
                    "updated_at": future,
                }
                for _ in range(60)
            ]
        )
        recent = await list_sessions(
            db,
            organization_id=viewer["organization_id"],
            user_id=viewer["_id"],
            limit=1,
        )
        assert recent[0]["project_id"] == str(project2)
        rows = await list_sessions(
            db,
            organization_id=viewer["organization_id"],
            user_id=viewer["_id"],
            limit=1,
            project_id=str(project1),
        )
        assert len(rows) == 1 and rows[0]["project_id"] == str(project1)
        rows = await list_sessions(
            db,
            organization_id=viewer["organization_id"],
            user_id=viewer["_id"],
            project_id="unassigned",
        )
        assert len(rows) == 2
        for doc in await db.agent_chat_sessions.find({}).to_list(None):
            await db.agent_chat_sessions.update_one(
                {"_id": doc["_id"]},
                {
                    "$set": {
                        "session_intelligence": {
                            "session_id": str(doc["_id"]),
                            "updated_at": doc["updated_at"].isoformat(),
                        },
                    }
                },
            )
        recent = await list_session_intelligence(
            db,
            organization_id=viewer["organization_id"],
            user_id=viewer["_id"],
            limit=1,
        )
        assert recent[0]["project_id"] == str(project2)
        rows = await list_session_intelligence(
            db,
            organization_id=viewer["organization_id"],
            user_id=viewer["_id"],
            limit=1,
            project_id=str(project1),
        )
        assert len(rows) == 1 and rows[0]["project_id"] == str(project1)

    asyncio.run(check())


def test_direct_chat_lookup_preserves_project_and_organization_access(workspace):
    client, _, use, _, lead, _, project1, project2 = workspace
    rows = client.get("/workspace/agent-chat/sessions").json()
    own = next(row for row in rows if row["project_id"] == str(project1))
    other = next(row for row in rows if row["project_id"] == str(project2))
    use(lead)
    assert client.get(f"/workspace/agent-chat/sessions/{own['id']}").json()[
        "project_id"
    ] == str(project1)
    assert (
        client.get(f"/workspace/agent-chat/sessions/{other['id']}").status_code == 403
    )

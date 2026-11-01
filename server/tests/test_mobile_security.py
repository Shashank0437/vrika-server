import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings
from app.db import get_database
from app.dependencies.auth import require_auth_user
from app.main import app
from app.services import mobile_security_client as engine

HASH = "a" * 32
OTHER_HASH = "b" * 32


def _user(org, bindings):
    return {"_id": ObjectId(), "organization_id": org, "email": "u@example.test", "role_bindings": bindings}


@pytest.fixture
def ctx(monkeypatch):
    db = AsyncMongoMockClient().mobile_tests
    org, other_org = ObjectId(), ObjectId()
    analyst = _user(org, [{"role": "analyst", "scope_type": "module", "scope_id": "mobile_security"}])
    viewer = _user(org, [{"role": "viewer", "scope_type": "module", "scope_id": "mobile_security"}])
    web_only = _user(org, [{"role": "analyst", "scope_type": "module", "scope_id": "web_security"}])

    async def seed():
        await db.mobile_security_scans.insert_many(
            [
                {"organization_id": org, "hash": HASH, "file_name": "app.apk", "status": "completed"},
                {"organization_id": other_org, "hash": OTHER_HASH, "file_name": "secret.apk", "status": "completed"},
            ]
        )

    asyncio.run(seed())
    settings = get_settings().model_copy(
        update={"mobile_security_api_key": "k", "mobile_security_api_url": "http://engine"}
    )
    app.dependency_overrides[get_database] = lambda: db
    app.dependency_overrides[get_settings] = lambda: settings
    mocks = {
        "upload": AsyncMock(return_value={"hash": "c" * 32, "file_name": "new.apk", "scan_type": "apk"}),
        "scan": AsyncMock(return_value={"task_id": "t1", "message": "queued"}),
        "scorecard": AsyncMock(return_value={"app_name": "Demo", "security_score": 72, "high": [{}], "warning": []}),
        "report_json": AsyncMock(return_value={"app_name": "Demo"}),
        "delete_scan": AsyncMock(return_value=None),
    }
    for name, mock in mocks.items():
        monkeypatch.setattr(engine, name, mock)

    def use(user):
        app.dependency_overrides[require_auth_user] = lambda: user

    yield {"db": db, "use": use, "analyst": analyst, "viewer": viewer, "web_only": web_only, "mocks": mocks, "client": TestClient(app)}
    app.dependency_overrides.clear()


def test_list_is_tenant_scoped(ctx):
    ctx["use"](ctx["viewer"])
    res = ctx["client"].get("/mobile-security/scans")
    assert res.status_code == 200
    assert [s["hash"] for s in res.json()["items"]] == [HASH]


def test_other_org_scan_is_hidden(ctx):
    ctx["use"](ctx["viewer"])
    assert ctx["client"].get(f"/mobile-security/scans/{OTHER_HASH}/report").status_code == 404
    ctx["mocks"]["report_json"].assert_not_called()


def test_invalid_hash_rejected(ctx):
    ctx["use"](ctx["viewer"])
    assert ctx["client"].get("/mobile-security/scans/..%2Fetc/report").status_code in {400, 404}
    assert ctx["client"].get("/mobile-security/scans/XYZ/report").status_code == 400


def test_module_permission_required(ctx):
    ctx["use"](ctx["web_only"])
    assert ctx["client"].get("/mobile-security/scans").status_code == 403


def test_viewer_cannot_upload(ctx):
    ctx["use"](ctx["viewer"])
    res = ctx["client"].post("/mobile-security/scans", files={"file": ("a.apk", b"PK", "application/octet-stream")})
    assert res.status_code == 403
    ctx["mocks"]["upload"].assert_not_called()


def test_upload_rejects_unsupported_extension(ctx):
    ctx["use"](ctx["analyst"])
    res = ctx["client"].post("/mobile-security/scans", files={"file": ("a.exe", b"MZ", "application/octet-stream")})
    assert res.status_code == 400


def test_upload_queues_then_completes(ctx):
    ctx["use"](ctx["analyst"])
    client = ctx["client"]
    res = client.post("/mobile-security/scans", files={"file": ("new.apk", b"PK", "application/octet-stream")})
    assert res.status_code == 202
    detail = client.get(f"/mobile-security/scans/{'c' * 32}").json()
    assert detail["status"] == "completed"
    assert detail["security_score"] == 72
    assert detail["severity"]["high"] == 1


def test_delete_keeps_engine_result_shared_with_other_org(ctx):
    async def share():
        await ctx["db"].mobile_security_scans.insert_one(
            {"organization_id": ObjectId(), "hash": HASH, "status": "completed"}
        )

    asyncio.run(share())
    ctx["use"](ctx["analyst"])
    assert ctx["client"].delete(f"/mobile-security/scans/{HASH}").status_code == 204
    ctx["mocks"]["delete_scan"].assert_not_called()


def test_delete_removes_engine_result_when_unreferenced(ctx):
    ctx["use"](ctx["analyst"])
    assert ctx["client"].delete(f"/mobile-security/scans/{HASH}").status_code == 204
    ctx["mocks"]["delete_scan"].assert_awaited_once()

import asyncio
import hashlib
import hmac
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.services import cloud_access


@pytest.fixture
def lookup(monkeypatch):
    db = AsyncMongoMockClient().cloud_project_lookup
    org = ObjectId()
    tenant, provider = str(uuid4()), str(uuid4())
    asyncio.run(db.prowler_tenant_links.insert_one({
        "vrika_organization_id": org, "prowler_tenant_id": tenant,
    }))
    response = {"tenant_id": tenant, "provider_id": provider, "project_ids": [str(ObjectId())]}
    post = AsyncMock(return_value=response)
    monkeypatch.setattr(cloud_access, "_bridge_post", post)
    return db, org, tenant, provider, post, response


def test_lookup_uses_linked_tenant_not_provider_cache(lookup):
    db, org, tenant, provider, post, response = lookup
    assert asyncio.run(cloud_access.get_provider_project_ids(db, None, org, provider)) == response["project_ids"]
    assert post.call_args.args[1] == "/internal/vrika-provider-projects"
    assert post.call_args.args[2]["data"]["attributes"] == {
        "tenant_id": tenant, "provider_id": provider,
    }


@pytest.mark.parametrize("field,value", [
    ("tenant_id", "wrong-tenant"), ("provider_id", "wrong-provider"),
    ("project_ids", "not-a-list"), ("project_ids", [None]), ("project_ids", [""]),
])
def test_invalid_cloud_response_is_rejected(lookup, field, value):
    db, org, _, provider, _, response = lookup
    response[field] = value
    with pytest.raises(HTTPException) as exc:
        asyncio.run(cloud_access.get_provider_project_ids(db, None, org, provider))
    assert exc.value.status_code == 503


@pytest.mark.parametrize("status,expected", [(404, 409), (401, 503), (500, 503)])
def test_cloud_errors_are_not_reported_as_a_local_assignment(lookup, status, expected):
    db, org, _, provider, post, _ = lookup
    request = httpx.Request("POST", "http://cloud/internal/vrika-provider-projects")
    post.side_effect = httpx.HTTPStatusError(
        "Cloud rejected lookup", request=request, response=httpx.Response(status, request=request),
    )
    with pytest.raises(HTTPException) as exc:
        asyncio.run(cloud_access.get_provider_project_ids(db, None, org, provider))
    assert exc.value.status_code == expected


def test_missing_tenant_does_not_call_cloud(lookup):
    db, org, _, provider, post, _ = lookup
    asyncio.run(db.prowler_tenant_links.delete_many({}))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(cloud_access.get_provider_project_ids(db, None, org, provider))
    assert exc.value.status_code == 409
    post.assert_not_awaited()


def test_bridge_signs_exact_request_body(monkeypatch):
    settings = SimpleNamespace(
        prowler_bridge_secret="test-only", vrika_bridge_secret="",
        prowler_api_base_url="http://cloud/api/v1",
    )
    response = httpx.Response(
        200, json={"data": {"attributes": {"project_ids": []}}},
        request=httpx.Request("POST", "http://cloud/api/v1/internal/vrika-provider-projects"),
    )
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.post.return_value = response
    monkeypatch.setattr(cloud_access.httpx, "AsyncClient", lambda **kwargs: client)
    payload = {"data": {"attributes": {"provider_id": str(uuid4())}}}
    result = asyncio.run(cloud_access._bridge_post(settings, "/internal/vrika-provider-projects", payload))
    assert result == {"project_ids": []}
    kwargs = client.post.call_args.kwargs
    body, headers = kwargs["content"], kwargs["headers"]
    assert json.loads(body) == payload
    expected = hmac.new(
        b"test-only", headers["X-Vrika-Timestamp"].encode() + b"." + body, hashlib.sha256,
    ).hexdigest()
    assert headers["X-Vrika-Signature"] == expected

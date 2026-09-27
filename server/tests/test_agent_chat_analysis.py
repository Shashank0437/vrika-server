import asyncio
import json
import sys
from pathlib import Path

import pytest
from bson import ObjectId
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers import agent_chat as router

SESSION_ID = str(ObjectId())
USER = {"_id": ObjectId(), "organization_id": ObjectId()}
LLM_CONFIG = {"provider": "openrouter", "model": "test-model"}


def patch_route(monkeypatch, *, llm_config=LLM_CONFIG, agent_status=200, agent_body=None):
    calls = {}

    async def get_session_owned(*_args, **_kwargs):
        return {
            "title": "Review example.test",
            "session_intelligence": {"targets": ["10.0.0.5"], "objective": "review 10.0.0.5"},
        }

    async def list_messages(*_args, **_kwargs):
        return [{"role": "tool", "tool_name": "nmap", "content": "10.0.0.5 80/tcp open"}]

    async def resolve_llm_config_for_org(*_args, **_kwargs):
        return llm_config

    async def mask_tool_output(_vault_id, text):
        return text.replace("10.0.0.5", "[[VRIKA:IP:01]]")

    async def restore_llm_json(_vault_id, payload):
        return json.loads(json.dumps(payload).replace("[[VRIKA:IP:01]]", "10.0.0.5"))

    async def forward_agent_post_tool(_settings, path, payload):
        calls["path"] = path
        calls["payload"] = payload
        body = agent_body if agent_body is not None else {
            "success": True,
            "summary": "Port 80 is open on [[VRIKA:IP:01]].",
        }
        return agent_status, json.dumps(body).encode(), "application/json"

    for name, value in {
        "get_session_owned": get_session_owned,
        "list_messages": list_messages,
        "resolve_llm_config_for_org": resolve_llm_config_for_org,
        "mask_tool_output": mask_tool_output,
        "restore_llm_json": restore_llm_json,
        "forward_agent_post_tool": forward_agent_post_tool,
        "get_settings": lambda: object(),
    }.items():
        monkeypatch.setattr(router, name, value)
    return calls


def run_route():
    return asyncio.run(
        router.analyze_agent_chat_session_route(SESSION_ID, user=USER, db=object())
    )


def test_analysis_sends_org_llm_config_and_masks_before_the_llm(monkeypatch):
    calls = patch_route(monkeypatch)

    response = run_route()

    payload = calls["payload"]
    assert calls["path"] == "/api/intelligence/analyze-session"
    assert payload["llm_config"] == LLM_CONFIG
    assert "10.0.0.5" not in json.dumps(payload)
    assert payload["logs"][0]["stdout"] == "[[VRIKA:IP:01]] 80/tcp open"
    assert response["success"] is True
    assert json.loads(response["result"])["summary"] == "Port 80 is open on 10.0.0.5."


def test_analysis_without_org_llm_is_a_clear_503_and_skips_the_agent(monkeypatch):
    calls = patch_route(monkeypatch, llm_config=None)

    with pytest.raises(HTTPException) as exc:
        run_route()

    assert exc.value.status_code == 503
    assert "no LLM is configured" in exc.value.detail
    assert "payload" not in calls


def test_agent_failure_is_reported_as_502_with_the_agent_reason(monkeypatch):
    patch_route(
        monkeypatch,
        agent_status=502,
        agent_body={"success": False, "error": "LLM is not available."},
    )

    with pytest.raises(HTTPException) as exc:
        run_route()

    assert exc.value.status_code == 502
    assert exc.value.detail == "AI analysis failed: LLM is not available."


def test_masking_failure_never_sends_raw_logs(monkeypatch):
    calls = patch_route(monkeypatch)

    async def failing_mask(*_args, **_kwargs):
        raise RuntimeError("vault unavailable")

    monkeypatch.setattr(router, "mask_tool_output", failing_mask)

    with pytest.raises(HTTPException) as exc:
        run_route()

    assert exc.value.status_code == 503
    assert "payload" not in calls

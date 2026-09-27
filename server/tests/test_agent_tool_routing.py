import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from bson import ObjectId

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import agent_chat as chat


CATALOG = [
    {"name": name, "desc": name, "category": "web_vuln", "params": {"target": "REQUIRED"}}
    for name in ("zaproxy", "burpsuite", "nuclei", "nmap", "graphql-scanner")
]
ORG = ObjectId()
CONFIG = {"provider": "openrouter", "model": "test-model", "api_key": "test-only"}
SETTINGS = SimpleNamespace(
    agent_router_max_tools=30, agent_timeout_seconds=10,
    agent_route_intent_timeout_seconds=10,
)


@pytest.mark.parametrize(("message", "expected"), [
    ("run zaproxy on example.test", ["zaproxy"]),
    ("please run OWASP ZAP on example.test", ["zaproxy"]),
    ("run Burp Suite on example.test", ["burpsuite"]),
    ("can you run `burpsuite` on example.test?", ["burpsuite"]),
    ("run both nmap and nuclei on example.test", ["nmap", "nuclei"]),
    ("run nmap, nuclei and zaproxy on example.test", ["nmap", "nuclei", "zaproxy"]),
    ("run graphql_scanner on example.test", ["graphql-scanner"]),
    ("run nuclei on https://burpsuite.example.test", ["nuclei"]),
    ("run nuclei instead of zaproxy", ["nuclei"]),
    ("don't run nmap; run zaproxy on example.test", ["zaproxy"]),
    ("do not run burpsuite", []),
    ("how do I run burpsuite?", []),
    ("which tools should I use for example.test?", []),
    ("run nuclei-fake on example.test", []),
])
def test_catalog_command_operands(message, expected):
    assert chat.requested_catalog_tools(message, CATALOG) == expected


def setup_router(monkeypatch, unavailable=()):
    requests = []

    async def catalog(*_args):
        return {}, {"tools": CATALOG}

    async def maps(*_args, **_kwargs):
        eligible = [t for t in CATALOG if t["name"] not in unavailable]
        return {t["name"]: t for t in eligible}, eligible

    async def config(_db, _settings, org):
        assert org == ORG
        return CONFIG

    async def post(_settings, path, payload, **_kwargs):
        requests.append((path, payload))
        if path.endswith("route-intent"):
            return {"success": True, "intent": "operational", "tool_names": ["nuclei"], "category": "web_vuln"}
        assert path.endswith("schemas-from-tools")
        return {"success": True, "schemas": [
            {"type": "function", "function": {"name": t["name"]}} for t in payload["tools"]
        ]}

    async def hint(*_args):
        return {}

    async def skills(*_args, **_kwargs):
        return []

    monkeypatch.setattr(chat, "fetch_agent_health_and_catalog", catalog)
    monkeypatch.setattr(chat, "_load_chat_tool_maps", maps)
    monkeypatch.setattr(chat, "resolve_llm_config_for_org", config)
    monkeypatch.setattr(chat, "agent_post_json", post)
    monkeypatch.setattr(chat, "_fetch_keyword_category_hint", hint)
    monkeypatch.setattr(chat, "fetch_skill_blocks_for_meta", skills)
    return requests


def plan(message, **kwargs):
    return asyncio.run(chat.plan_router_turn(
        SETTINGS, object(), organization_id=ORG, user_message=message, **kwargs,
    ))


@pytest.mark.parametrize("name", ["burpsuite", "zaproxy", "graphql-scanner"])
def test_named_request_pins_only_requested_tool_without_llm_shortlisting(monkeypatch, name):
    requests = setup_router(monkeypatch)
    result = plan(f"run {name} on example.test")
    assert result.intent == "operational"
    assert [s["function"]["name"] for s in result.schemas] == [name]
    assert result.meta["explicit_tool_names"] == [name]
    assert not any(path.endswith("route-intent") for path, _ in requests)
    assert "api_key" not in str(result.meta)


@pytest.mark.parametrize("message", ["scan https://example.test", "which tools should I use for example.test?"])
def test_all_llm_routing_paths_receive_organization_config(monkeypatch, message):
    requests = setup_router(monkeypatch)
    plan(message, session_id="session", turn_id="turn")
    payload = next(p for path, p in requests if path.endswith("route-intent"))
    assert payload["llm_config"] == CONFIG
    assert payload["session_id"] == "session"
    assert payload["turn_id"] == "turn"


@pytest.mark.parametrize("message", ["run burpsuite on example.test", "run nuclei and burpsuite on example.test"])
def test_unavailable_named_tool_blocks_whole_request_without_substitution(monkeypatch, message):
    requests = setup_router(monkeypatch, unavailable=("burpsuite",))
    result = plan(message)
    assert result.schemas is None
    assert "burpsuite" in result.meta["routing_error"]
    recovered = asyncio.run(chat.maybe_upgrade_router_result_for_llm(
        SETTINGS, object(), organization_id=ORG, rows=[], user_message=message,
        explicit_tool_names=None, rt=result,
    ))
    assert recovered is result
    assert requests == []


def test_config_resolution_error_does_not_use_global_model(monkeypatch):
    requests = setup_router(monkeypatch)

    async def broken(*_args):
        raise RuntimeError("configuration unavailable")

    monkeypatch.setattr(chat, "resolve_llm_config_for_org", broken)
    with pytest.raises(RuntimeError, match="configuration unavailable"):
        plan("scan https://example.test")
    assert requests == []


def test_failed_explicit_schema_lookup_cannot_recover_with_other_tools(monkeypatch):
    setup_router(monkeypatch)

    async def failed(*_args, **_kwargs):
        return {"success": False, "error": "schema lookup unavailable"}

    monkeypatch.setattr(chat, "agent_post_json", failed)
    result = plan("run burpsuite on example.test")
    assert result.schemas is None
    recovered = asyncio.run(chat.maybe_upgrade_router_result_for_llm(
        SETTINGS, object(), organization_id=ORG, rows=[],
        user_message="run burpsuite on example.test", explicit_tool_names=None, rt=result,
    ))
    assert recovered is result

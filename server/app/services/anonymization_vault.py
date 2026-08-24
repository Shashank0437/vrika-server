"""
server/app/services/anonymization_vault.py

Session-Scoped Semantic Anonymization Vault (Vault Pattern).
Replaces detected sensitive entities (IPs, hostnames, credentials, tokens) with deterministic
semantic tokens (e.g. [[VRIKA:HOST:01]], [[VRIKA:IP:01]], [[VRIKA:SECRET:01]]) before LLM turns,
and restores them via exact token replacement for UI streaming and report generation.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, Tuple

from app.redis_client import get_redis
from app.services.presidio_service import detect_sensitive_entities

logger = logging.getLogger(__name__)

VAULT_REDIS_PREFIX = "vrika:vault:"
VAULT_TTL_SECONDS = 3600  # 1 Hour TTL per session

# In-process memory fallback cache in case Redis is temporarily disconnected
_LOCAL_VAULT_CACHE: Dict[str, Dict[str, str]] = {}


def _get_vault_key(session_id: str) -> str:
    return f"{VAULT_REDIS_PREFIX}{session_id.strip()}"


async def get_session_vault_map(session_id: str) -> Dict[str, str]:
    """Retrieve {placeholder: original_value} mapping for a given session."""
    if not session_id or not session_id.strip():
        return {}

    key = _get_vault_key(session_id)
    try:
        redis_client = get_redis()
        raw = await redis_client.get(key)
        if raw:
            return json.loads(raw)
    except Exception as exc:
        logger.debug("Redis vault get failed for session %s: %s", session_id, exc)

    return _LOCAL_VAULT_CACHE.get(session_id, {})


async def save_session_vault_map(session_id: str, mapping: Dict[str, str]) -> None:
    """Persist {placeholder: original_value} mapping in Redis with TTL and local cache."""
    if not session_id or not session_id.strip():
        return

    _LOCAL_VAULT_CACHE[session_id] = mapping
    key = _get_vault_key(session_id)
    try:
        redis_client = get_redis()
        await redis_client.set(key, json.dumps(mapping), ex=VAULT_TTL_SECONDS)
    except Exception as exc:
        logger.debug("Redis vault set failed for session %s: %s", session_id, exc)


def _allocate_placeholder(
    category: str,
    original_value: str,
    vault_map: Dict[str, str],
) -> str:
    """Allocate or reuse a deterministic placeholder token for an entity in the session."""
    cat = category.upper()
    norm_val = original_value.strip()

    # Check if this exact value already has a token in this session
    for token, val in vault_map.items():
        if val.strip() == norm_val and token.startswith(f"[[VRIKA:{cat}:"):
            return token

    # Count existing tokens in this category to determine next index
    count = sum(1 for token in vault_map if token.startswith(f"[[VRIKA:{cat}:"))
    token = f"[[VRIKA:{cat}:{count + 1:02d}]]"
    vault_map[token] = norm_val
    return token


async def mask_tool_output(session_id: str, raw_text: str) -> str:
    """
    Scans raw security tool output (stdout, stderr, raw findings),
    replaces all sensitive entities with deterministic [[VRIKA:...]] placeholders,
    and updates the session vault.
    """
    if not raw_text or not raw_text.strip():
        return raw_text

    entities = await detect_sensitive_entities(raw_text)
    if not entities:
        return raw_text

    vault_map = await get_session_vault_map(session_id)

    # Sort spans in reverse order (right-to-left) to replace without offset invalidation
    sorted_spans = sorted(entities, key=lambda x: x["start"], reverse=True)

    masked_text = raw_text
    for entity in sorted_spans:
        start, end = entity["start"], entity["end"]
        original = raw_text[start:end]
        token = _allocate_placeholder(entity["category"], original, vault_map)
        masked_text = masked_text[:start] + token + masked_text[end:]

    await save_session_vault_map(session_id, vault_map)
    logger.info(
        "[PRESIDIO_VAULT] Masked %d entity spans into semantic placeholders for session=%s",
        len(entities),
        session_id,
    )
    return masked_text


async def mask_messages_for_llm(
    session_id: str,
    messages: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Sanitizes all context messages before dispatching to the LLM.
    Masks tool outputs, user inputs, and system snapshots.
    """
    if not messages:
        return []

    sanitized_messages: List[Dict[str, Any]] = []
    for msg in messages:
        content = msg.get("content")
        role = msg.get("role")

        if isinstance(content, str) and content.strip():
            # Mask tool findings and user turns
            masked_content = await mask_tool_output(session_id, content)
            sanitized_messages.append({**msg, "content": masked_content})
        else:
            sanitized_messages.append(msg)

    return sanitized_messages


async def restore_llm_text(
    session_id: str,
    text: str,
    policy: str = "full",
) -> str:
    """
    Restores [[VRIKA:...]] semantic placeholders in LLM response or report back to real values.
    policy='full': Restores all infrastructure, hostnames, IPs, and credentials.
    policy='redact_secrets': Restores IPs and hostnames, but replaces SECRET placeholders with [REDACTED].
    """
    if not text or not text.strip():
        return text

    vault_map = await get_session_vault_map(session_id)
    if not vault_map:
        return text

    restored = text
    restored_count = 0
    for token, original_value in vault_map.items():
        if token in restored:
            restored_count += 1
            if policy == "redact_secrets" and token.startswith("[[VRIKA:SECRET:"):
                restored = restored.replace(token, "[REDACTED_CREDENTIAL]")
            else:
                restored = restored.replace(token, original_value)

    if restored_count > 0:
        logger.info(
            "[PRESIDIO_VAULT] Restored %d semantic placeholders for session=%s (policy=%s)",
            restored_count,
            session_id,
            policy,
        )

    return restored


_TOKEN_PREFIX = "[[VRIKA:"
# Longest realistic placeholder is ~24 chars; cap how much text we withhold so a stray
# "[" in ordinary prose can never stall the stream indefinitely.
_MAX_PARTIAL_TOKEN_HOLD = 64


def _looks_like_partial_token(tail: str) -> bool:
    """True when ``tail`` could still grow into a complete ``[[VRIKA:...]]`` placeholder."""
    if not tail.startswith("[") or "]]" in tail:
        return False
    if len(tail) <= len(_TOKEN_PREFIX):
        return _TOKEN_PREFIX.startswith(tail)
    return tail.startswith(_TOKEN_PREFIX)


class StreamingRestorer:
    """Incrementally restore vault placeholders inside an SSE token stream.

    The LLM streams text in arbitrary chunks, so a placeholder such as
    ``[[VRIKA:IP:01]]`` is frequently split across two frames. Restoring each chunk
    independently would therefore miss the split ones and leak raw placeholders into
    the UI. This buffers only a possible partial token at the tail and emits
    everything else immediately, preserving progressive rendering.
    """

    def __init__(self, vault_map: Optional[Dict[str, str]], policy: str = "full") -> None:
        self._vault = dict(vault_map or {})
        self._policy = policy
        self._buffer = ""

    @property
    def enabled(self) -> bool:
        return bool(self._vault)

    def _replace(self, text: str) -> str:
        for token, original_value in self._vault.items():
            if token not in text:
                continue
            if self._policy == "redact_secrets" and token.startswith("[[VRIKA:SECRET:"):
                text = text.replace(token, "[REDACTED_CREDENTIAL]")
            else:
                text = text.replace(token, original_value)
        return text

    def _hold_index(self, text: str) -> int:
        """Index from which the tail may be an unfinished placeholder."""
        limit = max(0, len(text) - _MAX_PARTIAL_TOKEN_HOLD)
        idx = text.find("[", limit)
        while idx != -1:
            if _looks_like_partial_token(text[idx:]):
                return idx
            idx = text.find("[", idx + 1)
        return len(text)

    def feed(self, chunk: str) -> str:
        """Consume a stream chunk and return the text that is safe to emit now."""
        if not self._vault or not chunk:
            return chunk
        self._buffer += chunk
        replaced = self._replace(self._buffer)
        hold_at = self._hold_index(replaced)
        emit, self._buffer = replaced[:hold_at], replaced[hold_at:]
        return emit

    def flush(self) -> str:
        """Return any text still withheld once the stream ends."""
        if not self._buffer:
            return ""
        remainder, self._buffer = self._replace(self._buffer), ""
        return remainder


async def restore_llm_json(
    session_id: str,
    payload: Any,
    policy: str = "full",
) -> Any:
    """Recursively restore placeholders inside a parsed LLM JSON structure.

    Restoring the raw JSON *string* before parsing is unsafe: an original value may
    contain quotes or backslashes and would corrupt the document. Walking the parsed
    structure instead keeps the JSON valid whatever the vaulted values contain.
    """
    vault_map = await get_session_vault_map(session_id)
    if not vault_map:
        return payload

    def _walk(node: Any) -> Any:
        if isinstance(node, str):
            out = node
            for token, original_value in vault_map.items():
                if token not in out:
                    continue
                if policy == "redact_secrets" and token.startswith("[[VRIKA:SECRET:"):
                    out = out.replace(token, "[REDACTED_CREDENTIAL]")
                else:
                    out = out.replace(token, original_value)
            return out
        if isinstance(node, list):
            return [_walk(item) for item in node]
        if isinstance(node, dict):
            return {key: _walk(value) for key, value in node.items()}
        return node

    return _walk(payload)

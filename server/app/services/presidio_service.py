"""
server/app/services/presidio_service.py

High-precision Presidio Analyzer & Anonymizer service with custom security recognizers.
Detects PII, operational infrastructure (IPs, hostnames), and sensitive credentials
(AWS keys, JWTs, API tokens, database URIs, private keys) before LLM prompt injection.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

# Default Presidio endpoints (Docker bridge service names with localhost fallback)
PRESIDIO_ANALYZER_URL = os.getenv("PRESIDIO_ANALYZER_URL", "http://presidio-analyzer:3000")
PRESIDIO_ANONYMIZER_URL = os.getenv("PRESIDIO_ANONYMIZER_URL", "http://presidio-anonymizer:3000")
# Fallbacks are tried in order when the configured endpoint is unreachable. The
# ``vrika-presidio-*`` entries are the compose ``container_name`` values: they still
# resolve when the containers are started outside compose and therefore never get a
# service-name network alias. The 127.0.0.1 entries only work for host-network setups.
PRESIDIO_FALLBACK_ANALYZER_URL = "http://127.0.0.1:5001"
PRESIDIO_FALLBACK_ANONYMIZER_URL = "http://127.0.0.1:5002"
PRESIDIO_ANALYZER_FALLBACKS = (
    "http://vrika-presidio-analyzer:3000",
    PRESIDIO_FALLBACK_ANALYZER_URL,
)
PRESIDIO_ANONYMIZER_FALLBACKS = (
    "http://vrika-presidio-anonymizer:3000",
    PRESIDIO_FALLBACK_ANONYMIZER_URL,
)

# High-precision security pattern recognizers (narrow regexes avoiding surrounding syntax/key names)
SECURITY_RECOGNIZERS = [
    {
        "name": "AWS_ACCESS_KEY",
        "regex": r"\b(AKIA[0-9A-Z]{16})\b",
        "category": "SECRET",
    },
    {
        "name": "GITHUB_TOKEN",
        "regex": r"\b((?:ghp|gho|ghu|ghs|ghr)_[0-9a-zA-Z]{36,255})\b",
        "category": "SECRET",
    },
    {
        "name": "SLACK_TOKEN",
        "regex": r"\b(xox[baprs]-[0-9a-zA-Z]{10,48})\b",
        "category": "SECRET",
    },
    {
        "name": "JWT_TOKEN",
        "regex": r"\b(eyJ[A-Za-z0-9-_=]+\.eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]*)\b",
        "category": "SECRET",
    },
    {
        "name": "PRIVATE_KEY_BLOCK",
        "regex": r"(-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----)",
        "category": "SECRET",
    },
    {
        "name": "DATABASE_CONNECTION_URI",
        "regex": r"\b((?:postgres|postgresql|mysql|mongodb|redis)://[^:\s]+:[^@\s]+@[^/\s]+/[^\s\"']+)\b",
        "category": "SECRET",
    },
    {
        "name": "AUTHORIZATION_BEARER_HEADER",
        "regex": r"(?i)(?:Authorization:\s*Bearer\s+|Bearer\s+)([A-Za-z0-9\-._~+/]{20,}=*)",
        "category": "SECRET",
        "capture_group": 1,
    },
    {
        "name": "IPV4_ADDRESS",
        "regex": r"\b((?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}))\b",
        "category": "IP",
    },
    {
        "name": "INTERNAL_HOSTNAME",
        "regex": r"\b([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*\.(?:corp|internal|local|lan|vpc|internal\.aws))\b",
        "category": "HOST",
    },
    {
        "name": "EMAIL_ADDRESS",
        "regex": r"\b([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)\b",
        "category": "EMAIL",
    },
]


async def _call_presidio_post(
    url_primary: str,
    url_fallback: str | tuple[str, ...],
    path: str,
    payload: Dict[str, Any],
) -> Optional[Any]:
    """Execute POST request, trying the configured endpoint then each fallback in turn."""
    fallbacks = (url_fallback,) if isinstance(url_fallback, str) else tuple(url_fallback)
    attempts: List[str] = []
    for base in (url_primary, *fallbacks):
        if not base or base in attempts:
            continue
        attempts.append(base)
        url = f"{base.rstrip('/')}/{path.lstrip('/')}"
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.post(url, json=payload)
                if res.status_code == 200:
                    return res.json()
                logger.warning(
                    "Presidio endpoint %s returned HTTP %s: %s",
                    url,
                    res.status_code,
                    res.text[:200],
                )
        except Exception as exc:
            logger.debug("Presidio endpoint %s unreachable: %s", url, exc)

    # Every endpoint failed: masking silently degrades to regex-only detection, so make
    # this loud rather than hiding it behind DEBUG.
    logger.error(
        "Presidio unreachable at all endpoints %s for /%s — falling back to regex-only "
        "detection; NLP entities (PERSON, PHONE_NUMBER, CREDIT_CARD, ...) will NOT be masked",
        attempts,
        path.lstrip("/"),
    )
    return None


def _resolve_overlapping_spans(
    entities: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Reduce detected spans to a non-overlapping set.

    Presidio routinely reports overlapping spans for the same text (e.g. it tags
    ``john@acme.com`` as EMAIL_ADDRESS while also tagging ``acme.com`` inside it as
    URL). Replacing overlapping spans corrupts the output: an earlier replacement
    rewrites bytes that a later span still points at, producing mangled placeholders
    such as ``[[VRIKA:HOST:03]]:EMAIL:01]]HOST:02]]`` and leaking partial values.

    Winners are chosen by span length first, then confidence, then position. Coverage
    deliberately outranks confidence: a short high-confidence span (Presidio often tags
    the ``0132`` of a phone number as DATE_TIME with score 0.85) would otherwise beat the
    longer PHONE_NUMBER span and leave the rest of the value exposed. Over-masking is the
    safe failure mode here; under-masking leaks data to the LLM.
    """
    if not entities:
        return []

    ranked = sorted(
        entities,
        key=lambda e: (
            -(int(e["end"]) - int(e["start"])),
            -float(e.get("score") or 0.0),
            int(e["start"]),
        ),
    )

    kept: List[Dict[str, Any]] = []
    for candidate in ranked:
        c_start, c_end = int(candidate["start"]), int(candidate["end"])
        if c_end <= c_start:
            continue
        # Half-open intervals: [a, b) and [c, d) overlap iff a < d and c < b.
        if any(c_start < int(k["end"]) and int(k["start"]) < c_end for k in kept):
            continue
        kept.append(candidate)

    kept.sort(key=lambda e: int(e["start"]))
    return kept


async def detect_sensitive_entities(text: str, language: str = "en") -> List[Dict[str, Any]]:
    """
    Detect all sensitive entities using Presidio Analyzer Engine augmented by
    high-precision security pattern recognizers. Returns list of entity spans.
    """
    if not text or not text.strip():
        return []

    entities: List[Dict[str, Any]] = []

    # 1. Query Presidio Analyzer REST API
    payload = {"text": text, "language": language}
    analyzer_res = await _call_presidio_post(
        PRESIDIO_ANALYZER_URL,
        PRESIDIO_ANALYZER_FALLBACKS,
        "analyze",
        payload,
    )

    if isinstance(analyzer_res, list):
        for item in analyzer_res:
            etype = str(item.get("entity_type") or "").upper()
            cat = "PII"
            if "IP" in etype:
                cat = "IP"
            elif "DOMAIN" in etype or "URL" in etype:
                cat = "HOST"
            elif "EMAIL" in etype:
                cat = "EMAIL"
            elif "KEY" in etype or "SECRET" in etype or "PASSWORD" in etype:
                cat = "SECRET"

            entities.append(
                {
                    "start": int(item["start"]),
                    "end": int(item["end"]),
                    "score": float(item.get("score", 0.85)),
                    "entity_type": etype,
                    "category": cat,
                    "text": text[int(item["start"]) : int(item["end"])],
                }
            )

    # 2. Run custom high-precision security pattern recognizers
    for recognizer in SECURITY_RECOGNIZERS:
        for match in re.finditer(recognizer["regex"], text):
            group_idx = recognizer.get("capture_group", 0)
            span_start, span_end = match.span(group_idx)
            val = match.group(group_idx)
            if not val or len(val.strip()) < 4:
                continue

            # Always record the span. Duplicates and partial overlaps against Presidio
            # results are settled by _resolve_overlapping_spans, which keeps the
            # highest-confidence/longest span instead of dropping these high-precision
            # matches whenever a lower-confidence Presidio span happens to cover them.
            entities.append(
                {
                    "start": span_start,
                    "end": span_end,
                    "score": 0.98,
                    "entity_type": recognizer["name"],
                    "category": recognizer["category"],
                    "text": val,
                }
            )

    # 3. Collapse to a non-overlapping, position-sorted span set so callers can safely
    #    substitute right-to-left without corrupting neighbouring replacements.
    return _resolve_overlapping_spans(entities)

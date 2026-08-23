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
PRESIDIO_FALLBACK_ANALYZER_URL = "http://127.0.0.1:5001"
PRESIDIO_FALLBACK_ANONYMIZER_URL = "http://127.0.0.1:5002"

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
    url_fallback: str,
    path: str,
    payload: Dict[str, Any],
) -> Optional[Any]:
    """Execute POST request with automatic fallback between Docker service name and localhost."""
    for base in (url_primary, url_fallback):
        url = f"{base.rstrip('/')}/{path.lstrip('/')}"
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.post(url, json=payload)
                if res.status_code == 200:
                    return res.json()
        except Exception as exc:
            logger.debug("Presidio endpoint %s unreachable: %s", url, exc)
    return None


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
        PRESIDIO_FALLBACK_ANALYZER_URL,
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

            # Check if span already covered by existing entity
            if not any(e["start"] <= span_start and e["end"] >= span_end for e in entities):
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

    # Sort spans from earliest to latest
    entities.sort(key=lambda x: (x["start"], -x["end"]))
    return entities

"""HTTP client for the vrika-mobile-security REST API (MobSF-compatible /api/v1)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any, BinaryIO

import httpx

from app.config import Settings


class MobileSecurityApiError(Exception):
    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _base_url(settings: Settings) -> str:
    return settings.mobile_security_api_url.rstrip("/")


def is_configured(settings: Settings) -> bool:
    return bool(settings.mobile_security_api_key and settings.mobile_security_api_url)


async def _request(
    settings: Settings,
    method: str,
    path: str,
    *,
    data: dict[str, Any] | None = None,
    params: dict[str, Any] | None = None,
    files: dict[str, tuple[str, BinaryIO, str]] | None = None,
    timeout: float | None = None,
) -> httpx.Response:
    if not is_configured(settings):
        raise MobileSecurityApiError(
            "Mobile Security is not configured (MOBILE_SECURITY_API_URL / MOBILE_SECURITY_API_KEY)",
            503,
        )
    try:
        async with httpx.AsyncClient(
            base_url=_base_url(settings),
            timeout=timeout or settings.mobile_security_timeout_seconds,
            headers={"X-Vrika-Api-Key": settings.mobile_security_api_key},
        ) as client:
            resp = await client.request(method, path, data=data, params=params, files=files)
    except httpx.TimeoutException as exc:
        raise MobileSecurityApiError("Mobile Security engine timed out", 504) from exc
    except httpx.HTTPError as exc:
        raise MobileSecurityApiError("Mobile Security engine is unreachable", 502) from exc
    if resp.status_code >= 400:
        message = f"Mobile Security engine request failed (HTTP {resp.status_code})"
        try:
            body = resp.json()
            if isinstance(body, dict):
                message = str(body.get("error") or body.get("message") or body.get("not_found") or body.get("report") or message)
        except ValueError:
            pass
        raise MobileSecurityApiError(message, resp.status_code)
    return resp


async def _json(settings: Settings, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
    resp = await _request(settings, method, path, **kwargs)
    try:
        body = resp.json()
    except ValueError as exc:
        raise MobileSecurityApiError("Invalid response from Mobile Security engine") from exc
    if not isinstance(body, dict):
        raise MobileSecurityApiError("Unexpected response from Mobile Security engine")
    return body


async def ping(settings: Settings) -> None:
    await _request(settings, "GET", "/api/v1/scans", params={"page": 1, "page_size": 1})


async def call(
    settings: Settings,
    method: str,
    path: str,
    *,
    data: dict[str, Any] | None = None,
    files: dict[str, tuple[str, BinaryIO, str]] | None = None,
) -> httpx.Response:
    return await _request(
        settings,
        method,
        path,
        data=data if method == "POST" else None,
        params=data if method == "GET" else None,
        files=files,
        timeout=settings.mobile_security_scan_timeout_seconds,
    )


async def stream(settings: Settings, path: str, data: dict[str, Any]) -> AsyncIterator[bytes]:
    """Proxy a long-lived engine stream (e.g. logcat) chunk by chunk."""
    if not is_configured(settings):
        raise MobileSecurityApiError("Mobile Security is not configured", 503)
    async with httpx.AsyncClient(
        base_url=_base_url(settings),
        timeout=httpx.Timeout(settings.mobile_security_timeout_seconds, read=None),
        headers={"X-Vrika-Api-Key": settings.mobile_security_api_key},
    ) as client:
        async with client.stream("POST", path, data=data) as resp:
            if resp.status_code >= 400:
                raise MobileSecurityApiError("Mobile Security engine stream failed", resp.status_code)
            async for chunk in resp.aiter_bytes():
                yield chunk


async def upload(settings: Settings, file_name: str, fileobj: BinaryIO, content_type: str) -> dict[str, Any]:
    return await _json(
        settings,
        "POST",
        "/api/v1/upload",
        files={"file": (file_name, fileobj, content_type or "application/octet-stream")},
        timeout=settings.mobile_security_scan_timeout_seconds,
    )


async def scan(settings: Settings, scan_hash: str, *, rescan: bool = False) -> dict[str, Any]:
    data = {"hash": scan_hash}
    if rescan:
        data["re_scan"] = "1"
    return await _json(
        settings,
        "POST",
        "/api/v1/scan",
        data=data,
        timeout=settings.mobile_security_scan_timeout_seconds,
    )


async def report_json(settings: Settings, scan_hash: str) -> dict[str, Any]:
    return await _json(settings, "POST", "/api/v1/report_json", data={"hash": scan_hash})


async def scorecard(settings: Settings, scan_hash: str) -> dict[str, Any]:
    return await _json(settings, "POST", "/api/v1/scorecard", data={"hash": scan_hash})


async def scan_logs(settings: Settings, scan_hash: str) -> dict[str, Any]:
    return await _json(settings, "POST", "/api/v1/scan_logs", data={"hash": scan_hash})


async def pdf_report(settings: Settings, scan_hash: str) -> bytes:
    resp = await _request(
        settings,
        "POST",
        "/api/v1/download_pdf",
        data={"hash": scan_hash},
        timeout=settings.mobile_security_scan_timeout_seconds,
    )
    if "application/pdf" not in resp.headers.get("content-type", ""):
        raise MobileSecurityApiError("PDF generation failed")
    return resp.content


async def view_source(settings: Settings, scan_hash: str, file: str, source_type: str) -> dict[str, Any]:
    return await _json(
        settings,
        "POST",
        "/api/v1/view_source",
        data={"hash": scan_hash, "file": file, "type": source_type},
    )


async def compare(settings: Settings, hash1: str, hash2: str) -> dict[str, Any]:
    return await _json(
        settings,
        "POST",
        "/api/v1/compare",
        data={"hash1": hash1, "hash2": hash2},
        timeout=settings.mobile_security_scan_timeout_seconds,
    )


async def delete_scan(settings: Settings, scan_hash: str) -> None:
    await _request(settings, "POST", "/api/v1/delete_scan", data={"hash": scan_hash})

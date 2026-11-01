import json
import re
from datetime import UTC, datetime
from pathlib import PurePath
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.constants import (
    MOBILE_DYNAMIC_REPORTS_COLLECTION,
    MOBILE_DYNAMIC_SESSIONS_COLLECTION,
    MOBILE_DYNAMIC_SHOTS_COLLECTION,
    MOBILE_SECURITY_SCANS_COLLECTION,
)
from app.db import get_database
from app.dependencies.access import require_mobile_access, require_mobile_permission
from app.dependencies.auth import require_auth_user
from app.schemas.mobile_security import MobileSecurityEmbedOut
from app.services import mobile_security_client as engine
from app.services.access import has_permission
from app.services.mobile_report_pdf import build_mobile_report_pdf
from app.services.mobile_security_actions import ENGINE_ACTIONS, EngineAction
from app.services.mobile_bridge import (
    ProwlerBridgeError,
    get_mobile_security_embed_path,
)
from app.services.mobile_security_client import MobileSecurityApiError

router = APIRouter(prefix="/auth", tags=["auth"])
scans_router = APIRouter(prefix="/mobile-security", tags=["mobile-security"])

_HASH_RE = re.compile(r"^[0-9a-f]{32}$")
_ALLOWED_EXTENSIONS = {
    ".apk", ".xapk", ".apks", ".aab", ".jar", ".aar", ".so",
    ".ipa", ".dylib", ".a", ".zip", ".appx",
}
_SOURCE_TYPES = {"apk", "studio", "eclipse", "java", "smali", "xml", "ipa", "ios"}
_PENDING = {"scanning", "queued"}


@router.get("/mobile-security/embed", response_model=MobileSecurityEmbedOut)
async def mobile_security_embed(
    user: dict = Depends(require_mobile_access),
    settings: Settings = Depends(get_settings),
) -> MobileSecurityEmbedOut:
    try:
        embed_path = get_mobile_security_embed_path(settings, user)
    except ProwlerBridgeError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=exc.message)
    return MobileSecurityEmbedOut(embed_path=embed_path)


def _now() -> datetime:
    return datetime.now(UTC)


def _engine_error(exc: MobileSecurityApiError) -> HTTPException:
    code = exc.status_code if exc.status_code in {400, 404, 422, 503, 504} else 502
    return HTTPException(code, detail=exc.message)


def _scan_out(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "hash": doc["hash"],
        "file_name": doc.get("file_name", ""),
        "scan_type": doc.get("scan_type", ""),
        "status": doc.get("status", "completed"),
        "error": doc.get("error"),
        "app_name": doc.get("app_name") or "",
        "package_name": doc.get("package_name") or "",
        "version_name": doc.get("version_name") or "",
        "security_score": doc.get("security_score"),
        "severity": doc.get("severity") or {},
        "uploaded_by": doc.get("uploaded_by", ""),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


def _valid_hash(scan_hash: str) -> str:
    if not _HASH_RE.fullmatch(scan_hash):
        raise HTTPException(400, "Invalid scan hash")
    return scan_hash


async def _owned_scan(db: AsyncIOMotorDatabase, user: dict, scan_hash: str) -> dict[str, Any]:
    doc = await db[MOBILE_SECURITY_SCANS_COLLECTION].find_one(
        {"organization_id": user["organization_id"], "hash": _valid_hash(scan_hash)}
    )
    if not doc:
        raise HTTPException(404, "Scan not found")
    return doc


def _summary_from_scorecard(card: dict[str, Any]) -> dict[str, Any]:
    return {
        "app_name": card.get("app_name") or "",
        "version_name": card.get("version_name") or "",
        "security_score": card.get("security_score"),
        "severity": {
            key: len(card.get(key) or [])
            for key in ("high", "warning", "info", "secure", "hotspot")
        },
    }


async def _complete(db: AsyncIOMotorDatabase, settings: Settings, doc_id: Any, scan_hash: str, extra: dict[str, Any]) -> bool:
    try:
        card = await engine.scorecard(settings, scan_hash)
    except MobileSecurityApiError:
        return False
    await db[MOBILE_SECURITY_SCANS_COLLECTION].update_one(
        {"_id": doc_id},
        {"$set": {**extra, **_summary_from_scorecard(card), "status": "completed", "error": None, "updated_at": _now()}},
    )
    return True


async def _run_scan(db: AsyncIOMotorDatabase, settings: Settings, doc_id: Any, scan_hash: str, rescan: bool) -> None:
    try:
        result = await engine.scan(settings, scan_hash, rescan=rescan)
    except MobileSecurityApiError as exc:
        await db[MOBILE_SECURITY_SCANS_COLLECTION].update_one(
            {"_id": doc_id},
            {"$set": {"status": "failed", "error": exc.message, "updated_at": _now()}},
        )
        return
    if "task_id" in result:
        await db[MOBILE_SECURITY_SCANS_COLLECTION].update_one(
            {"_id": doc_id}, {"$set": {"status": "queued", "updated_at": _now()}}
        )
        return
    extra = {"package_name": result.get("package_name") or result.get("bundle_id") or ""}
    if not await _complete(db, settings, doc_id, scan_hash, extra):
        await db[MOBILE_SECURITY_SCANS_COLLECTION].update_one(
            {"_id": doc_id}, {"$set": {**extra, "status": "completed", "updated_at": _now()}}
        )


async def _refresh_queued(db: AsyncIOMotorDatabase, settings: Settings, docs: list[dict[str, Any]]) -> None:
    # Async engine mode: completion is detected once the scorecard becomes available.
    for doc in docs:
        if doc.get("status") == "queued" and await _complete(db, settings, doc["_id"], doc["hash"], {}):
            doc.update(await db[MOBILE_SECURITY_SCANS_COLLECTION].find_one({"_id": doc["_id"]}) or {})


@scans_router.get("/status")
async def engine_status(
    _: dict = Depends(require_mobile_access),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    if not engine.is_configured(settings):
        return {"configured": False, "reachable": False}
    try:
        await engine.ping(settings)
    except MobileSecurityApiError as exc:
        return {"configured": True, "reachable": False, "detail": exc.message}
    return {"configured": True, "reachable": True}


@scans_router.get("/scans")
async def list_scans(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: str = Query("", max_length=200),
    user: dict = Depends(require_mobile_permission("view")),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    query: dict[str, Any] = {"organization_id": user["organization_id"]}
    if q.strip():
        pattern = re.escape(q.strip())
        query["$or"] = [
            {field: {"$regex": pattern, "$options": "i"}}
            for field in ("file_name", "app_name", "package_name", "hash")
        ]
    coll = db[MOBILE_SECURITY_SCANS_COLLECTION]
    total = await coll.count_documents(query)
    docs = await coll.find(query).sort("updated_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    await _refresh_queued(db, settings, docs)
    return {"items": [_scan_out(d) for d in docs], "total": total, "page": page, "page_size": page_size}


@scans_router.post("/scans", status_code=status.HTTP_202_ACCEPTED)
async def upload_and_scan(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    user: dict = Depends(require_mobile_permission("execute")),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    file_name = PurePath(file.filename or "").name
    if PurePath(file_name).suffix.lower() not in _ALLOWED_EXTENSIONS:
        raise HTTPException(400, "Unsupported file type. Upload an APK, AAB, XAPK, IPA, APPX, JAR, AAR, SO or source ZIP.")
    max_bytes = settings.mobile_security_max_upload_mb * 1024 * 1024
    if file.size is not None and file.size > max_bytes:
        raise HTTPException(413, f"File exceeds {settings.mobile_security_max_upload_mb} MB limit")
    try:
        uploaded = await engine.upload(settings, file_name, file.file, file.content_type or "")
    except MobileSecurityApiError as exc:
        raise _engine_error(exc) from exc
    scan_hash = str(uploaded.get("hash", ""))
    if not _HASH_RE.fullmatch(scan_hash):
        raise HTTPException(502, "Mobile Security engine returned an invalid hash")
    now = _now()
    coll = db[MOBILE_SECURITY_SCANS_COLLECTION]
    await coll.update_one(
        {"organization_id": user["organization_id"], "hash": scan_hash},
        {
            "$set": {
                "file_name": uploaded.get("file_name") or file_name,
                "scan_type": uploaded.get("scan_type") or "",
                "status": "scanning",
                "error": None,
                "uploaded_by": user.get("email", ""),
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    doc = await coll.find_one({"organization_id": user["organization_id"], "hash": scan_hash})
    background.add_task(_run_scan, db, settings, doc["_id"], scan_hash, False)
    return _scan_out(doc)


@scans_router.get("/scans/{scan_hash}")
async def get_scan(
    scan_hash: str,
    user: dict = Depends(require_mobile_permission("view")),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    doc = await _owned_scan(db, user, scan_hash)
    await _refresh_queued(db, settings, [doc])
    return _scan_out(doc)


@scans_router.post("/scans/{scan_hash}/rescan", status_code=status.HTTP_202_ACCEPTED)
async def rescan(
    scan_hash: str,
    background: BackgroundTasks,
    user: dict = Depends(require_mobile_permission("execute")),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    doc = await _owned_scan(db, user, scan_hash)
    if doc.get("status") in _PENDING:
        raise HTTPException(409, "A scan is already in progress")
    await db[MOBILE_SECURITY_SCANS_COLLECTION].update_one(
        {"_id": doc["_id"]}, {"$set": {"status": "scanning", "error": None, "updated_at": _now()}}
    )
    background.add_task(_run_scan, db, settings, doc["_id"], doc["hash"], True)
    doc.update(status="scanning", error=None)
    return _scan_out(doc)


@scans_router.delete("/scans/{scan_hash}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scan(
    scan_hash: str,
    user: dict = Depends(require_mobile_permission("edit")),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> Response:
    doc = await _owned_scan(db, user, scan_hash)
    coll = db[MOBILE_SECURITY_SCANS_COLLECTION]
    await coll.delete_one({"_id": doc["_id"]})
    # The engine stores one result per file hash; keep it while another org still references it.
    if not await coll.count_documents({"hash": doc["hash"]}):
        try:
            await engine.delete_scan(settings, doc["hash"])
        except MobileSecurityApiError:
            pass
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _completed_scan(db: AsyncIOMotorDatabase, user: dict, scan_hash: str) -> dict[str, Any]:
    doc = await _owned_scan(db, user, scan_hash)
    if doc.get("status") != "completed":
        raise HTTPException(409, "Scan has not completed yet")
    return doc


@scans_router.get("/scans/{scan_hash}/report")
async def scan_report(
    scan_hash: str,
    user: dict = Depends(require_mobile_permission("view")),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    doc = await _completed_scan(db, user, scan_hash)
    try:
        return await engine.report_json(settings, doc["hash"])
    except MobileSecurityApiError as exc:
        raise _engine_error(exc) from exc


@scans_router.get("/scans/{scan_hash}/scorecard")
async def scan_scorecard(
    scan_hash: str,
    user: dict = Depends(require_mobile_permission("view")),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    doc = await _completed_scan(db, user, scan_hash)
    try:
        return await engine.scorecard(settings, doc["hash"])
    except MobileSecurityApiError as exc:
        raise _engine_error(exc) from exc


@scans_router.get("/scans/{scan_hash}/logs")
async def scan_logs(
    scan_hash: str,
    user: dict = Depends(require_mobile_permission("view")),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    doc = await _owned_scan(db, user, scan_hash)
    try:
        return await engine.scan_logs(settings, doc["hash"])
    except MobileSecurityApiError as exc:
        if exc.status_code == 400:
            return {"logs": []}
        raise _engine_error(exc) from exc


@scans_router.get("/scans/{scan_hash}/pdf")
async def scan_pdf(
    scan_hash: str,
    user: dict = Depends(require_mobile_permission("view")),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> Response:
    doc = await _completed_scan(db, user, scan_hash)
    try:
        report = await engine.report_json(settings, doc["hash"])
        try:
            card = await engine.scorecard(settings, doc["hash"])
        except MobileSecurityApiError:
            card = None
    except MobileSecurityApiError as exc:
        raise _engine_error(exc) from exc
    org_settings = await db["organization_settings"].find_one(
        {"organization_id": user["organization_id"]}, {"branding": 1}
    ) or {}
    logo_b64 = (org_settings.get("branding") or {}).get("logo_base64")
    pdf = await run_in_threadpool(build_mobile_report_pdf, report, card, doc, logo_b64)
    stem = re.sub(r"[^A-Za-z0-9._-]", "_", PurePath(doc.get("file_name") or doc["hash"]).stem)[:80]
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{stem or "report"}-mobile-security.pdf"'},
    )


@scans_router.get("/scans/{scan_hash}/icon")
async def scan_icon(
    scan_hash: str,
    user: dict = Depends(require_mobile_permission("view")),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> Response:
    doc = await _owned_scan(db, user, scan_hash)
    try:
        resp = await engine.call(settings, "POST", "/api/v1/icon", data={"hash": doc["hash"]})
    except MobileSecurityApiError as exc:
        raise _engine_error(exc) from exc
    ctype = resp.headers.get("content-type", "")
    if not ctype.startswith("image/") or "svg" in ctype:
        raise HTTPException(404, "Icon not found")
    return Response(
        content=resp.content,
        media_type=ctype,
        headers={"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"},
    )


@scans_router.get("/scans/{scan_hash}/source")
async def scan_source(
    scan_hash: str,
    file: str = Query(..., min_length=1, max_length=1024),
    type: str = Query(...),
    user: dict = Depends(require_mobile_permission("view")),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    if type not in _SOURCE_TYPES:
        raise HTTPException(400, "Invalid source type")
    doc = await _completed_scan(db, user, scan_hash)
    try:
        return await engine.view_source(settings, doc["hash"], file, type)
    except MobileSecurityApiError as exc:
        raise _engine_error(exc) from exc


@scans_router.get("/compare")
async def compare_scans(
    hash1: str,
    hash2: str,
    user: dict = Depends(require_mobile_permission("view")),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    if hash1 == hash2:
        raise HTTPException(400, "Select two different scans")
    first = await _completed_scan(db, user, hash1)
    second = await _completed_scan(db, user, hash2)
    try:
        return await engine.compare(settings, first["hash"], second["hash"])
    except MobileSecurityApiError as exc:
        raise _engine_error(exc) from exc


ParamValue = str | int | float | bool | list[str]


class EngineActionIn(BaseModel):
    params: dict[str, ParamValue] = Field(default_factory=dict)


def _form(params: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in params.items():
        if isinstance(value, bool):
            out[key] = "1" if value else "0"
        elif isinstance(value, list):
            out[key] = [str(v) for v in value]
        else:
            out[key] = str(value)
    return out


async def _authorize_action(
    name: str, user: dict, db: AsyncIOMotorDatabase, params: dict[str, Any]
) -> EngineAction:
    action = ENGINE_ACTIONS.get(name)
    if action is None:
        raise HTTPException(404, "Unknown Mobile Security action")
    if not has_permission(user, action.permission, module="mobile_security"):
        raise HTTPException(403, f"Mobile Security {action.permission} permission required")
    for key in action.owned:
        value = params.get(key)
        if not isinstance(value, str) or not value:
            raise HTTPException(422, f"Missing parameter: {key}")
        await _owned_scan(db, user, value)
    return action


async def _engine_response(
    name: str, resp: Any, user: dict, db: AsyncIOMotorDatabase
) -> Response:
    ctype = resp.headers.get("content-type", "")
    if "application/json" in ctype:
        body = resp.json()
        if name in {"static.tasks", "dynamic.get_apps", "ios.dynamic_analysis", "ios.device_dynamic_analysis"}:
            # The engine is shared across tenants; only expose this organization's scans.
            owned = {
                d["hash"]
                async for d in db[MOBILE_SECURITY_SCANS_COLLECTION].find(
                    {"organization_id": user["organization_id"]}, {"hash": 1}
                )
            }
            if name == "static.tasks" and isinstance(body, list):
                body = [t for t in body if isinstance(t, dict) and t.get("checksum") in owned]
            elif isinstance(body, dict) and isinstance(body.get("apps"), list):
                body["apps"] = [a for a in body["apps"] if isinstance(a, dict) and a.get("MD5") in owned]
        return JSONResponse(body)
    headers = {}
    if resp.headers.get("content-disposition"):
        headers["Content-Disposition"] = resp.headers["content-disposition"]
    return Response(content=resp.content, media_type=ctype or "application/octet-stream", headers=headers)


@scans_router.post("/engine/{name}")
async def engine_action(
    name: str,
    payload: EngineActionIn,
    user: dict = Depends(require_auth_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> Response:
    action = await _authorize_action(name, user, db, payload.params)
    data = _form(payload.params)
    if action.stream:
        return StreamingResponse(
            engine.stream(settings, action.path, data),
            media_type="text/plain; charset=utf-8",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    try:
        resp = await engine.call(settings, action.method, action.path, data=data)
    except MobileSecurityApiError as exc:
        raise _engine_error(exc) from exc
    scan_hash = str(payload.params.get("hash", ""))
    if name == "dynamic.start_analysis":
        await _start_dynamic_session(db, user, scan_hash)
    elif name == "dynamic.stop_analysis":
        report_id = await _snapshot_dynamic_report(db, settings, user, scan_hash)
        body = resp.json() if "application/json" in resp.headers.get("content-type", "") else {}
        return JSONResponse({**(body if isinstance(body, dict) else {}), "report_id": report_id})
    elif name == "android.screenshots":
        session = await _current_session(db, user, scan_hash)
        body = resp.json()
        if session and isinstance(body, dict):
            body["screenshots"] = _session_shots(body.get("screenshots"), session)
            body["session_started_at"] = session["started_at"].isoformat()
        return JSONResponse(body)
    return await _engine_response(name, resp, user, db)


async def _current_session(db: AsyncIOMotorDatabase, user: dict, scan_hash: str) -> dict[str, Any] | None:
    return await db[MOBILE_DYNAMIC_SESSIONS_COLLECTION].find_one(
        {"organization_id": user["organization_id"], "hash": scan_hash},
        sort=[("started_at", -1)],
    )


def _session_shots(shots: Any, session: dict[str, Any]) -> list[dict[str, Any]]:
    started = session["started_at"]
    if started.tzinfo is None:
        started = started.replace(tzinfo=UTC)
    since = started.timestamp() - 2
    return [s for s in (shots or []) if isinstance(s, dict) and float(s.get("mtime") or 0) >= since]


async def _start_dynamic_session(db: AsyncIOMotorDatabase, user: dict, scan_hash: str) -> None:
    await db[MOBILE_DYNAMIC_SESSIONS_COLLECTION].insert_one(
        {
            "organization_id": user["organization_id"],
            "hash": scan_hash,
            "started_at": _now(),
            "started_by": user.get("email", ""),
            "report_id": None,
        }
    )


async def _snapshot_dynamic_report(
    db: AsyncIOMotorDatabase, settings: Settings, user: dict, scan_hash: str
) -> str | None:
    """Persist this run's report so later runs don't overwrite it in history."""
    session = await _current_session(db, user, scan_hash)
    try:
        report = (await engine.call(settings, "POST", "/api/v1/dynamic/report_json", data={"hash": scan_hash})).json()
    except MobileSecurityApiError:
        return None
    shots: list[dict[str, Any]] = []
    try:
        raw = (await engine.call(settings, "POST", "/api/v1/android/screenshots", data={"hash": scan_hash})).json()
        shots = _session_shots(raw.get("screenshots"), session) if session else list(raw.get("screenshots") or [])
    except (MobileSecurityApiError, ValueError, AttributeError):
        shots = []
    doc = {
        "organization_id": user["organization_id"],
        "hash": scan_hash,
        "session_id": session["_id"] if session else None,
        "started_at": session["started_at"] if session else None,
        "created_at": _now(),
        "created_by": user.get("email", ""),
        "report": report,
        "screenshot_count": len(shots),
    }
    try:
        result = await db[MOBILE_DYNAMIC_REPORTS_COLLECTION].insert_one(doc)
    except Exception:
        # Oversized engine payloads: keep the run, drop the bulky raw report.
        doc["report"] = {"error": "Report too large to archive"}
        result = await db[MOBILE_DYNAMIC_REPORTS_COLLECTION].insert_one(doc)
    if shots:
        await db[MOBILE_DYNAMIC_SHOTS_COLLECTION].insert_many(
            [{"report_id": result.inserted_id, "name": s.get("name"), "mtime": s.get("mtime"), "data": s.get("data")} for s in shots]
        )
    if session:
        await db[MOBILE_DYNAMIC_SESSIONS_COLLECTION].update_one(
            {"_id": session["_id"]}, {"$set": {"report_id": result.inserted_id, "stopped_at": _now()}}
        )
    return str(result.inserted_id)


def _report_meta(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(doc["_id"]),
        "hash": doc["hash"],
        "started_at": doc.get("started_at"),
        "created_at": doc.get("created_at"),
        "created_by": doc.get("created_by", ""),
        "screenshot_count": doc.get("screenshot_count", 0),
    }


async def _owned_report(db: AsyncIOMotorDatabase, user: dict, report_id: str) -> dict[str, Any]:
    try:
        oid = ObjectId(report_id)
    except (InvalidId, TypeError) as exc:
        raise HTTPException(400, "Invalid report id") from exc
    doc = await db[MOBILE_DYNAMIC_REPORTS_COLLECTION].find_one({"_id": oid, "organization_id": user["organization_id"]})
    if not doc:
        raise HTTPException(404, "Report not found")
    return doc


@scans_router.get("/scans/{scan_hash}/dynamic/session")
async def dynamic_session(
    scan_hash: str,
    user: dict = Depends(require_mobile_permission("view")),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict[str, Any]:
    await _owned_scan(db, user, scan_hash)
    s = await _current_session(db, user, scan_hash)
    if not s:
        return {"session": None}
    return {
        "session": {
            "started_at": s["started_at"],
            "started_by": s.get("started_by", ""),
            "stopped_at": s.get("stopped_at"),
            "report_id": str(s["report_id"]) if s.get("report_id") else None,
        }
    }


@scans_router.get("/scans/{scan_hash}/dynamic/reports")
async def dynamic_reports(
    scan_hash: str,
    user: dict = Depends(require_mobile_permission("view")),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict[str, Any]:
    await _owned_scan(db, user, scan_hash)
    docs = await db[MOBILE_DYNAMIC_REPORTS_COLLECTION].find(
        {"organization_id": user["organization_id"], "hash": scan_hash}, {"report": 0}
    ).sort("created_at", -1).to_list(200)
    return {"items": [_report_meta(d) for d in docs]}


@scans_router.get("/dynamic/reports/{report_id}")
async def dynamic_report_detail(
    report_id: str,
    user: dict = Depends(require_mobile_permission("view")),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict[str, Any]:
    doc = await _owned_report(db, user, report_id)
    shots = await db[MOBILE_DYNAMIC_SHOTS_COLLECTION].find({"report_id": doc["_id"]}, {"_id": 0, "report_id": 0}).sort("mtime", 1).to_list(500)
    return {**_report_meta(doc), "report": doc.get("report") or {}, "screenshots": shots}


@scans_router.delete("/dynamic/reports/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dynamic_report(
    report_id: str,
    user: dict = Depends(require_mobile_permission("edit")),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> Response:
    doc = await _owned_report(db, user, report_id)
    await db[MOBILE_DYNAMIC_SHOTS_COLLECTION].delete_many({"report_id": doc["_id"]})
    await db[MOBILE_DYNAMIC_REPORTS_COLLECTION].delete_one({"_id": doc["_id"]})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


_UPLOAD_ACTIONS = {"ios.file_upload", "ios.device_file_upload"}


@scans_router.post("/engine/{name}/upload")
async def engine_upload_action(
    name: str,
    file: UploadFile = File(...),
    params: str = Form("{}"),
    user: dict = Depends(require_auth_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> Response:
    if name not in _UPLOAD_ACTIONS:
        raise HTTPException(404, "Unknown Mobile Security upload action")
    try:
        parsed = json.loads(params)
    except ValueError as exc:
        raise HTTPException(400, "Invalid params") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(400, "Invalid params")
    action = await _authorize_action(name, user, db, parsed)
    file_name = PurePath(file.filename or "upload.bin").name
    try:
        resp = await engine.call(
            settings,
            "POST",
            action.path,
            data=_form(parsed),
            files={"file": (file_name, file.file, file.content_type or "application/octet-stream")},
        )
    except MobileSecurityApiError as exc:
        raise _engine_error(exc) from exc
    return await _engine_response(name, resp, user, db)


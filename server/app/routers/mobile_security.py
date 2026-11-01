import re
from datetime import UTC, datetime
from pathlib import PurePath
from typing import Any

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import Settings, get_settings
from app.constants import MOBILE_SECURITY_SCANS_COLLECTION
from app.db import get_database
from app.dependencies.access import require_mobile_access, require_mobile_permission
from app.schemas.mobile_security import MobileSecurityEmbedOut
from app.services import mobile_security_client as engine
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
        pdf = await engine.pdf_report(settings, doc["hash"])
    except MobileSecurityApiError as exc:
        raise _engine_error(exc) from exc
    stem = re.sub(r"[^A-Za-z0-9._-]", "_", PurePath(doc.get("file_name") or doc["hash"]).stem)[:80]
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{stem or "report"}-mobile-security.pdf"'},
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


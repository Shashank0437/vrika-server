"""License administration router — customer & license management for internal admins."""

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db import get_database
from app.dependencies.auth import require_auth_user
from app.schemas.license_admin import (
    CustomerCreate,
    CustomerOut,
    CustomerUpdate,
    LicenseDashboardOut,
    LicenseActivityOut,
    LicenseGenerate,
    LicenseOut,
    LicenseStatus,
    MachineInfoUpload,
)
from app.services.license_signing import LicenseSigningService
from app.services.machine_fingerprint import MachineFingerprintService
from app.services.agent_client import AgentUnreachableError, fetch_agent_health_and_catalog, tool_installed_from_agent_health

router = APIRouter(prefix="/license-admin", tags=["license-admin"])

CUSTOMERS_COLLECTION = "license_customers"
LICENSES_COLLECTION = "licenses"
LICENSE_ACTIVITY_COLLECTION = "license_activity"


# --- Helpers ---


def _require_license_admin(user: dict) -> None:
    """Ensure user has license_admin or tenant_admin role."""
    roles = user.get("roles", [])
    if "license_admin" not in roles and "tenant_admin" not in roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="License admin access required")


def _oid(s: str) -> ObjectId:
    try:
        return ObjectId(s)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ID format")


def _customer_out(doc: dict, licenses_count: int = 0) -> CustomerOut:
    return CustomerOut(
        id=str(doc["_id"]),
        name=doc["name"],
        email=doc["email"],
        organization=doc["organization"],
        created_at=doc["created_at"],
        licenses_count=licenses_count,
    )


def _license_out(doc: dict) -> LicenseOut:
    # Auto-expire if past expiry date
    exp = doc["expires_at"]
    current_status = doc["status"]
    if current_status == "active" and exp < datetime.now(timezone.utc):
        current_status = "expired"

    return LicenseOut(
        id=str(doc["_id"]),
        customer_id=str(doc["customer_id"]),
        customer_name=doc.get("customer_name", ""),
        customer_email=doc.get("customer_email", ""),
        product=doc["product"],
        edition=doc.get("edition", "enterprise"),
        license_type=doc.get("license_type", "enterprise"),
        features=doc["features"],
        allowed_tools=doc.get("allowed_tools", []),
        machine_fingerprint=doc["machine_fingerprint"],
        expires_at=exp,
        status=current_status,
        created_at=doc["created_at"],
        version=doc.get("version", "1.0"),
    )


async def _log_activity(
    db: AsyncIOMotorDatabase, action: str, license_id: str, customer_name: str
) -> None:
    await db[LICENSE_ACTIVITY_COLLECTION].insert_one({
        "action": action,
        "license_id": license_id,
        "customer_name": customer_name,
        "timestamp": datetime.now(timezone.utc),
    })


# --- Dashboard ---


@router.get("/dashboard", response_model=LicenseDashboardOut)
async def license_dashboard(
    user: dict = Depends(require_auth_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> LicenseDashboardOut:
    _require_license_admin(user)

    total_customers = await db[CUSTOMERS_COLLECTION].count_documents({})
    now = datetime.now(timezone.utc)
    active_licenses = await db[LICENSES_COLLECTION].count_documents({"status": "active", "expires_at": {"$gte": now}})
    expired_licenses = await db[LICENSES_COLLECTION].count_documents({
        "$or": [{"status": "expired"}, {"status": "active", "expires_at": {"$lt": now}}]
    })

    # Feature usage counts
    pipeline = [
        {"$match": {"status": "active", "expires_at": {"$gte": now}}},
        {"$unwind": "$features"},
        {"$group": {"_id": "$features", "count": {"$sum": 1}}},
    ]
    feature_counts: dict[str, int] = {}
    async for doc in db[LICENSES_COLLECTION].aggregate(pipeline):
        feature_counts[doc["_id"]] = doc["count"]

    # Recent activity
    activity_cursor = db[LICENSE_ACTIVITY_COLLECTION].find().sort("timestamp", -1).limit(10)
    recent: list[LicenseActivityOut] = []
    async for doc in activity_cursor:
        recent.append(LicenseActivityOut(
            id=str(doc["_id"]),
            action=doc["action"],
            license_id=doc["license_id"],
            customer_name=doc["customer_name"],
            timestamp=doc["timestamp"],
        ))

    return LicenseDashboardOut(
        total_customers=total_customers,
        active_licenses=active_licenses,
        expired_licenses=expired_licenses,
        enabled_features=feature_counts,
        recent_activity=recent,
    )


# --- Customers CRUD ---


@router.get("/customers", response_model=list[CustomerOut])
async def list_customers(
    user: dict = Depends(require_auth_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[CustomerOut]:
    _require_license_admin(user)
    cursor = db[CUSTOMERS_COLLECTION].find().sort("created_at", -1)
    results: list[CustomerOut] = []
    async for doc in cursor:
        lic_count = await db[LICENSES_COLLECTION].count_documents({"customer_id": doc["_id"]})
        results.append(_customer_out(doc, lic_count))
    return results


@router.get("/customers/{customer_id}", response_model=CustomerOut)
async def get_customer(
    customer_id: str,
    user: dict = Depends(require_auth_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> CustomerOut:
    _require_license_admin(user)
    doc = await db[CUSTOMERS_COLLECTION].find_one({"_id": _oid(customer_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Customer not found")
    lic_count = await db[LICENSES_COLLECTION].count_documents({"customer_id": doc["_id"]})
    return _customer_out(doc, lic_count)


@router.post("/customers", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
async def create_customer(
    body: CustomerCreate,
    user: dict = Depends(require_auth_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> CustomerOut:
    _require_license_admin(user)

    existing = await db[CUSTOMERS_COLLECTION].find_one({"email": body.email})
    if existing:
        raise HTTPException(status_code=409, detail="A customer with this email already exists")

    doc = {
        "name": body.name,
        "email": body.email,
        "organization": body.organization,
        "created_at": datetime.now(timezone.utc),
    }
    result = await db[CUSTOMERS_COLLECTION].insert_one(doc)
    doc["_id"] = result.inserted_id
    return _customer_out(doc)


@router.patch("/customers/{customer_id}", response_model=CustomerOut)
async def update_customer(
    customer_id: str,
    body: CustomerUpdate,
    user: dict = Depends(require_auth_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> CustomerOut:
    _require_license_admin(user)
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = await db[CUSTOMERS_COLLECTION].find_one_and_update(
        {"_id": _oid(customer_id)},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Customer not found")
    lic_count = await db[LICENSES_COLLECTION].count_documents({"customer_id": result["_id"]})
    return _customer_out(result, lic_count)


@router.delete("/customers/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer(
    customer_id: str,
    user: dict = Depends(require_auth_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> None:
    _require_license_admin(user)
    oid = _oid(customer_id)
    lic_count = await db[LICENSES_COLLECTION].count_documents({"customer_id": oid, "status": "active"})
    if lic_count > 0:
        raise HTTPException(status_code=409, detail="Cannot delete customer with active licenses. Revoke them first.")
    result = await db[CUSTOMERS_COLLECTION].delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")


# --- Licenses ---


@router.get("/licenses", response_model=list[LicenseOut])
async def list_licenses(
    user: dict = Depends(require_auth_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[LicenseOut]:
    _require_license_admin(user)
    cursor = db[LICENSES_COLLECTION].find().sort("created_at", -1)
    return [_license_out(doc) async for doc in cursor]


@router.get("/customers/{customer_id}/licenses", response_model=list[LicenseOut])
async def list_customer_licenses(
    customer_id: str,
    user: dict = Depends(require_auth_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[LicenseOut]:
    _require_license_admin(user)
    cursor = db[LICENSES_COLLECTION].find({"customer_id": _oid(customer_id)}).sort("created_at", -1)
    return [_license_out(doc) async for doc in cursor]


@router.get("/licenses/{license_id}", response_model=LicenseOut)
async def get_license(
    license_id: str,
    user: dict = Depends(require_auth_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> LicenseOut:
    _require_license_admin(user)
    doc = await db[LICENSES_COLLECTION].find_one({"_id": _oid(license_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="License not found")
    return _license_out(doc)


@router.post("/machine-info/hash")
async def hash_machine_info(
    body: MachineInfoUpload,
    user: dict = Depends(require_auth_user),
) -> dict[str, str]:
    """Upload machine-info.json contents and get back SHA256 fingerprint.

    Admin uploads the machine-info.json collected from customer's server.
    Returns the fingerprint hash to use in license generation.
    """
    _require_license_admin(user)

    try:
        fingerprint = MachineFingerprintService.generate_fingerprint(body.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"fingerprint": fingerprint}


@router.get("/available-tools")
async def list_available_tools(
    user: dict = Depends(require_auth_user),
):
    """Return list of all tools from the agent catalog for license tool selection.

    Returns [{name, description, category, active}, ...] sorted by name.
    """
    _require_license_admin(user)
    from app.config import get_settings
    settings = get_settings()

    try:
        health, catalog = await fetch_agent_health_and_catalog(settings)
    except AgentUnreachableError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Agent unreachable: {e.message}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch tool catalog: {str(e)}",
        )

    raw_tools = catalog.get("tools")
    if not isinstance(raw_tools, list):
        return []

    tools = []
    for item in raw_tools:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        tools.append({
            "name": name,
            "description": str(item.get("desc") or item.get("description") or "").strip(),
            "category": str(item.get("category") or "uncategorized"),
            "active": str(tool_installed_from_agent_health(health, item)),
        })

    tools.sort(key=lambda t: t["name"])
    return tools


@router.post("/licenses/generate", response_model=LicenseOut, status_code=status.HTTP_201_CREATED)
async def generate_license(
    body: LicenseGenerate,
    user: dict = Depends(require_auth_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> LicenseOut:
    _require_license_admin(user)

    customer = await db[CUSTOMERS_COLLECTION].find_one({"_id": _oid(body.customer_id)})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    try:
        expires = datetime.fromisoformat(body.expires_at).replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid expiry date format. Use YYYY-MM-DD.")

    if expires <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Expiry date must be in the future")

    doc: dict[str, Any] = {
        "version": "1.0",
        "license_type": body.license_type.value,
        "edition": body.edition.value,
        "customer_id": customer["_id"],
        "customer_name": customer["name"],
        "customer_email": customer["email"],
        "product": body.product,
        "features": [f.value for f in body.features],
        "allowed_tools": body.allowed_tools,
        "machine_fingerprint": body.machine_fingerprint,
        "expires_at": expires,
        "status": "active",
        "key_id": "prod-key-1",
        "created_at": datetime.now(timezone.utc),
        "created_by": str(user["_id"]),
    }
    result = await db[LICENSES_COLLECTION].insert_one(doc)
    doc["_id"] = result.inserted_id

    await _log_activity(db, "generated", str(result.inserted_id), customer["name"])

    return _license_out(doc)


@router.post("/licenses/{license_id}/revoke", response_model=LicenseOut)
async def revoke_license(
    license_id: str,
    user: dict = Depends(require_auth_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> LicenseOut:
    _require_license_admin(user)
    oid = _oid(license_id)
    doc = await db[LICENSES_COLLECTION].find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="License not found")
    if doc["status"] == "revoked":
        raise HTTPException(status_code=400, detail="License is already revoked")

    await db[LICENSES_COLLECTION].update_one(
        {"_id": oid},
        {"$set": {"status": "revoked", "revoked_at": datetime.now(timezone.utc), "revoked_by": str(user["_id"])}},
    )
    doc["status"] = "revoked"

    await _log_activity(db, "revoked", license_id, doc.get("customer_name", ""))

    return _license_out(doc)


@router.post("/licenses/{license_id}/suspend", response_model=LicenseOut)
async def suspend_license(
    license_id: str,
    user: dict = Depends(require_auth_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> LicenseOut:
    _require_license_admin(user)
    oid = _oid(license_id)
    doc = await db[LICENSES_COLLECTION].find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="License not found")
    if doc["status"] != "active":
        raise HTTPException(status_code=400, detail=f"Can only suspend active licenses. Current: {doc['status']}")

    await db[LICENSES_COLLECTION].update_one(
        {"_id": oid},
        {"$set": {"status": "suspended", "suspended_at": datetime.now(timezone.utc), "suspended_by": str(user["_id"])}},
    )
    doc["status"] = "suspended"

    await _log_activity(db, "suspended", license_id, doc.get("customer_name", ""))

    return _license_out(doc)


@router.post("/licenses/{license_id}/reactivate", response_model=LicenseOut)
async def reactivate_license(
    license_id: str,
    user: dict = Depends(require_auth_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> LicenseOut:
    _require_license_admin(user)
    oid = _oid(license_id)
    doc = await db[LICENSES_COLLECTION].find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="License not found")
    if doc["status"] != "suspended":
        raise HTTPException(status_code=400, detail="Can only reactivate suspended licenses.")

    await db[LICENSES_COLLECTION].update_one(
        {"_id": oid},
        {"$set": {"status": "active"}, "$unset": {"suspended_at": "", "suspended_by": ""}},
    )
    doc["status"] = "active"

    await _log_activity(db, "reactivated", license_id, doc.get("customer_name", ""))

    return _license_out(doc)


@router.get("/licenses/{license_id}/download")
async def download_license(
    license_id: str,
    format: str = "json",
    user: dict = Depends(require_auth_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> JSONResponse:
    """Download signed license — enterprise format with digital signature.

    Query params:
        format: "json" (default) or "key" (same payload, .key extension)
    """
    _require_license_admin(user)
    doc = await db[LICENSES_COLLECTION].find_one({"_id": _oid(license_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="License not found")

    # Build enterprise license payload
    license_data: dict[str, Any] = {
        "version": doc.get("version", "1.0"),
        "licenseId": f"LIC-{str(doc['_id'])}",
        "licenseType": doc.get("license_type", "enterprise"),
        "customer": {
            "name": doc["customer_name"],
            "email": doc.get("customer_email", ""),
            "organization": doc.get("customer_email", ""),
        },
        "product": {
            "name": doc["product"],
            "edition": doc.get("edition", "enterprise"),
        },
        "machine": {
            "fingerprint": doc["machine_fingerprint"],
        },
        "features": {
            "aiAgent": {"enabled": "ai_agent" in doc["features"]},
            "networkScanner": {"enabled": "network_scanner" in doc["features"]},
            "malwareAnalysis": {"enabled": "malware_analysis" in doc["features"]},
            "forensics": {"enabled": "forensics" in doc["features"]},
        },
        "allowedTools": doc.get("allowed_tools", []),
        "status": doc.get("status", "active"),
        "issuedAt": doc["created_at"].isoformat(),
        "expiresAt": doc["expires_at"].isoformat(),
        "issuer": {
            "name": "Vrika Security",
            "keyId": doc.get("key_id", "prod-key-1"),
        },
    }

    # Sign the license payload
    try:
        signature = LicenseSigningService.sign_license(license_data)
        license_data["signature"] = signature
    except RuntimeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"License signing failed: {e}. Ensure private key is configured.",
        )

    ext = "key" if format == "key" else "json"
    filename = f"vrika-license-{license_id}.{ext}"

    return JSONResponse(
        content=license_data,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


# --- License Validation (runs on customer's on-prem deployment) ---


@router.post("/validate")
async def validate_license_endpoint(
    body: dict[str, Any],
) -> dict[str, Any]:
    """Validate a license payload against current machine.

    Called by the on-prem product at startup. No auth required.
    Only needs the public key deployed with the product.

    Body should contain:
        - license: The full license.json content
        - machine_info: Fresh machine-info collected on this machine
    """
    license_data = body.get("license", body)
    machine_info_data = body.get("machine_info")

    # Step 1: Verify signature
    try:
        sig_valid = LicenseSigningService.verify_signature(license_data)
    except RuntimeError:
        return {"valid": False, "error": "INVALID_SIGNATURE", "message": "Public key not available for verification."}

    if not sig_valid:
        return {"valid": False, "error": "INVALID_SIGNATURE", "message": "License signature is invalid. Possible tampering detected."}

    # Step 2: Check license status
    status = license_data.get("status", "active")
    if status == "revoked":
        return {"valid": False, "error": "LICENSE_REVOKED", "message": "This license has been revoked."}
    if status == "suspended":
        return {"valid": False, "error": "LICENSE_SUSPENDED", "message": "This license has been suspended. Contact your vendor."}
    if status == "expired":
        return {"valid": False, "error": "LICENSE_EXPIRED", "message": "This license is marked as expired."}
    if status != "active":
        return {"valid": False, "error": "LICENSE_INVALID_STATUS", "message": f"License status '{status}' is not valid."}

    # Step 3: Check expiry
    expires_str = license_data.get("expiresAt", "")
    if expires_str:
        try:
            expires = datetime.fromisoformat(expires_str).replace(tzinfo=timezone.utc)
            if expires <= datetime.now(timezone.utc):
                return {"valid": False, "error": "LICENSE_EXPIRED", "message": f"License expired on {expires_str}."}
        except ValueError:
            return {"valid": False, "error": "LICENSE_EXPIRED", "message": "Invalid expiry date format."}

    # Step 4: Check machine fingerprint
    machine_block = license_data.get("machine", {})
    expected_fp = machine_block.get("fingerprint", "") if isinstance(machine_block, dict) else ""
    if not expected_fp:
        return {"valid": False, "error": "MACHINE_MISMATCH", "message": "License has no machine fingerprint."}

    if not machine_info_data:
        return {"valid": False, "error": "MACHINE_MISMATCH", "message": "No machine_info provided for validation."}

    fp_valid = MachineFingerprintService.validate_fingerprint(expected_fp, machine_info_data)
    if not fp_valid:
        return {"valid": False, "error": "MACHINE_MISMATCH", "message": "License not valid for this machine. Fingerprint mismatch."}

    # Step 5: Extract features (support both old and new format)
    raw_features = license_data.get("features", {})
    enabled_features: dict[str, bool] = {}
    for key, val in raw_features.items():
        if isinstance(val, dict):
            enabled_features[key] = val.get("enabled", False)
        else:
            enabled_features[key] = bool(val)

    return {
        "valid": True,
        "licenseId": license_data.get("licenseId", ""),
        "licenseType": license_data.get("licenseType", "enterprise"),
        "product": license_data.get("product", {}),
        "features": enabled_features,
        "limits": license_data.get("limits", {}),
        "expiresAt": expires_str,
        "status": "active",
    }

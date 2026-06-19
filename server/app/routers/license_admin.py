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
)

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
        features=doc["features"],
        max_users=doc["max_users"],
        max_agents=doc["max_agents"],
        machine_fingerprint=doc["machine_fingerprint"],
        expires_at=exp,
        status=current_status,
        created_at=doc["created_at"],
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
        "customer_id": customer["_id"],
        "customer_name": customer["name"],
        "customer_email": customer["email"],
        "product": body.product,
        "features": [f.value for f in body.features],
        "max_users": body.max_users,
        "max_agents": body.max_agents,
        "machine_fingerprint": body.machine_fingerprint,
        "expires_at": expires,
        "status": "active",
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


@router.get("/licenses/{license_id}/download")
async def download_license(
    license_id: str,
    user: dict = Depends(require_auth_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> JSONResponse:
    """Download license as JSON (public fields only — no signing keys exposed)."""
    _require_license_admin(user)
    doc = await db[LICENSES_COLLECTION].find_one({"_id": _oid(license_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="License not found")

    license_data = {
        "license_id": str(doc["_id"]),
        "customer": doc["customer_name"],
        "organization": doc.get("customer_email", ""),
        "product": doc["product"],
        "features": doc["features"],
        "limits": {
            "max_users": doc["max_users"],
            "max_agents": doc["max_agents"],
        },
        "machine_fingerprint": doc["machine_fingerprint"],
        "expires_at": doc["expires_at"].isoformat(),
        "issued_at": doc["created_at"].isoformat(),
        "status": doc["status"],
    }

    return JSONResponse(
        content=license_data,
        headers={
            "Content-Disposition": f'attachment; filename="license-{license_id}.json"',
        },
    )

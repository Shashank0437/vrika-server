"""License status endpoint for the on-prem product frontend.

Provides license validity, features, and limits for UI feature gating.
No sensitive information is exposed (no keys, no fingerprint details).
"""

from fastapi import APIRouter

from app.services.license_runtime import license_runtime

router = APIRouter(tags=["license"])


@router.get("/license/status")
async def license_status() -> dict:
    """Return current license validation status for frontend consumption.

    No authentication required — the frontend needs this to decide
    what to render before the user might even be logged in.
    """
    return license_runtime.get_status_response()

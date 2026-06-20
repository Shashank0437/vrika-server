"""FastAPI dependency for feature-gated endpoints.

Usage:
    from app.dependencies.license import require_feature

    @router.get("/scan")
    async def run_scan(_=Depends(require_feature("networkScanner"))):
        ...

    @router.get("/ai-agent")
    async def ai_agent(_=Depends(require_feature("aiAgent"))):
        ...
"""

from fastapi import HTTPException, status

from app.services.license_runtime import license_runtime


def require_feature(feature_name: str):
    """Returns a FastAPI dependency that checks if a license feature is enabled."""

    async def _check():
        if not license_runtime.is_valid:
            state = license_runtime.state
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": state.error_code or "LICENSE_INVALID",
                    "message": state.error_message or "License is not valid.",
                },
            )
        if not license_runtime.is_feature_enabled(feature_name):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "FEATURE_DISABLED",
                    "message": f"Feature '{feature_name}' is not enabled in your license.",
                },
            )

    return _check


def require_valid_license():
    """FastAPI dependency — blocks request if license is not valid (any feature)."""

    async def _check():
        if not license_runtime.is_valid:
            state = license_runtime.state
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": state.error_code or "LICENSE_INVALID",
                    "message": state.error_message or "License is not valid.",
                },
            )

    return _check

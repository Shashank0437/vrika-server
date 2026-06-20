"""License Runtime Manager — enterprise-grade runtime license validation for on-prem deployment.

Responsibilities:
1. Load and validate vrika-license.key at application startup
2. Cache machine fingerprint in memory (regenerate every N hours)
3. Provide is_feature_enabled() / require_feature() for route protection
4. Background monitor re-validates every 15 minutes
5. Expose license status for frontend consumption

Usage:
    from app.services.license_runtime import license_runtime

    # At startup (called from lifespan)
    await license_runtime.initialize()

    # In route handlers
    if license_runtime.is_feature_enabled("aiAgent"):
        ...

    # As FastAPI dependency
    @router.get("/scan")
    async def run_scan(_=Depends(require_feature("networkScanner"))):
        ...
"""

import asyncio
import json
import logging
import subprocess
import hashlib
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from enum import Enum
from pathlib import Path
from typing import Any, Optional

from app.config import get_settings

logger = logging.getLogger(__name__)


class LicenseErrorCode(str, Enum):
    LICENSE_NOT_FOUND = "LICENSE_NOT_FOUND"
    INVALID_SIGNATURE = "INVALID_SIGNATURE"
    LICENSE_REVOKED = "LICENSE_REVOKED"
    LICENSE_SUSPENDED = "LICENSE_SUSPENDED"
    LICENSE_EXPIRED = "LICENSE_EXPIRED"
    MACHINE_MISMATCH = "MACHINE_MISMATCH"
    FEATURE_DISABLED = "FEATURE_DISABLED"
    LICENSE_INVALID = "LICENSE_INVALID"


@dataclass
class LicenseState:
    """Current license validation state held in memory."""
    valid: bool = False
    error_code: str = ""
    error_message: str = ""
    license_id: str = ""
    license_type: str = ""
    status: str = ""
    customer_name: str = ""
    product_name: str = ""
    edition: str = ""
    features: dict[str, bool] = field(default_factory=dict)
    limits: dict[str, int] = field(default_factory=dict)
    allowed_tools: list[str] = field(default_factory=list)
    expires_at: str = ""
    days_remaining: int = 0
    last_validated_at: Optional[str] = None
    # Raw license data for signature verification
    _raw_data: dict[str, Any] = field(default_factory=dict, repr=False)


class LicenseRuntimeManager:
    """Singleton runtime license manager for the on-prem application."""

    def __init__(self) -> None:
        self._state = LicenseState()
        self._cached_fingerprint: str = ""
        self._fingerprint_generated_at: Optional[datetime] = None
        self._monitor_task: Optional[asyncio.Task] = None
        self._initialized = False

    @property
    def state(self) -> LicenseState:
        return self._state

    @property
    def is_valid(self) -> bool:
        return self._state.valid

    # ------------------------------------------------------------------
    # Initialization (called once at startup)
    # ------------------------------------------------------------------

    async def initialize(self) -> LicenseState:
        """Load license, generate fingerprint, validate everything.

        Returns the validation state. Raises RuntimeError if
        LICENSE_ENFORCE_ON_STARTUP is True and validation fails.
        """
        logger.info("=" * 60)
        logger.info("LICENSE VALIDATION — Application Startup")
        logger.info("=" * 60)

        settings = get_settings()

        # Step 1: Generate and cache machine fingerprint
        await self._refresh_fingerprint()

        # Step 2: Full validation
        state = self._validate_license()
        self._state = state
        self._initialized = True

        if state.valid:
            logger.info(f"✓ License VALID — ID: {state.license_id}")
            logger.info(f"  Customer: {state.customer_name}")
            logger.info(f"  Type: {state.license_type} / Edition: {state.edition}")
            logger.info(f"  Expires: {state.expires_at} ({state.days_remaining} days remaining)")
            features_str = ", ".join(f for f, v in state.features.items() if v)
            logger.info(f"  Features: {features_str}")
            logger.info("=" * 60)
        else:
            logger.error(f"✗ License INVALID — {state.error_code}: {state.error_message}")
            logger.error("=" * 60)

            if settings.license_enforce_on_startup:
                raise RuntimeError(
                    f"LICENSE VALIDATION FAILED: {state.error_code} — {state.error_message}\n"
                    "Application cannot start without a valid license.\n"
                    "Set LICENSE_ENFORCE_ON_STARTUP=false to start in degraded mode."
                )

        return state

    # ------------------------------------------------------------------
    # Background monitor
    # ------------------------------------------------------------------

    async def start_monitor(self) -> None:
        """Start the background license monitor task."""
        if self._monitor_task and not self._monitor_task.done():
            return
        self._monitor_task = asyncio.create_task(self._monitor_loop())
        logger.info(
            f"License monitor started — checking every "
            f"{get_settings().license_check_interval_minutes} minutes"
        )

    async def stop_monitor(self) -> None:
        """Stop the background license monitor."""
        if self._monitor_task and not self._monitor_task.done():
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
            logger.info("License monitor stopped.")

    async def _monitor_loop(self) -> None:
        """Periodic license re-validation loop."""
        settings = get_settings()
        interval = settings.license_check_interval_minutes * 60
        fp_refresh_interval = timedelta(hours=settings.license_fingerprint_refresh_hours)

        while True:
            try:
                await asyncio.sleep(interval)

                # Check if fingerprint needs regeneration
                now = datetime.now(timezone.utc)
                if (
                    self._fingerprint_generated_at
                    and (now - self._fingerprint_generated_at) >= fp_refresh_interval
                ):
                    logger.info("Regenerating machine fingerprint (periodic refresh)...")
                    await self._refresh_fingerprint()

                # Re-validate license
                old_valid = self._state.valid
                self._state = self._validate_license()

                if self._state.valid:
                    logger.debug(
                        f"License check OK — {self._state.days_remaining} days remaining"
                    )
                else:
                    logger.warning(
                        f"License check FAILED — {self._state.error_code}: "
                        f"{self._state.error_message}"
                    )

                if old_valid and not self._state.valid:
                    logger.critical(
                        "LICENSE BECAME INVALID — protected features will be disabled. "
                        f"Reason: {self._state.error_code}"
                    )
                elif not old_valid and self._state.valid:
                    logger.info("LICENSE RESTORED — features re-enabled.")

            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("License monitor encountered an error")

    # ------------------------------------------------------------------
    # Core validation logic
    # ------------------------------------------------------------------

    def _validate_license(self) -> LicenseState:
        """Full license validation against the license file and cached fingerprint."""
        settings = get_settings()
        license_path = settings.license_file_path
        now_str = datetime.now(timezone.utc).isoformat()

        # Step 1: Load license file
        try:
            raw = Path(license_path).read_text(encoding="utf-8")
            license_data = json.loads(raw)
        except FileNotFoundError:
            return LicenseState(
                error_code=LicenseErrorCode.LICENSE_NOT_FOUND,
                error_message=f"License file not found: {license_path}",
                last_validated_at=now_str,
            )
        except (json.JSONDecodeError, OSError) as e:
            return LicenseState(
                error_code=LicenseErrorCode.LICENSE_NOT_FOUND,
                error_message=f"Cannot read license file: {e}",
                last_validated_at=now_str,
            )

        license_id = license_data.get("licenseId", "unknown")
        customer_info = license_data.get("customer", {})
        customer_name = customer_info.get("name", "") if isinstance(customer_info, dict) else ""

        # Extract product info (support old string and new object format)
        product_info = license_data.get("product", {})
        if isinstance(product_info, dict):
            product_name = product_info.get("name", "")
            edition = product_info.get("edition", "enterprise")
        else:
            product_name = str(product_info)
            edition = "enterprise"

        license_type = license_data.get("licenseType", "enterprise")

        # Step 2: Verify digital signature
        try:
            from app.services.license_signing import LicenseSigningService
            sig_valid = LicenseSigningService.verify_signature(license_data)
        except RuntimeError as e:
            return LicenseState(
                error_code=LicenseErrorCode.INVALID_SIGNATURE,
                error_message=f"Signature verification setup failed: {e}",
                license_id=license_id,
                customer_name=customer_name,
                last_validated_at=now_str,
            )

        if not sig_valid:
            return LicenseState(
                error_code=LicenseErrorCode.INVALID_SIGNATURE,
                error_message="License signature is invalid. File may have been tampered with.",
                license_id=license_id,
                customer_name=customer_name,
                last_validated_at=now_str,
            )

        # Step 3: Check status
        status = license_data.get("status", "active")
        if status == "revoked":
            return LicenseState(
                error_code=LicenseErrorCode.LICENSE_REVOKED,
                error_message="This license has been revoked.",
                license_id=license_id,
                customer_name=customer_name,
                status=status,
                last_validated_at=now_str,
            )
        if status == "suspended":
            return LicenseState(
                error_code=LicenseErrorCode.LICENSE_SUSPENDED,
                error_message="This license has been suspended. Contact your vendor.",
                license_id=license_id,
                customer_name=customer_name,
                status=status,
                last_validated_at=now_str,
            )

        # Step 4: Check expiry
        expires_str = license_data.get("expiresAt", "")
        if not expires_str:
            return LicenseState(
                error_code=LicenseErrorCode.LICENSE_EXPIRED,
                error_message="License has no expiry date.",
                license_id=license_id,
                customer_name=customer_name,
                last_validated_at=now_str,
            )

        try:
            expires_at = datetime.fromisoformat(expires_str)
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
        except ValueError:
            return LicenseState(
                error_code=LicenseErrorCode.LICENSE_EXPIRED,
                error_message=f"Invalid expiry date format: {expires_str}",
                license_id=license_id,
                customer_name=customer_name,
                last_validated_at=now_str,
            )

        now = datetime.now(timezone.utc)
        if expires_at <= now:
            days_past = (now - expires_at).days
            return LicenseState(
                error_code=LicenseErrorCode.LICENSE_EXPIRED,
                error_message=f"License expired on {expires_str} ({days_past} days ago).",
                license_id=license_id,
                customer_name=customer_name,
                expires_at=expires_str,
                last_validated_at=now_str,
            )

        days_remaining = (expires_at - now).days

        # Step 5: Validate machine fingerprint
        machine_block = license_data.get("machine", {})
        expected_fp = machine_block.get("fingerprint", "") if isinstance(machine_block, dict) else ""

        if not expected_fp:
            return LicenseState(
                error_code=LicenseErrorCode.MACHINE_MISMATCH,
                error_message="License does not contain a machine fingerprint.",
                license_id=license_id,
                customer_name=customer_name,
                last_validated_at=now_str,
            )

        if not self._cached_fingerprint:
            return LicenseState(
                error_code=LicenseErrorCode.MACHINE_MISMATCH,
                error_message="Could not generate machine fingerprint for validation.",
                license_id=license_id,
                customer_name=customer_name,
                last_validated_at=now_str,
            )

        if self._cached_fingerprint != expected_fp.lower():
            return LicenseState(
                error_code=LicenseErrorCode.MACHINE_MISMATCH,
                error_message="License is not valid for this machine. Fingerprint mismatch.",
                license_id=license_id,
                customer_name=customer_name,
                last_validated_at=now_str,
            )

        # Step 6: Extract features (support both old and new format)
        raw_features = license_data.get("features", {})
        features: dict[str, bool] = {}
        for key, val in raw_features.items():
            if isinstance(val, dict):
                features[key] = val.get("enabled", False)
            else:
                features[key] = bool(val)

        limits = license_data.get("limits", {})

        # Extract allowed tools list
        raw_tools = license_data.get("allowedTools", [])
        allowed_tools = [str(t) for t in raw_tools] if isinstance(raw_tools, list) else []

        return LicenseState(
            valid=True,
            license_id=license_id,
            license_type=license_type,
            status="active",
            customer_name=customer_name,
            product_name=product_name,
            edition=edition,
            features=features,
            limits=limits,
            allowed_tools=allowed_tools,
            expires_at=expires_str,
            days_remaining=days_remaining,
            last_validated_at=now_str,
            _raw_data=license_data,
        )

    # ------------------------------------------------------------------
    # Machine fingerprint (cached)
    # ------------------------------------------------------------------

    async def _refresh_fingerprint(self) -> None:
        """Generate machine fingerprint from machine-info.json or live collection."""
        settings = get_settings()
        machine_info_path = settings.machine_info_path

        # Try loading from machine-info.json first
        try:
            raw = Path(machine_info_path).read_text(encoding="utf-8")
            machine_info = json.loads(raw)
            from app.services.machine_fingerprint import MachineFingerprintService
            self._cached_fingerprint = MachineFingerprintService.generate_fingerprint(machine_info)
            self._fingerprint_generated_at = datetime.now(timezone.utc)
            logger.info(f"Machine fingerprint loaded from {machine_info_path}: {self._cached_fingerprint[:16]}...")
            return
        except FileNotFoundError:
            logger.info(f"No machine-info.json at {machine_info_path}, attempting live collection...")
        except Exception as e:
            logger.warning(f"Failed to load machine-info.json: {e}")

        # Fallback: try running the collector script inline
        try:
            machine_info = self._collect_machine_info_live()
            from app.services.machine_fingerprint import MachineFingerprintService
            self._cached_fingerprint = MachineFingerprintService.generate_fingerprint(machine_info)
            self._fingerprint_generated_at = datetime.now(timezone.utc)
            logger.info(f"Machine fingerprint generated live: {self._cached_fingerprint[:16]}...")
        except Exception as e:
            logger.error(f"Failed to generate machine fingerprint: {e}")
            self._cached_fingerprint = ""

    @staticmethod
    def _collect_machine_info_live() -> dict[str, Any]:
        """Collect machine info on the current host (Linux only)."""
        info: dict[str, Any] = {}

        # /etc/machine-id
        try:
            info["machine_id"] = Path("/etc/machine-id").read_text().strip()
        except Exception:
            info["machine_id"] = ""

        # BIOS UUID
        try:
            result = subprocess.run(
                ["cat", "/sys/class/dmi/id/product_uuid"],
                capture_output=True, text=True, timeout=5,
            )
            info["bios_uuid"] = result.stdout.strip() if result.returncode == 0 else ""
        except Exception:
            info["bios_uuid"] = ""

        # CPU info
        try:
            cpuinfo = Path("/proc/cpuinfo").read_text()
            for line in cpuinfo.splitlines():
                if line.startswith("vendor_id"):
                    info["cpu_vendor"] = line.split(":", 1)[1].strip()
                elif line.startswith("model name"):
                    info["cpu_model"] = line.split(":", 1)[1].strip()
                elif line.startswith("cpu family"):
                    info["cpu_family"] = line.split(":", 1)[1].strip()
        except Exception:
            pass

        # Disk serial (first non-empty)
        try:
            result = subprocess.run(
                ["lsblk", "-ndo", "SERIAL"],
                capture_output=True, text=True, timeout=5,
            )
            for line in result.stdout.strip().splitlines():
                serial = line.strip()
                if serial:
                    info["disk_serial"] = serial
                    break
        except Exception:
            info["disk_serial"] = ""

        # Hostname
        import socket
        info["hostname"] = socket.gethostname()

        # MAC address (first non-loopback)
        try:
            for iface_dir in sorted(Path("/sys/class/net").iterdir()):
                name = iface_dir.name
                if name == "lo":
                    continue
                addr_file = iface_dir / "address"
                if addr_file.exists():
                    mac = addr_file.read_text().strip()
                    if mac and mac != "00:00:00:00:00:00":
                        info["mac_address"] = mac
                        break
        except Exception:
            info["mac_address"] = ""

        return info

    # ------------------------------------------------------------------
    # Feature access helpers
    # ------------------------------------------------------------------

    def is_feature_enabled(self, feature_name: str) -> bool:
        """Check if a feature is enabled in the current license."""
        if not self._state.valid:
            return False
        return self._state.features.get(feature_name, False)

    def require_feature(self, feature_name: str) -> None:
        """Raise RuntimeError if feature not enabled or license invalid."""
        if not self._state.valid:
            raise RuntimeError(
                f"{self._state.error_code}: License is not valid. "
                f"{self._state.error_message}"
            )
        if not self.is_feature_enabled(feature_name):
            raise RuntimeError(
                f"FEATURE_DISABLED: Feature '{feature_name}' is not enabled in your license."
            )

    def get_limit(self, limit_name: str, default: int = 0) -> int:
        """Get a limit value from the license."""
        if not self._state.valid:
            return 0
        return self._state.limits.get(limit_name, default)

    def get_enabled_features(self) -> list[str]:
        """Return list of all enabled feature names."""
        if not self._state.valid:
            return []
        return [k for k, v in self._state.features.items() if v]

    def is_tool_allowed(self, tool_name: str) -> bool:
        """Check if a specific tool is allowed by the license.

        Returns True if:
        - License is valid AND allowed_tools is empty (all tools allowed)
        - License is valid AND tool_name is in allowed_tools list
        """
        if not self._state.valid:
            return False
        # Empty list = all tools allowed (no restriction)
        if not self._state.allowed_tools:
            return True
        return tool_name in self._state.allowed_tools

    def get_allowed_tools(self) -> list[str]:
        """Return list of allowed tool names. Empty = all allowed."""
        if not self._state.valid:
            return []
        return list(self._state.allowed_tools)

    def get_status_response(self) -> dict[str, Any]:
        """Build the response payload for GET /api/license/status."""
        s = self._state

        if not s.valid:
            return {
                "valid": False,
                "error": s.error_code,
                "message": s.error_message,
                "status": s.status or "invalid",
                "lastChecked": s.last_validated_at,
            }

        # Build features in the enterprise format
        features: dict[str, dict[str, bool]] = {}
        for name, enabled in s.features.items():
            features[name] = {"enabled": enabled}

        return {
            "valid": True,
            "licenseId": s.license_id,
            "licenseType": s.license_type,
            "status": s.status,
            "customer": s.customer_name,
            "product": s.product_name,
            "edition": s.edition,
            "features": features,
            "limits": s.limits,
            "allowedTools": s.allowed_tools,
            "expiresAt": s.expires_at,
            "daysRemaining": s.days_remaining,
            "lastChecked": s.last_validated_at,
        }


# ------------------------------------------------------------------
# Module-level singleton
# ------------------------------------------------------------------
license_runtime = LicenseRuntimeManager()

"""License Validation Service — validates license.json on customer on-prem servers.

Performs:
1. Signature verification (ECDSA P-256)
2. Status check (active/revoked/suspended/expired)
3. Expiry check
4. Machine fingerprint validation (compares hash against fresh machine-info)
5. Feature extraction

Error Codes:
    LICENSE_NOT_FOUND — Cannot load license file
    INVALID_SIGNATURE — Signature verification failed
    LICENSE_REVOKED — License has been revoked
    LICENSE_SUSPENDED — License has been suspended
    LICENSE_EXPIRED — License past expiry date
    MACHINE_MISMATCH — Machine fingerprint does not match
    FEATURE_DISABLED — Requested feature not enabled

Usage on customer's on-prem server:
    from app.services.license_validator import LicenseValidator, LicenseManager

    result = LicenseValidator.validate("/path/to/license.json", "/path/to/machine-info.json")
    if result.valid:
        manager = LicenseManager(result)
        if manager.is_feature_enabled("aiAgent"):
            # allow AI agent access
            pass
    else:
        print(f"License invalid: {result.error_code} — {result.error}")
"""

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

from app.services.license_signing import LicenseSigningService
from app.services.machine_fingerprint import MachineFingerprintService

logger = logging.getLogger(__name__)


class LicenseErrorCode(str, Enum):
    """Standard license validation error codes."""
    LICENSE_NOT_FOUND = "LICENSE_NOT_FOUND"
    INVALID_SIGNATURE = "INVALID_SIGNATURE"
    LICENSE_REVOKED = "LICENSE_REVOKED"
    LICENSE_SUSPENDED = "LICENSE_SUSPENDED"
    LICENSE_EXPIRED = "LICENSE_EXPIRED"
    MACHINE_MISMATCH = "MACHINE_MISMATCH"
    FEATURE_DISABLED = "FEATURE_DISABLED"
    LICENSE_INVALID_STATUS = "LICENSE_INVALID_STATUS"


@dataclass
class LicenseValidationResult:
    """Result of license validation."""
    valid: bool
    error: str = ""
    error_code: str = ""
    license_id: str = ""
    license_type: str = ""
    customer: str = ""
    product: str = ""
    edition: str = ""
    features: dict[str, bool] = field(default_factory=dict)
    limits: dict[str, int] = field(default_factory=dict)
    expires_at: str = ""
    days_remaining: int = 0
    status: str = ""


class LicenseManager:
    """Helper for checking licensed features and limits.

    Usage:
        result = LicenseValidator.validate(...)
        manager = LicenseManager(result)
        manager.is_feature_enabled("aiAgent")  # True/False
        manager.get_limit("maxUsers")  # int
    """

    def __init__(self, validation_result: LicenseValidationResult):
        self._result = validation_result

    @property
    def is_valid(self) -> bool:
        return self._result.valid

    @property
    def license_id(self) -> str:
        return self._result.license_id

    @property
    def license_type(self) -> str:
        return self._result.license_type

    @property
    def edition(self) -> str:
        return self._result.edition

    @property
    def days_remaining(self) -> int:
        return self._result.days_remaining

    def is_feature_enabled(self, feature_name: str) -> bool:
        """Check if a specific feature is enabled in the license."""
        return self._result.features.get(feature_name, False)

    def require_feature(self, feature_name: str) -> None:
        """Raise if feature not enabled."""
        if not self.is_feature_enabled(feature_name):
            raise RuntimeError(
                f"FEATURE_DISABLED: Feature '{feature_name}' is not enabled in your license."
            )

    def get_limit(self, limit_name: str, default: int = 0) -> int:
        """Get a limit value from the license."""
        return self._result.limits.get(limit_name, default)

    def get_all_enabled_features(self) -> list[str]:
        """Return list of all enabled feature names."""
        return [k for k, v in self._result.features.items() if v]


class LicenseValidator:
    """Validates license.json files on the deployment machine."""

    @classmethod
    def _load_json_file(cls, path: str) -> dict[str, Any] | None:
        """Load and parse a JSON file."""
        try:
            data = Path(path).read_text(encoding="utf-8")
            return json.loads(data)
        except (OSError, json.JSONDecodeError) as e:
            logger.error(f"Failed to load file {path}: {e}")
            return None

    @classmethod
    def _extract_features(cls, raw_features: dict) -> dict[str, bool]:
        """Extract features supporting both old and new format.

        Old format: {"aiAgent": true, ...}
        New format: {"aiAgent": {"enabled": true}, ...}
        """
        result: dict[str, bool] = {}
        for key, val in raw_features.items():
            if isinstance(val, dict):
                result[key] = val.get("enabled", False)
            else:
                result[key] = bool(val)
        return result

    @classmethod
    def validate(cls, license_path: str, machine_info_path: str) -> LicenseValidationResult:
        """Full license validation: signature + status + fingerprint + expiry.

        Args:
            license_path: Path to the license.json file.
            machine_info_path: Path to machine-info.json (freshly collected on this machine).

        Returns:
            LicenseValidationResult with validation status and details.
        """
        # Step 1: Load license file
        license_data = cls._load_json_file(license_path)
        if license_data is None:
            return LicenseValidationResult(
                valid=False,
                error="Cannot read or parse license file.",
                error_code=LicenseErrorCode.LICENSE_NOT_FOUND,
            )

        license_id = license_data.get("licenseId", "unknown")
        customer_info = license_data.get("customer", {})
        customer_name = customer_info.get("name", "") if isinstance(customer_info, dict) else str(customer_info)

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
            sig_valid = LicenseSigningService.verify_signature(license_data)
        except RuntimeError as e:
            logger.error(f"Signature verification setup error: {e}")
            return LicenseValidationResult(
                valid=False,
                error="License signature verification failed — public key not available.",
                error_code=LicenseErrorCode.INVALID_SIGNATURE,
                license_id=license_id,
                customer=customer_name,
            )

        if not sig_valid:
            logger.warning(f"License {license_id}: SIGNATURE INVALID")
            return LicenseValidationResult(
                valid=False,
                error="License signature is invalid. The file may have been tampered with.",
                error_code=LicenseErrorCode.INVALID_SIGNATURE,
                license_id=license_id,
                customer=customer_name,
            )

        # Step 3: Check status
        status = license_data.get("status", "active")
        if status == "revoked":
            return LicenseValidationResult(
                valid=False,
                error="This license has been revoked.",
                error_code=LicenseErrorCode.LICENSE_REVOKED,
                license_id=license_id,
                customer=customer_name,
                status=status,
            )
        if status == "suspended":
            return LicenseValidationResult(
                valid=False,
                error="This license has been suspended. Contact your vendor.",
                error_code=LicenseErrorCode.LICENSE_SUSPENDED,
                license_id=license_id,
                customer=customer_name,
                status=status,
            )

        # Step 4: Check expiry
        expires_at_str = license_data.get("expiresAt", "")
        if not expires_at_str:
            return LicenseValidationResult(
                valid=False,
                error="License has no expiry date.",
                error_code=LicenseErrorCode.LICENSE_EXPIRED,
                license_id=license_id,
                customer=customer_name,
            )

        try:
            expires_at = datetime.fromisoformat(expires_at_str).replace(tzinfo=timezone.utc)
        except ValueError:
            return LicenseValidationResult(
                valid=False,
                error=f"Invalid expiry date format: {expires_at_str}",
                error_code=LicenseErrorCode.LICENSE_EXPIRED,
                license_id=license_id,
                customer=customer_name,
            )

        now = datetime.now(timezone.utc)
        if expires_at <= now:
            days_past = (now - expires_at).days
            logger.warning(f"License {license_id}: EXPIRED {days_past} days ago.")
            return LicenseValidationResult(
                valid=False,
                error=f"License expired on {expires_at_str} ({days_past} days ago).",
                error_code=LicenseErrorCode.LICENSE_EXPIRED,
                license_id=license_id,
                customer=customer_name,
                expires_at=expires_at_str,
            )

        days_remaining = (expires_at - now).days

        # Step 5: Load machine-info and validate fingerprint
        machine_info = cls._load_json_file(machine_info_path)
        if machine_info is None:
            return LicenseValidationResult(
                valid=False,
                error="Cannot read or parse machine-info.json. Run the collector script first.",
                error_code=LicenseErrorCode.MACHINE_MISMATCH,
                license_id=license_id,
                customer=customer_name,
            )

        machine_block = license_data.get("machine", {})
        expected_fp = machine_block.get("fingerprint", "") if isinstance(machine_block, dict) else ""

        if not expected_fp:
            return LicenseValidationResult(
                valid=False,
                error="License does not contain a machine fingerprint.",
                error_code=LicenseErrorCode.MACHINE_MISMATCH,
                license_id=license_id,
                customer=customer_name,
            )

        fp_valid = MachineFingerprintService.validate_fingerprint(expected_fp, machine_info)
        if not fp_valid:
            logger.warning(f"License {license_id}: Machine fingerprint MISMATCH")
            return LicenseValidationResult(
                valid=False,
                error="License not valid for this machine. Machine fingerprint does not match.",
                error_code=LicenseErrorCode.MACHINE_MISMATCH,
                license_id=license_id,
                customer=customer_name,
            )

        # Step 6: Extract features and limits
        raw_features = license_data.get("features", {})
        features = cls._extract_features(raw_features)
        limits = license_data.get("limits", {})

        logger.info(
            f"License {license_id} VALID — customer={customer_name}, "
            f"type={license_type}, edition={edition}, "
            f"expires={expires_at_str}, days_remaining={days_remaining}"
        )

        return LicenseValidationResult(
            valid=True,
            license_id=license_id,
            license_type=license_type,
            customer=customer_name,
            product=product_name,
            edition=edition,
            features=features,
            limits=limits,
            expires_at=expires_at_str,
            days_remaining=days_remaining,
            status="active",
        )

    @classmethod
    def validate_or_raise(cls, license_path: str, machine_info_path: str) -> LicenseValidationResult:
        """Validate license and raise RuntimeError if invalid."""
        result = cls.validate(license_path, machine_info_path)
        if not result.valid:
            raise RuntimeError(f"{result.error_code}: {result.error}")
        return result

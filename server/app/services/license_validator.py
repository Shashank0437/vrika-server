"""License Validation Service — validates license.json on customer on-prem servers.

Performs:
1. Signature verification (ECDSA P-256)
2. Machine fingerprint validation (compares hash against fresh machine-info)
3. Expiry check
4. Feature extraction

Usage on customer's on-prem server:
    from app.services.license_validator import LicenseValidator

    result = LicenseValidator.validate("/path/to/license.json", "/path/to/machine-info.json")
    if result.valid:
        print(f"Licensed features: {result.features}")
    else:
        print(f"License invalid: {result.error}")
"""

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.services.license_signing import LicenseSigningService
from app.services.machine_fingerprint import MachineFingerprintService

logger = logging.getLogger(__name__)


@dataclass
class LicenseValidationResult:
    """Result of license validation."""
    valid: bool
    error: str = ""
    license_id: str = ""
    customer: str = ""
    product: str = ""
    features: dict[str, bool] = field(default_factory=dict)
    limits: dict[str, int] = field(default_factory=dict)
    expires_at: str = ""
    days_remaining: int = 0


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
    def validate(cls, license_path: str, machine_info_path: str) -> LicenseValidationResult:
        """Full license validation: signature + fingerprint + expiry.

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
                error="Cannot read or parse license.json.",
            )

        license_id = license_data.get("licenseId", "unknown")
        customer_info = license_data.get("customer", {})
        customer_name = customer_info.get("name", "") if isinstance(customer_info, dict) else str(customer_info)

        # Step 2: Verify digital signature
        try:
            sig_valid = LicenseSigningService.verify_signature(license_data)
        except RuntimeError as e:
            logger.error(f"Signature verification setup error: {e}")
            return LicenseValidationResult(
                valid=False,
                error="License signature verification failed — public key not available.",
                license_id=license_id,
                customer=customer_name,
            )

        if not sig_valid:
            logger.warning(f"License {license_id}: SIGNATURE INVALID")
            return LicenseValidationResult(
                valid=False,
                error="License signature is invalid. The file may have been tampered with.",
                license_id=license_id,
                customer=customer_name,
            )

        # Step 3: Load machine-info and validate fingerprint
        machine_info = cls._load_json_file(machine_info_path)
        if machine_info is None:
            return LicenseValidationResult(
                valid=False,
                error="Cannot read or parse machine-info.json. Run the collector script first.",
                license_id=license_id,
                customer=customer_name,
            )

        machine_block = license_data.get("machine", {})
        expected_fp = machine_block.get("fingerprint", "") if isinstance(machine_block, dict) else ""

        if not expected_fp:
            return LicenseValidationResult(
                valid=False,
                error="License does not contain a machine fingerprint.",
                license_id=license_id,
                customer=customer_name,
            )

        fp_valid = MachineFingerprintService.validate_fingerprint(expected_fp, machine_info)
        if not fp_valid:
            logger.warning(f"License {license_id}: Machine fingerprint MISMATCH")
            return LicenseValidationResult(
                valid=False,
                error="License not valid for this machine. Machine fingerprint does not match.",
                license_id=license_id,
                customer=customer_name,
            )

        # Step 4: Check expiry
        expires_at_str = license_data.get("expiresAt", "")
        if not expires_at_str:
            return LicenseValidationResult(
                valid=False,
                error="License has no expiry date.",
                license_id=license_id,
                customer=customer_name,
            )

        try:
            expires_at = datetime.fromisoformat(expires_at_str).replace(tzinfo=timezone.utc)
        except ValueError:
            return LicenseValidationResult(
                valid=False,
                error=f"Invalid expiry date format: {expires_at_str}",
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
                license_id=license_id,
                customer=customer_name,
                expires_at=expires_at_str,
            )

        days_remaining = (expires_at - now).days

        # Step 5: Extract features and limits
        features = license_data.get("features", {})
        limits = license_data.get("limits", {})

        logger.info(
            f"License {license_id} VALID — customer={customer_name}, "
            f"expires={expires_at_str}, days_remaining={days_remaining}"
        )

        return LicenseValidationResult(
            valid=True,
            license_id=license_id,
            customer=customer_name,
            product=license_data.get("product", ""),
            features=features,
            limits=limits,
            expires_at=expires_at_str,
            days_remaining=days_remaining,
        )

    @classmethod
    def validate_or_raise(cls, license_path: str, machine_info_path: str) -> LicenseValidationResult:
        """Validate license and raise RuntimeError if invalid."""
        result = cls.validate(license_path, machine_info_path)
        if not result.valid:
            raise RuntimeError(f"LICENSE VALIDATION FAILED: {result.error}")
        return result

"""Machine Fingerprint Service — SHA256 hashing from machine-info.json data.

The admin backend receives machine-info.json (collected on customer's machine)
and generates a deterministic SHA256 fingerprint hash from it.

The fingerprint is what gets stored in license.json — never the raw hardware data.

Flow:
    1. Customer runs collect_machine_info.py → produces machine-info.json
    2. Customer sends machine-info.json to admin
    3. Admin uploads it in the license portal
    4. Backend calls MachineFingerprintService.generate_fingerprint(machine_info_data)
    5. SHA256 hash is stored in the generated license.json
    6. On-prem product validates by re-collecting data and comparing hash
"""

import hashlib
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


class MachineFingerprintService:
    """Generates and validates SHA256 fingerprints from machine hardware data."""

    @classmethod
    def generate_fingerprint(cls, machine_info: dict[str, Any]) -> str:
        """Generate SHA256 fingerprint from machine-info.json data.

        Args:
            machine_info: Dict with keys from machine-info.json
                (machine_id, bios_uuid, cpu_vendor, cpu_model, cpu_family,
                 disk_serial, hostname, mac_address)

        Returns:
            64-character hex SHA256 hash.

        Raises:
            ValueError: If fewer than 3 hardware attributes are non-empty.
        """
        # Normalize into canonical format for hashing
        canonical = {
            "machine_id": str(machine_info.get("machine_id", "") or "").strip(),
            "bios_uuid": str(machine_info.get("bios_uuid", "") or "").strip().lower(),
            "cpu": cls._build_cpu_string(machine_info),
            "disk_serial": str(machine_info.get("disk_serial", "") or "").strip(),
            "hostname": str(machine_info.get("hostname", "") or "").strip(),
            "mac": str(machine_info.get("mac_address", "") or "").strip().lower(),
        }

        # Validate minimum components
        non_empty = sum(1 for v in canonical.values() if v)
        if non_empty < 3:
            available = [k for k, v in canonical.items() if v]
            raise ValueError(
                f"Insufficient hardware data for fingerprint. "
                f"Only {non_empty}/6 attributes provided. Need at least 3. "
                f"Available: {', '.join(available)}"
            )

        # Deterministic JSON → SHA256
        payload = json.dumps(canonical, sort_keys=True, separators=(",", ":"))
        fingerprint = hashlib.sha256(payload.encode("utf-8")).hexdigest()

        logger.info(
            f"Fingerprint generated: {fingerprint[:16]}... "
            f"({non_empty}/6 components used)"
        )
        return fingerprint

    @classmethod
    def _build_cpu_string(cls, machine_info: dict[str, Any]) -> str:
        """Build canonical CPU string from vendor/model/family."""
        vendor = str(machine_info.get("cpu_vendor", "") or "").strip()
        model = str(machine_info.get("cpu_model", "") or "").strip()
        family = str(machine_info.get("cpu_family", "") or "").strip()
        combined = f"{vendor}|{model}|{family}"
        return combined if combined != "||" else ""

    @classmethod
    def validate_fingerprint(cls, expected: str, machine_info: dict[str, Any]) -> bool:
        """Validate a fingerprint against machine-info data.

        Args:
            expected: The SHA256 fingerprint from license.json
            machine_info: Current machine's hardware data

        Returns:
            True if fingerprint matches, False otherwise.
        """
        try:
            current = cls.generate_fingerprint(machine_info)
        except ValueError as e:
            logger.error(f"Fingerprint validation failed: {e}")
            return False

        match = current == expected.lower()
        if not match:
            logger.warning(
                f"Fingerprint mismatch. "
                f"Expected: {expected[:16]}... "
                f"Current:  {current[:16]}..."
            )
        return match


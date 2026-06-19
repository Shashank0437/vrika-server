"""License Signing & Validation Service — ECDSA P-256 digital signatures.

The admin backend signs licenses with a private key.
Customer on-prem servers verify with the public key (shipped with the product).
Private key NEVER leaves the license generation server.

Setup:
    Generate key pair once:
        python -c "from app.services.license_signing import LicenseSigningService; LicenseSigningService.generate_key_pair('/path/to/keys')"

Environment variables:
    LICENSE_PRIVATE_KEY_PATH — path to PEM private key (admin server only)
    LICENSE_PUBLIC_KEY_PATH  — path to PEM public key (all deployments)
"""

import hashlib
import json
import logging
from pathlib import Path
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec

logger = logging.getLogger(__name__)


class LicenseSigningService:
    """ECDSA P-256 signing and verification for license payloads."""

    _private_key: ec.EllipticCurvePrivateKey | None = None
    _public_key: ec.EllipticCurvePublicKey | None = None

    @classmethod
    def _get_private_key_path(cls) -> str:
        import os
        return os.environ.get("LICENSE_PRIVATE_KEY_PATH", "/app/keys/license_private.pem")

    @classmethod
    def _get_public_key_path(cls) -> str:
        import os
        return os.environ.get("LICENSE_PUBLIC_KEY_PATH", "/app/keys/license_public.pem")

    @classmethod
    def generate_key_pair(cls, output_dir: str) -> tuple[str, str]:
        """Generate ECDSA P-256 key pair. Run once during initial setup.

        Args:
            output_dir: Directory to write PEM files.

        Returns:
            Tuple of (private_key_path, public_key_path).
        """
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)

        private_key = ec.generate_private_key(ec.SECP256R1())

        priv_path = out / "license_private.pem"
        pub_path = out / "license_public.pem"

        priv_path.write_bytes(
            private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption(),
            )
        )
        # Restrict private key permissions
        priv_path.chmod(0o600)

        pub_path.write_bytes(
            private_key.public_key().public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
            )
        )

        logger.info(f"Key pair generated: {priv_path}, {pub_path}")
        return str(priv_path), str(pub_path)

    @classmethod
    def load_private_key(cls) -> ec.EllipticCurvePrivateKey:
        """Load private key from file (cached after first load)."""
        if cls._private_key is not None:
            return cls._private_key

        key_path = cls._get_private_key_path()
        try:
            pem_data = Path(key_path).read_bytes()
            cls._private_key = serialization.load_pem_private_key(pem_data, password=None)  # type: ignore
            logger.info("License signing private key loaded.")
            return cls._private_key  # type: ignore
        except (OSError, ValueError) as e:
            raise RuntimeError(
                f"Cannot load license private key from {key_path}: {e}. "
                f"Generate with: LicenseSigningService.generate_key_pair('/app/keys')"
            )

    @classmethod
    def load_public_key(cls) -> ec.EllipticCurvePublicKey:
        """Load public key from file (cached after first load)."""
        if cls._public_key is not None:
            return cls._public_key

        key_path = cls._get_public_key_path()
        try:
            pem_data = Path(key_path).read_bytes()
            cls._public_key = serialization.load_pem_public_key(pem_data)  # type: ignore
            logger.info("License verification public key loaded.")
            return cls._public_key  # type: ignore
        except (OSError, ValueError) as e:
            raise RuntimeError(
                f"Cannot load license public key from {key_path}: {e}. "
                f"Ensure the public key is deployed with the product."
            )

    @classmethod
    def _canonical_payload(cls, license_data: dict[str, Any]) -> bytes:
        """Create canonical byte representation of license for signing/verification.

        Excludes the 'signature' field itself from the signed data.
        """
        # Remove signature if present (for verification flow)
        data = {k: v for k, v in license_data.items() if k != "signature"}
        return json.dumps(data, sort_keys=True, separators=(",", ":")).encode("utf-8")

    @classmethod
    def sign_license(cls, license_data: dict[str, Any]) -> str:
        """Sign a license payload and return hex-encoded signature.

        Args:
            license_data: The license dictionary (without signature field).

        Returns:
            Hex-encoded ECDSA signature string.
        """
        private_key = cls.load_private_key()
        payload = cls._canonical_payload(license_data)
        signature = private_key.sign(payload, ec.ECDSA(hashes.SHA256()))
        return signature.hex()

    @classmethod
    def verify_signature(cls, license_data: dict[str, Any]) -> bool:
        """Verify the digital signature on a license.

        Args:
            license_data: The full license dictionary including 'signature' field.

        Returns:
            True if signature is valid, False otherwise.
        """
        signature_hex = license_data.get("signature")
        if not signature_hex:
            logger.warning("License has no signature field.")
            return False

        try:
            signature_bytes = bytes.fromhex(signature_hex)
        except ValueError:
            logger.warning("Invalid signature format (not valid hex).")
            return False

        public_key = cls.load_public_key()
        payload = cls._canonical_payload(license_data)

        try:
            public_key.verify(signature_bytes, payload, ec.ECDSA(hashes.SHA256()))
            return True
        except InvalidSignature:
            logger.warning("License signature verification FAILED — possible tampering.")
            return False

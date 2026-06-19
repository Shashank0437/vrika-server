#!/usr/bin/env python3
"""Generate ECDSA P-256 key pair for license signing.

Usage:
    python -m app.generate_license_keys [output_dir]

Default output: ./keys/
"""

import sys
from pathlib import Path


def main():
    output_dir = sys.argv[1] if len(sys.argv) > 1 else "./keys"

    # Import here to avoid needing full app context
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

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
    priv_path.chmod(0o600)

    pub_path.write_bytes(
        private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )

    print(f"✓ Key pair generated:")
    print(f"  Private key: {priv_path.resolve()}")
    print(f"  Public key:  {pub_path.resolve()}")
    print()
    print(f"  IMPORTANT: Keep {priv_path.name} SECRET — never commit or expose it.")
    print(f"  Ship {pub_path.name} with your on-prem product for license verification.")


if __name__ == "__main__":
    main()

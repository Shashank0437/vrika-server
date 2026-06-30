#!/usr/bin/env python3
"""Collect machine hardware info and push it to the Vrika Admin portal.

Usage:
    python collect_machine_info.py --customer-id <CUSTOMER_ID> --api-url <URL> --token <JWT_TOKEN>

Example:
    python collect_machine_info.py \
        --customer-id 6789abc123def456 \
        --api-url https://admin.example.com/be \
        --token eyJhbGciOi...

The script collects hardware identifiers (machine ID, BIOS UUID, CPU info,
disk serial, hostname, MAC address) from the local machine and sends them
to the admin API for storage. No dependencies beyond Python 3.7+ stdlib.
"""

import argparse
import json
import platform
import socket
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


def _run(cmd: list, fallback: str = "") -> str:
    """Run a command and return stripped stdout, or fallback on failure."""
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        return result.stdout.strip() if result.returncode == 0 else fallback
    except Exception:
        return fallback


def _read_file(path: str, fallback: str = "") -> str:
    """Read a file and return stripped content, or fallback."""
    try:
        return Path(path).read_text().strip()
    except Exception:
        return fallback


def collect_machine_info() -> dict:
    """Collect hardware identifiers from this machine."""
    info = {
        "machine_id": "",
        "bios_uuid": "",
        "cpu_vendor": "",
        "cpu_model": "",
        "cpu_family": "",
        "disk_serial": "",
        "hostname": "",
        "mac_address": "",
        "collected_at": datetime.now(timezone.utc).isoformat(),
    }

    system = platform.system()

    # --- Hostname ---
    info["hostname"] = socket.gethostname()

    # --- MAC address ---
    mac = uuid.getnode()
    if (mac >> 40) & 1 == 0:
        info["mac_address"] = ":".join(
            f"{(mac >> (8 * i)) & 0xFF:02x}" for i in reversed(range(6))
        )

    if system == "Linux":
        # Machine ID
        info["machine_id"] = _read_file("/etc/machine-id") or _read_file(
            "/var/lib/dbus/machine-id"
        )

        # BIOS UUID (may need sudo)
        info["bios_uuid"] = _read_file("/sys/class/dmi/id/product_uuid") or _run(
            ["sudo", "dmidecode", "-s", "system-uuid"]
        )

        # CPU info from /proc/cpuinfo
        try:
            cpuinfo = Path("/proc/cpuinfo").read_text()
            for line in cpuinfo.splitlines():
                if line.startswith("vendor_id") and not info["cpu_vendor"]:
                    info["cpu_vendor"] = line.split(":", 1)[1].strip()
                elif line.startswith("model name") and not info["cpu_model"]:
                    info["cpu_model"] = line.split(":", 1)[1].strip()
                elif line.startswith("cpu family") and not info["cpu_family"]:
                    info["cpu_family"] = line.split(":", 1)[1].strip()
        except Exception:
            pass

        # Disk serial
        info["disk_serial"] = _run(["lsblk", "-ndo", "SERIAL", "/dev/sda"]) or _run(
            ["lsblk", "-ndo", "SERIAL", "/dev/nvme0n1"]
        )

    elif system == "Darwin":
        # Hardware UUID on macOS
        hw_uuid = _run(["ioreg", "-rd1", "-c", "IOPlatformExpertDevice"])
        for line in hw_uuid.splitlines():
            if "IOPlatformUUID" in line:
                info["machine_id"] = line.split('"')[-2] if '"' in line else ""
                break
        info["bios_uuid"] = info["machine_id"]

        info["cpu_vendor"] = _run(["sysctl", "-n", "machdep.cpu.vendor"])
        info["cpu_model"] = _run(["sysctl", "-n", "machdep.cpu.brand_string"])
        info["cpu_family"] = _run(["sysctl", "-n", "machdep.cpu.family"])

        info["disk_serial"] = _run(
            [
                "bash",
                "-c",
                "system_profiler SPSerialATADataType 2>/dev/null "
                "| grep 'Serial Number' | head -1 | awk -F': ' '{print $2}'",
            ]
        )

    elif system == "Windows":
        info["machine_id"] = _run(
            [
                "powershell",
                "-Command",
                "(Get-CimInstance Win32_ComputerSystemProduct).UUID",
            ]
        )
        info["bios_uuid"] = _run(
            ["powershell", "-Command", "(Get-CimInstance Win32_BIOS).SerialNumber"]
        )
        info["cpu_vendor"] = _run(
            ["powershell", "-Command", "(Get-CimInstance Win32_Processor).Manufacturer"]
        )
        info["cpu_model"] = _run(
            ["powershell", "-Command", "(Get-CimInstance Win32_Processor).Name"]
        )
        info["cpu_family"] = _run(
            [
                "powershell",
                "-Command",
                "([string](Get-CimInstance Win32_Processor).Family)",
            ]
        )
        info["disk_serial"] = _run(
            [
                "powershell",
                "-Command",
                "(Get-CimInstance Win32_DiskDrive | Select -First 1).SerialNumber",
            ]
        )

    return info


def push_to_api(machine_info: dict, customer_id: str, api_url: str, token: str) -> dict:
    """Send machine info to the admin API."""
    url = f"{api_url.rstrip('/')}/license-admin/customers/{customer_id}/machine-info"

    body = json.dumps(machine_info).encode("utf-8")
    req = Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {token}")

    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        error_body = e.read().decode()
        print(f"API error ({e.code}): {error_body}", file=sys.stderr)
        sys.exit(1)
    except URLError as e:
        print(f"Connection error: {e.reason}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Collect machine info and push to Vrika Admin portal"
    )
    parser.add_argument(
        "--customer-id", required=True, help="Customer ID from admin portal"
    )
    parser.add_argument(
        "--api-url",
        required=True,
        help="Admin API base URL (e.g. https://admin.example.com/be)",
    )
    parser.add_argument(
        "--token", required=True, help="JWT auth token from admin portal"
    )
    parser.add_argument(
        "--save-local",
        action="store_true",
        help="Also save machine-info.json in current directory",
    )
    parser.add_argument(
        "--output-dir",
        default="/vrika-server/server/tools",
        help="Directory to save machine-info.json (default: /vrika-server/server/tools)",
    )
    args = parser.parse_args()

    print("Collecting machine info...")
    info = collect_machine_info()

    # Show what was collected
    non_empty = {k: v for k, v in info.items() if v and k != "collected_at"}
    print(f"  Collected {len(non_empty)}/8 hardware attributes:")
    for k, v in non_empty.items():
        display = v if len(v) <= 50 else v[:47] + "..."
        print(f"    {k}: {display}")

    if len(non_empty) < 3:
        print(
            "\nError: Need at least 3 hardware attributes for a valid fingerprint.",
            file=sys.stderr,
        )
        sys.exit(1)

    # Always save to output directory
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "machine-info.json"
    out_path.write_text(json.dumps(info, indent=2))
    print(f"\nSaved to {out_path.resolve()}")

    if args.save_local:
        local_path = Path("machine-info.json")
        local_path.write_text(json.dumps(info, indent=2))
        print(f"Also saved to {local_path.resolve()}")

    print(f"\nPushing to admin portal (customer: {args.customer_id})...")
    result = push_to_api(info, args.customer_id, args.api_url, args.token)

    print("Success! Machine info stored.")
    print(f"  ID:          {result.get('id', 'N/A')}")
    print(f"  Fingerprint: {result.get('fingerprint', 'N/A')}")
    print(f"  Label:       {result.get('label', 'N/A')}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Vrika Machine Information Collector
=====================================

Run this script on the target deployment machine.
It collects hardware identifiers and outputs machine-info.json.

Send machine-info.json to your Vrika administrator for license generation.

Usage:
    sudo python3 collect_machine_info.py

Requirements:
    - Python 3.8+
    - Linux OS
    - Root/sudo recommended for full hardware access
"""

import json
import platform
import subprocess
import sys
import uuid
from datetime import datetime, timezone


def read_file_safe(path: str) -> str:
    try:
        with open(path, "r") as f:
            return f.read().strip()
    except (OSError, PermissionError):
        return ""


def run_command_safe(cmd: list) -> str:
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        return result.stdout.strip() if result.returncode == 0 else ""
    except (OSError, subprocess.TimeoutExpired, FileNotFoundError):
        return ""


def get_machine_id() -> str:
    return read_file_safe("/etc/machine-id")


def get_bios_uuid() -> str:
    uuid_val = read_file_safe("/sys/class/dmi/id/product_uuid")
    if uuid_val:
        return uuid_val.lower()
    output = run_command_safe(["dmidecode", "-s", "system-uuid"])
    if output:
        return output.lower()
    return ""


def get_cpu_info() -> dict:
    cpuinfo = read_file_safe("/proc/cpuinfo")
    if not cpuinfo:
        return {"vendor": "", "model": "", "family": ""}

    vendor = ""
    model = ""
    family = ""

    for line in cpuinfo.splitlines():
        if line.startswith("vendor_id") and not vendor:
            vendor = line.split(":", 1)[1].strip()
        elif line.startswith("model name") and not model:
            model = line.split(":", 1)[1].strip()
        elif line.startswith("cpu family") and not family:
            family = line.split(":", 1)[1].strip()
        if vendor and model and family:
            break

    return {"vendor": vendor, "model": model, "family": family}


def get_disk_serial() -> str:
    output = run_command_safe(["lsblk", "-ndo", "SERIAL", "/dev/sda"])
    if output:
        return output.splitlines()[0].strip()
    output = run_command_safe(["lsblk", "-ndo", "SERIAL", "/dev/nvme0n1"])
    if output:
        return output.splitlines()[0].strip()
    output = run_command_safe(["lsblk", "-ndo", "NAME,SERIAL"])
    if output:
        for line in output.splitlines():
            parts = line.split(None, 1)
            if len(parts) == 2 and parts[1].strip():
                return parts[1].strip()
    return ""


def get_hostname() -> str:
    return platform.node()


def get_primary_mac() -> str:
    try:
        output = run_command_safe(["ip", "route", "show", "default"])
        if output:
            parts = output.split()
            if "dev" in parts:
                iface = parts[parts.index("dev") + 1]
                mac = read_file_safe(f"/sys/class/net/{iface}/address")
                if mac and mac != "00:00:00:00:00:00":
                    return mac.lower()
    except (IndexError, ValueError):
        pass
    mac_int = uuid.getnode()
    return ":".join(f"{(mac_int >> (8 * i)) & 0xff:02x}" for i in reversed(range(6)))


def main():
    print("=" * 60)
    print("  Vrika — Machine Information Collector")
    print("=" * 60)
    print()

    cpu = get_cpu_info()

    machine_info = {
        "machine_id": get_machine_id(),
        "bios_uuid": get_bios_uuid(),
        "cpu_vendor": cpu["vendor"],
        "cpu_model": cpu["model"],
        "cpu_family": cpu["family"],
        "disk_serial": get_disk_serial(),
        "hostname": get_hostname(),
        "mac_address": get_primary_mac(),
        "collected_at": datetime.now(timezone.utc).isoformat(),
    }

    # Display collection status
    print("  Components collected:")
    print("  " + "-" * 56)
    fields = [
        ("Machine ID", machine_info["machine_id"]),
        ("BIOS UUID", machine_info["bios_uuid"]),
        ("CPU Vendor", machine_info["cpu_vendor"]),
        ("CPU Model", machine_info["cpu_model"]),
        ("CPU Family", machine_info["cpu_family"]),
        ("Disk Serial", machine_info["disk_serial"]),
        ("Hostname", machine_info["hostname"]),
        ("MAC Address", machine_info["mac_address"]),
    ]

    for name, value in fields:
        status = "✓" if value else "✗"
        display = value[:40] if value else "(not available)"
        print(f"  {status} {name:<20} {display}")

    print()
    collected = sum(1 for _, v in fields if v)
    print(f"  Total: {collected}/8 components detected")
    print()

    if collected < 3:
        print("  ⚠️  WARNING: Less than 3 components detected.")
        print("  ⚠️  Try running with sudo for full hardware access.")
        print()

    # Write to file
    output_file = "machine-info.json"
    with open(output_file, "w") as f:
        json.dump(machine_info, f, indent=2)

    print(f"  ✓ Output written to: {output_file}")
    print()
    print("  " + "=" * 56)
    print("  Send this file to your Vrika administrator.")
    print("  Do NOT modify the file contents.")
    print("  " + "=" * 56)
    print()


if __name__ == "__main__":
    main()

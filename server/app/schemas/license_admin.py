"""Schemas for the license administration module."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class LicenseFeature(str, Enum):
    ai_agent = "ai_agent"
    network_scanner = "network_scanner"
    malware_analysis = "malware_analysis"
    forensics = "forensics"


class LicenseStatus(str, Enum):
    active = "active"
    expired = "expired"
    revoked = "revoked"
    suspended = "suspended"


class LicenseType(str, Enum):
    free_trial = "free_trial"
    standard = "standard"
    premium = "premium"
    enterprise = "enterprise"


class ProductEdition(str, Enum):
    standard = "standard"
    enterprise = "enterprise"


# --- Customers ---


class CustomerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: str = Field(..., min_length=3, max_length=320)
    organization: str = Field(..., min_length=1, max_length=200)


class CustomerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    email: Optional[str] = Field(None, min_length=3, max_length=320)
    organization: Optional[str] = Field(None, min_length=1, max_length=200)


class CustomerOut(BaseModel):
    id: str
    name: str
    email: str
    organization: str
    created_at: datetime
    licenses_count: int = 0


# --- Licenses ---


class LicenseGenerate(BaseModel):
    customer_id: str
    product: str = Field(default="vrika", min_length=1, max_length=100)
    edition: ProductEdition = ProductEdition.enterprise
    license_type: LicenseType = LicenseType.enterprise
    features: list[LicenseFeature]
    allowed_tools: list[str] = Field(default_factory=list, description="Tool names the customer is licensed to use. Empty = all tools allowed.")
    expires_at: str = Field(..., description="ISO date string (YYYY-MM-DD)")
    machine_fingerprint: str = Field(..., min_length=4, max_length=512)


class LicenseOut(BaseModel):
    id: str
    customer_id: str
    customer_name: str
    customer_email: str
    product: str
    edition: str = "enterprise"
    license_type: str = "enterprise"
    features: list[LicenseFeature]
    allowed_tools: list[str] = Field(default_factory=list)
    machine_fingerprint: str
    expires_at: datetime
    status: LicenseStatus
    created_at: datetime
    version: str = "1.0"


# --- Dashboard ---


class LicenseActivityOut(BaseModel):
    id: str
    action: str
    license_id: str
    customer_name: str
    timestamp: datetime


class LicenseDashboardOut(BaseModel):
    total_customers: int
    active_licenses: int
    expired_licenses: int
    enabled_features: dict[str, int]
    recent_activity: list[LicenseActivityOut]


# --- Machine Info ---


class MachineInfoUpload(BaseModel):
    """Schema for machine-info.json uploaded by admin."""
    machine_id: str = Field(default="", max_length=512)
    bios_uuid: str = Field(default="", max_length=512)
    cpu_vendor: str = Field(default="", max_length=256)
    cpu_model: str = Field(default="", max_length=256)
    cpu_family: str = Field(default="", max_length=64)
    disk_serial: str = Field(default="", max_length=256)
    hostname: str = Field(default="", max_length=256)
    mac_address: str = Field(default="", max_length=64)
    collected_at: Optional[str] = None

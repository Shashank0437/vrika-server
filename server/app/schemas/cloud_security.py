from pydantic import BaseModel, Field


class CloudSecurityEmbedOut(BaseModel):
    embed_path: str = Field(
        ...,
        description="Same-origin path to load in iframe (includes signed bridge token).",
    )


class NotifyScanCompletedIn(BaseModel):
    scan_id: str
    provider: str = Field(default="aws")
    account_id: str
    account_name: str | None = None
    compliance_score: int = Field(default=100, ge=0, le=100)
    scanned_resources: int = Field(default=0, ge=0)
    findings: dict[str, int] | None = None
    attack_paths_count: int = Field(default=0, ge=0)
    top_attack_path: str | None = None

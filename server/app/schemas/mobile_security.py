from pydantic import BaseModel, Field


class MobileSecurityEmbedOut(BaseModel):
    embed_path: str = Field(
        ...,
        description="Same-origin path to load in iframe (includes signed bridge token).",
    )

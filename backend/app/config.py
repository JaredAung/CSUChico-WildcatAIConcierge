"""
Application configuration using pydantic-settings.
All settings are loaded from environment variables or .env file.
"""
from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────────────────────
    app_name: str = "Wildcat AI Concierge"
    app_version: str = "1.0.0"
    dev_mode: bool = Field(default=True, description="Enable dev/mock mode (no AWS required)")
    debug: bool = Field(default=False)

    # ── CORS ──────────────────────────────────────────────────────────────────
    cors_origins: str = Field(
        default="http://localhost:3000",
        description="Comma-separated list of allowed CORS origins",
    )

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    # ── ChromaDB ─────────────────────────────────────────────────────────────
    chroma_persist_dir: str = Field(default="./data/chroma")
    chroma_collection_name: str = Field(default="wildcat_knowledge")

    # ── Embeddings ────────────────────────────────────────────────────────────
    embedding_model_name: str = Field(
        default="all-MiniLM-L6-v2",
        description="HuggingFace sentence-transformer model used in dev mode",
    )

    # ── RAG ───────────────────────────────────────────────────────────────────
    knowledge_base_dir: str = Field(default="./data/knowledge_base")
    top_k_results: int = Field(default=5, ge=1, le=20)
    confidence_threshold: float = Field(default=0.65, ge=0.0, le=1.0)

    # ── AWS Bedrock (production) ──────────────────────────────────────────────
    aws_region: str = Field(default="us-west-2")
    aws_access_key_id: str = Field(default="")
    aws_secret_access_key: str = Field(default="")
    bedrock_model_id: str = Field(default="anthropic.claude-3-5-sonnet-20241022-v2:0")
    bedrock_embedding_model_id: str = Field(default="amazon.titan-embed-text-v2:0")

    @field_validator("confidence_threshold", mode="before")
    @classmethod
    def _clamp_confidence(cls, v: float) -> float:
        return max(0.0, min(1.0, float(v)))

    @property
    def bedrock_configured(self) -> bool:
        """True when real AWS credentials are present."""
        return bool(
            self.aws_access_key_id
            and self.aws_access_key_id != "your_key_here"
            and self.aws_secret_access_key
            and self.aws_secret_access_key != "your_secret_here"
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached singleton Settings instance."""
    return Settings()

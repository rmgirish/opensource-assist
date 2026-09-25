"""Application configuration module using Pydantic Settings.

Supports environment variables and .env files for local, dockerized,
and cloud deployment configurations.
"""

from pathlib import Path
from typing import Literal
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Core application settings."""

    model_config = SettingsConfigDict(
        env_file=(str(_ROOT_DIR / ".env"), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Environment
    ENVIRONMENT: Literal["development", "testing", "production"] = Field(
        default="development",
        description="Deployment environment name.",
    )
    API_V1_PREFIX: str = Field(
        default="/api/v1", description="URL prefix for version 1 API routes."
    )

    # Authentication and relational database configuration
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/open_source_assist",
        description="Async SQLAlchemy connection URL for PostgreSQL.",
    )
    JWT_SECRET_KEY: str = Field(
        default="replace-with-a-long-random-secret-for-jwt-signing",
        description="Secret used to sign access tokens.",
    )
    JWT_ALGORITHM: str = Field(default="HS256", description="JWT signing algorithm.")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=120, ge=1, description="Access-token lifetime in minutes."
    )
    OTP_EXPIRE_MINUTES: int = Field(
        default=5, ge=1, description="Password-reset OTP lifetime in minutes."
    )
    SERVER_HOST: str = Field(
        default="0.0.0.0", description="Host interface for the Uvicorn server."
    )
    SERVER_PORT: int = Field(
        default=8000, ge=1, le=65535, description="Port for the Uvicorn server."
    )
    SERVER_RELOAD: bool = Field(
        default=True, description="Enable Uvicorn auto-reload."
    )
    CORS_ALLOW_ORIGINS: str = Field(
        default="http://localhost:5173", description="Comma-separated allowed CORS origins."
    )
    CORS_ALLOW_CREDENTIALS: bool = Field(
        default=True, description="Whether CORS credentials are allowed."
    )
    SMTP_HOST: str = Field(default="localhost", description="SMTP server hostname.")
    SMTP_PORT: int = Field(default=587, ge=1, le=65535, description="SMTP server port.")
    SMTP_USERNAME: str = Field(default="", description="SMTP authentication username.")
    SMTP_PASSWORD: str = Field(default="", description="SMTP authentication password.")
    MAIL_FROM: str = Field(default="", description="Email address shown as the sender.")
    SMTP_START_TLS: bool = Field(
        default=True, description="Upgrade the SMTP connection with STARTTLS."
    )
    SMTP_USE_TLS: bool = Field(
        default=False, description="Use implicit TLS instead of STARTTLS."
    )

    # Qdrant Database Configuration (Server Only: Local Docker, Self-Hosted, or Qdrant Cloud)
    QDRANT_URL: str = Field(
        default="http://localhost:6333",
        description="Required Qdrant Server URL (e.g., http://localhost:6333 or Qdrant Cloud URL).",
    )
    QDRANT_API_KEY: str | None = Field(
        default=None, description="Optional API key for Qdrant Cloud or protected servers."
    )

    @field_validator("QDRANT_API_KEY", mode="before")
    @classmethod
    def clean_api_key(cls, v: str | None) -> str | None:
        if v is not None and str(v).strip() == "":
            return None
        return v

    QDRANT_PREFER_GRPC: bool = Field(
        default=False, description="Whether to use Qdrant gRPC transport."
    )
    QDRANT_COLLECTION_NAME: str = Field(
        default="open_source_repositories", description="Qdrant collection name."
    )
    QDRANT_VECTOR_SIZE: int = Field(
        default=384, description="Vector dimension matching the embedding model."
    )

    # Embedding Configuration
    EMBEDDING_MODEL_NAME: str = Field(
        default="BAAI/bge-small-en-v1.5",
        description="FastEmbed model name for generating embeddings.",
    )

    # Search & Scoring Hyperparameters
    DEFAULT_POPULARITY_WEIGHT: float = Field(
        default=0.3, ge=0.0, le=1.0, description="Default popularity weight."
    )
    CANDIDATE_SEARCH_LIMIT: int = Field(
        default=100, ge=10, le=500, description="Qdrant candidate search limit."
    )
    DEFAULT_PAGE_LIMIT: int = Field(
        default=20, ge=1, le=100, description="Default result page size."
    )

    # Gemini API Configuration for Learning Materials Agent
    GEMINI_API_KEY: str | None = Field(
        default=None,
        description="API key for Google Gemini API services.",
    )
    GEMINI_MODEL: str = Field(
        default="gemini-3.5-flash",
        description="Gemini LLM model identifier for AI agents.",
    )


settings = Settings()

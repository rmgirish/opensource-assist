"""Ephemeral OTP database model acting as temporary key-value token cache."""

from datetime import datetime
from enum import Enum
from typing import Any

from sqlalchemy import DateTime, Enum as SqlEnum, Integer, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base


class OTPPurpose(str, Enum):
    SIGNUP_VERIFICATION = "SIGNUP_VERIFICATION"
    RESET_PASSWORD = "RESET_PASSWORD"


class OTP(Base):
    __tablename__ = "otps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(320), index=True, nullable=False)
    purpose: Mapped[OTPPurpose] = mapped_column(
        SqlEnum(OTPPurpose), nullable=False
    )
    # The column stores the HMAC-SHA256 hex digest, never plaintext OTP
    otp_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    # Stores ephemeral payload (e.g. pending signup password_hash)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("email", "purpose", name="uq_otps_email_purpose"),
    )
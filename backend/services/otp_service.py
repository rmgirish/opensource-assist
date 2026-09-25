"""Business logic for ephemeral OTP generation, storage, and consumption."""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import settings
from backend.core.security import hash_otp, verify_otp
from backend.models.otp_model import OTP, OTPPurpose
from backend.services import mail_service


class OTPService:
    """Manages short-lived OTP tokens in an ephemeral key-value pattern."""

    @staticmethod
    async def generate_and_store_otp(
        db: AsyncSession,
        email: str,
        purpose: OTPPurpose,
        payload: dict[str, Any] | None = None,
    ) -> str:
        """Generate a single-use 6-digit OTP, replace any pending OTP for this email/purpose, and send email."""
        normalized_email = email.strip().lower()

        # Delete any existing pending OTP for this email and purpose (KV replacement pattern)
        await db.execute(
            delete(OTP).where(OTP.email == normalized_email, OTP.purpose == purpose)
        )

        otp = f"{secrets.randbelow(1_000_000):06d}"
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

        otp_record = OTP(
            email=normalized_email,
            purpose=purpose,
            otp_hash=hash_otp(otp),
            payload=payload,
            expires_at=expires_at,
        )
        db.add(otp_record)
        await db.commit()

        # Dispatch notification
        if purpose == OTPPurpose.SIGNUP_VERIFICATION:
            await mail_service.send_signup_verification_otp(normalized_email, otp)
        elif purpose == OTPPurpose.RESET_PASSWORD:
            await mail_service.send_password_reset_otp(normalized_email, otp)

        return otp

    @staticmethod
    async def verify_and_consume_otp(
        db: AsyncSession,
        email: str,
        purpose: OTPPurpose,
        submitted_otp: str,
    ) -> dict[str, Any] | None:
        """Verify the OTP against the stored HMAC. If valid, deletes the record and returns payload."""
        normalized_email = email.strip().lower()
        now = datetime.now(timezone.utc)

        record = await db.scalar(
            select(OTP).where(
                OTP.email == normalized_email,
                OTP.purpose == purpose,
            )
        )

        if record is None:
            return None

        # Check expiration
        expires_at = record.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        if expires_at <= now:
            await db.delete(record)
            await db.commit()
            return None

        if not verify_otp(submitted_otp, record.otp_hash):
            return None

        payload = record.payload or {}
        # Single-use: delete consumed OTP
        await db.delete(record)
        await db.commit()
        return payload
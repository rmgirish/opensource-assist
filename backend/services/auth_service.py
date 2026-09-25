"""Business logic for user registration, verification, authentication, and password recovery."""

import uuid
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.jwt import create_access_token
from backend.core.security import hash_password, verify_password
from backend.models.otp_model import OTPPurpose
from backend.models.user_model import User
from backend.services.otp_service import OTPService


class AuthService:
    """Coordinates credential verification and user account lifecycle."""

    @staticmethod
    async def request_signup(
        db: AsyncSession, email: str, password: str, confirm_password: str
    ) -> None:
        """Validate registration request and dispatch signup verification OTP.
        
        The user is NOT persisted in the users table until OTP is successfully confirmed.
        """
        if password != confirm_password:
            raise ValueError("Passwords do not match")

        normalized_email = email.strip().lower()
        existing_user = await db.scalar(
            select(User).where(User.email == normalized_email)
        )
        if existing_user is not None:
            raise ValueError("User with this email already exists")

        # Hash password and store alongside OTP in ephemeral table
        password_hash = hash_password(password)
        await OTPService.generate_and_store_otp(
            db=db,
            email=normalized_email,
            purpose=OTPPurpose.SIGNUP_VERIFICATION,
            payload={"password_hash": password_hash},
        )

    @staticmethod
    async def verify_signup_otp(db: AsyncSession, email: str, otp: str) -> str:
        """Validate registration OTP and finalize user creation.
        
        Returns signed JWT access token for immediate session initiation.
        """
        normalized_email = email.strip().lower()

        existing_user = await db.scalar(
            select(User).where(User.email == normalized_email)
        )
        if existing_user is not None:
            raise ValueError("User with this email already exists")

        payload = await OTPService.verify_and_consume_otp(
            db=db,
            email=normalized_email,
            purpose=OTPPurpose.SIGNUP_VERIFICATION,
            submitted_otp=otp,
        )

        if payload is None or "password_hash" not in payload:
            raise ValueError("Invalid or expired verification code")

        # Persist newly verified user
        user = User(
            id=uuid.uuid4(),
            email=normalized_email,
            password_hash=payload["password_hash"],
            is_active=True,
        )
        db.add(user)
        try:
            await db.commit()
        except IntegrityError as exc:
            await db.rollback()
            raise ValueError("User with this email already exists") from exc

        await db.refresh(user)
        return create_access_token(str(user.id))

    @staticmethod
    async def login(db: AsyncSession, email: str, password: str) -> str:
        """Verify user credentials and return signed access token."""
        normalized_email = email.strip().lower()
        user = await db.scalar(select(User).where(User.email == normalized_email))

        if user is None or not verify_password(password, user.password_hash):
            raise ValueError("Invalid email or password")

        if not user.is_active:
            raise ValueError("Account is deactivated")

        return create_access_token(str(user.id))

    @staticmethod
    async def request_password_reset(db: AsyncSession, email: str) -> None:
        """Issue password-reset OTP if user exists, without leaking account existence."""
        normalized_email = email.strip().lower()
        user = await db.scalar(select(User).where(User.email == normalized_email))
        if user is None:
            return

        await OTPService.generate_and_store_otp(
            db=db,
            email=normalized_email,
            purpose=OTPPurpose.RESET_PASSWORD,
        )

    @staticmethod
    async def reset_password(
        db: AsyncSession, email: str, otp: str, new_password: str
    ) -> None:
        """Verify reset OTP and update user password."""
        normalized_email = email.strip().lower()
        user = await db.scalar(select(User).where(User.email == normalized_email))
        if user is None:
            raise ValueError("Invalid or expired OTP")

        payload = await OTPService.verify_and_consume_otp(
            db=db,
            email=normalized_email,
            purpose=OTPPurpose.RESET_PASSWORD,
            submitted_otp=otp,
        )
        if payload is None:
            raise ValueError("Invalid or expired OTP")

        user.password_hash = hash_password(new_password)
        await db.commit()
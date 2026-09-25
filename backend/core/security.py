"""Password and one-time-code security helpers."""

import hashlib
import hmac
import bcrypt
from passlib.context import CryptContext

from backend.core.config import settings

# Fix passlib bug with bcrypt >= 4.0.0 looking for bcrypt.__about__.__version__
if not hasattr(bcrypt, "__about__"):
    bcrypt.__about__ = type(
        "about", (), {"__version__": getattr(bcrypt, "__version__", "4.0.0")}
    )()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a password with bcrypt; the plaintext never reaches persistence."""
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    return pwd_context.verify(password, password_hash)


def hash_otp(otp: str) -> str:
    """Hash an OTP before persistence using a server-held secret."""
    return hmac.new(
        settings.JWT_SECRET_KEY.encode(), otp.encode(), hashlib.sha256
    ).hexdigest()


def verify_otp(otp: str, otp_hash: str) -> bool:
    """Constant-time comparison for a submitted OTP."""
    return hmac.compare_digest(hash_otp(otp), otp_hash)
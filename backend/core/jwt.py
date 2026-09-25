"""JWT access-token creation and decoding helpers."""

from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt

from backend.core.config import settings


def create_access_token(subject: str) -> str:
    """Create a signed bearer token with a two-hour default lifetime."""
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload: dict[str, Any] = {"sub": subject, "exp": expires_at}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    """Decode a token, returning None for invalid or expired credentials."""
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None
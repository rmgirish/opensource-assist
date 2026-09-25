"""FastAPI dependencies for dependency injection across routes."""

import uuid
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.database import get_db
from backend.core.jwt import decode_access_token
from backend.models.user_model import User
from backend.services.qdrant_service import QdrantService, qdrant_service
from backend.services.search_service import SearchService, search_service

# Enables Swagger UI "Authorize" dialog while keeping token submission optional for guest routes
bearer_security = HTTPBearer(auto_error=False)


def get_search_service() -> SearchService:
    """Provide the SearchService singleton instance."""
    return search_service


def get_qdrant_service() -> QdrantService:
    """Provide the QdrantService singleton instance."""
    return qdrant_service


async def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_security),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any] | None:
    """Decode an optional bearer token and verify user state without blocking guest access."""
    if credentials is None:
        return None

    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        return None

    try:
        user_id = uuid.UUID(payload["sub"])
    except (ValueError, TypeError):
        return None

    user = await db.scalar(select(User).where(User.id == user_id, User.is_active.is_(True)))
    if user is None:
        return None

    return {"user_id": str(user.id), "email": user.email, "token": token}


async def get_current_user(
    user: dict[str, Any] | None = Depends(get_optional_current_user),
) -> dict[str, Any]:
    """Require valid bearer token and active user account."""
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials or user inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user

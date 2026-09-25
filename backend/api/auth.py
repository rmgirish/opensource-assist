"""HTTP endpoints for authentication, registration verification, and password recovery."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from typing import Any
from backend.api.dependencies import get_current_user
from backend.core.database import get_db
from backend.schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    ResetPasswordRequest,
    SignupRequest,
    TokenResponse,
    UserProfileResponse,
    VerifySignupOTPRequest,
)
from backend.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/signup", response_model=MessageResponse, status_code=status.HTTP_200_OK)
async def signup(payload: SignupRequest, db: AsyncSession = Depends(get_db)) -> MessageResponse:
    """Initiate registration by validating payload and dispatching an email verification OTP.
    
    The user is not persisted to the database until OTP verification is completed.
    """
    try:
        await AuthService.request_signup(
            db, payload.email, payload.password, payload.confirm_password
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return MessageResponse(message="Verification code sent to your email")


@router.post(
    "/verify-signup-otp", response_model=AuthResponse, status_code=status.HTTP_201_CREATED
)
async def verify_signup_otp(
    payload: VerifySignupOTPRequest, db: AsyncSession = Depends(get_db)
) -> AuthResponse:
    """Verify signup OTP, persist user into the database, and issue access token."""
    try:
        token = await AuthService.verify_signup_otp(db, payload.email, payload.otp)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return AuthResponse(
        access_token=token,
        message="User registered and verified successfully",
    )


@router.post("/login", response_model=TokenResponse, status_code=status.HTTP_200_OK)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    """Verify user credentials and return signed access token."""
    try:
        token = await AuthService.login(db, payload.email, payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    return TokenResponse(access_token=token)


@router.post("/forgot-password", response_model=MessageResponse, status_code=status.HTTP_200_OK)
async def forgot_password(
    payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)
) -> MessageResponse:
    """Issue a password-reset OTP without leaking account existence."""
    await AuthService.request_password_reset(db, payload.email)
    return MessageResponse(message="If the account exists, a reset code has been sent")


@router.post("/reset-password", response_model=MessageResponse, status_code=status.HTTP_200_OK)
async def reset_password(
    payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)
) -> MessageResponse:
    """Verify a single-use OTP and replace the account password."""
    try:
        await AuthService.reset_password(db, payload.email, payload.otp, payload.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return MessageResponse(message="Password reset successfully")


@router.get("/me", response_model=UserProfileResponse, status_code=status.HTTP_200_OK)
async def get_me(current_user: dict[str, Any] = Depends(get_current_user)) -> UserProfileResponse:
    """Return profile details for the currently authenticated user."""
    return UserProfileResponse(id=current_user["user_id"], email=current_user["email"])
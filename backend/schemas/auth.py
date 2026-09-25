"""Pydantic schemas for authentication and password recovery workflows."""

from pydantic import BaseModel, EmailStr, Field, model_validator


class SignupRequest(BaseModel):
    """Payload to initiate user registration and dispatch verification OTP."""

    email: EmailStr = Field(description="Account email address.")
    password: str = Field(min_length=8, max_length=128, description="Account password.")
    confirm_password: str = Field(
        min_length=8, max_length=128, description="Password confirmation."
    )

    @model_validator(mode="after")
    def verify_passwords_match(self) -> "SignupRequest":
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


class VerifySignupOTPRequest(BaseModel):
    """Payload to verify registration OTP and finalize account creation."""

    email: EmailStr = Field(description="Account email address.")
    otp: str = Field(
        min_length=6,
        max_length=6,
        pattern=r"^\d{6}$",
        description="Six-digit registration verification code.",
    )


class LoginRequest(BaseModel):
    """Payload for user login."""

    email: EmailStr = Field(description="Account email address.")
    password: str = Field(min_length=1, max_length=128, description="Account password.")


class ForgotPasswordRequest(BaseModel):
    """Payload to request password reset OTP."""

    email: EmailStr = Field(description="Account email address.")


class ResetPasswordRequest(BaseModel):
    """Payload to verify reset OTP and replace account password."""

    email: EmailStr = Field(description="Account email address.")
    otp: str = Field(
        min_length=6,
        max_length=6,
        pattern=r"^\d{6}$",
        description="Six-digit reset code.",
    )
    new_password: str = Field(
        min_length=8, max_length=128, description="Replacement account password."
    )


class TokenResponse(BaseModel):
    """Response payload containing JWT access token."""

    access_token: str = Field(description="Signed JWT access token.")
    token_type: str = Field(default="bearer", description="Bearer authentication scheme.")


class AuthResponse(BaseModel):
    """Response payload returned upon registration verification and login."""

    access_token: str = Field(description="Signed JWT access token.")
    token_type: str = Field(default="bearer", description="Bearer authentication scheme.")
    message: str = Field(description="Status confirmation message.")


class MessageResponse(BaseModel):
    """Generic message response."""

    message: str = Field(description="Operation result message.")


class UserProfileResponse(BaseModel):
    """User profile data returned by /me endpoint."""

    id: str = Field(description="User unique identifier UUID.")
    email: EmailStr = Field(description="User account email address.")


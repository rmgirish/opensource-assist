"""Authentication and signup OTP verification tests with isolated in-memory database."""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from backend.core.database import Base, get_db
from backend.main import app
from backend.models.otp_model import OTP
from backend.models.user_model import User
from backend.services import mail_service


@pytest_asyncio.fixture
async def auth_session(monkeypatch: pytest.MonkeyPatch):
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    session = session_factory()

    async def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db
    dispatched_signup_otps: list[str] = []
    dispatched_reset_otps: list[str] = []

    async def capture_signup_otp(email: str, otp: str) -> None:
        dispatched_signup_otps.append(otp)

    async def capture_reset_otp(email: str, otp: str) -> None:
        dispatched_reset_otps.append(otp)

    monkeypatch.setattr(mail_service, "send_signup_verification_otp", capture_signup_otp)
    monkeypatch.setattr(mail_service, "send_password_reset_otp", capture_reset_otp)

    yield session, dispatched_signup_otps, dispatched_reset_otps

    app.dependency_overrides.clear()
    await session.close()
    await engine.dispose()


@pytest.mark.asyncio
async def test_signup_otp_verification_and_login_flow(auth_session) -> None:
    session, signup_otps, _ = auth_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Initiate signup
        signup_res = await client.post(
            "/api/v1/auth/signup",
            json={
                "email": "NewUser@Example.com",
                "password": "secure-password-123",
                "confirm_password": "secure-password-123",
            },
        )
        assert signup_res.status_code == 200
        assert signup_res.json()["message"] == "Verification code sent to your email"

        # Crucial check: User must NOT be inserted into users table before verification
        user_count = await session.scalar(select(func.count(User.id)))
        assert user_count == 0

        # OTP is staged in ephemeral otps table
        otp_count = await session.scalar(select(func.count(OTP.id)))
        assert otp_count == 1
        assert len(signup_otps) == 1
        generated_otp = signup_otps[0]

        # 2. Login before verification must fail
        unverified_login = await client.post(
            "/api/v1/auth/login",
            json={"email": "newuser@example.com", "password": "secure-password-123"},
        )
        assert unverified_login.status_code == 401

        # 3. Invalid OTP verification must fail
        bad_verify = await client.post(
            "/api/v1/auth/verify-signup-otp",
            json={"email": "newuser@example.com", "otp": "000000"},
        )
        assert bad_verify.status_code == 400

        # 4. Valid OTP verification creates user and issues JWT token
        good_verify = await client.post(
            "/api/v1/auth/verify-signup-otp",
            json={"email": "newuser@example.com", "otp": generated_otp},
        )
        assert good_verify.status_code == 201
        data = good_verify.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

        # User is now persisted and active
        created_user = await session.scalar(
            select(User).where(User.email == "newuser@example.com")
        )
        assert created_user is not None
        assert created_user.is_active is True
        assert str(created_user.id)  # Valid UUID string

        # OTP row has been consumed and deleted from ephemeral store
        assert (await session.scalar(select(func.count(OTP.id)))) == 0

        # 5. Re-submitting the same OTP fails (single use)
        replay_verify = await client.post(
            "/api/v1/auth/verify-signup-otp",
            json={"email": "newuser@example.com", "otp": generated_otp},
        )
        assert replay_verify.status_code == 400

        # 6. Duplicate signup for existing email fails
        duplicate_signup = await client.post(
            "/api/v1/auth/signup",
            json={
                "email": "newuser@example.com",
                "password": "secure-password-123",
                "confirm_password": "secure-password-123",
            },
        )
        assert duplicate_signup.status_code == 400

        # 7. Login succeeds
        login_res = await client.post(
            "/api/v1/auth/login",
            json={"email": "newuser@example.com", "password": "secure-password-123"},
        )
        assert login_res.status_code == 200
        assert login_res.json()["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_password_mismatch_fails_in_pydantic() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        mismatch_res = await client.post(
            "/api/v1/auth/signup",
            json={
                "email": "test@example.com",
                "password": "password-one",
                "confirm_password": "password-two",
            },
        )
        assert mismatch_res.status_code == 422


@pytest.mark.asyncio
async def test_password_reset_flow(auth_session) -> None:
    session, signup_otps, reset_otps = auth_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create user via signup + verification
        await client.post(
            "/api/v1/auth/signup",
            json={
                "email": "reset_user@example.com",
                "password": "original-password",
                "confirm_password": "original-password",
            },
        )
        await client.post(
            "/api/v1/auth/verify-signup-otp",
            json={"email": "reset_user@example.com", "otp": signup_otps[0]},
        )

        # Forgot password for non-existent email leaks nothing
        ghost_res = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "ghost@example.com"},
        )
        assert ghost_res.status_code == 200
        assert len(reset_otps) == 0

        # Forgot password for existing email
        forgot_res = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "reset_user@example.com"},
        )
        assert forgot_res.status_code == 200
        assert len(reset_otps) == 1
        reset_otp = reset_otps[0]

        # Reset password with wrong OTP
        wrong_otp_res = await client.post(
            "/api/v1/auth/reset-password",
            json={
                "email": "reset_user@example.com",
                "otp": "999999",
                "new_password": "new-password-456",
            },
        )
        assert wrong_otp_res.status_code == 400

        # Reset password with correct OTP
        success_reset = await client.post(
            "/api/v1/auth/reset-password",
            json={
                "email": "reset_user@example.com",
                "otp": reset_otp,
                "new_password": "new-password-456",
            },
        )
        assert success_reset.status_code == 200

        # Login with old password fails
        old_login = await client.post(
            "/api/v1/auth/login",
            json={"email": "reset_user@example.com", "password": "original-password"},
        )
        assert old_login.status_code == 401

        # Login with new password succeeds
        new_login = await client.post(
            "/api/v1/auth/login",
            json={"email": "reset_user@example.com", "password": "new-password-456"},
        )
        assert new_login.status_code == 200


@pytest.mark.asyncio
async def test_auth_dependencies(auth_session) -> None:
    session, signup_otps, _ = auth_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register user
        await client.post(
            "/api/v1/auth/signup",
            json={
                "email": "dep_test@example.com",
                "password": "valid-password-789",
                "confirm_password": "valid-password-789",
            },
        )
        verify_res = await client.post(
            "/api/v1/auth/verify-signup-otp",
            json={"email": "dep_test@example.com", "otp": signup_otps[0]},
        )
        token = verify_res.json()["access_token"]

        # 1. Call protected /me endpoint with valid bearer token
        res_me = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_me.status_code == 200
        profile = res_me.json()
        assert profile["email"] == "dep_test@example.com"
        assert profile["id"]  # valid UUID

        # 2. Call protected /me endpoint with invalid bearer token -> 401
        res_bad = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer invalid.token.payload"},
        )
        assert res_bad.status_code == 401

        # 3. Call protected /me endpoint with no authorization header -> 401
        res_none = await client.get("/api/v1/auth/me")
        assert res_none.status_code == 401
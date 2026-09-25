"""Create users and ephemeral OTP cache tables."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260923_0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    otp_purpose = sa.Enum("SIGNUP_VERIFICATION", "RESET_PASSWORD", name="otppurpose")

    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "otps",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("purpose", otp_purpose, nullable=False),
        sa.Column("otp_hash", sa.String(length=64), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("email", "purpose", name="uq_otps_email_purpose"),
    )
    op.create_index("ix_otps_email", "otps", ["email"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_otps_email", table_name="otps")
    op.drop_table("otps")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
    sa.Enum(name="otppurpose").drop(op.get_bind(), checkfirst=True)

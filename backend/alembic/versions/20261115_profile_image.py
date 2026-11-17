"""add private profile images to users

Revision ID: 20261115_profile_image
Revises: 20261115_med_stock
Create Date: 2026-11-15 18:16:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261115_profile_image"
down_revision: Union[str, None] = "20261115_med_stock"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("profile_image_data", sa.LargeBinary(), nullable=True))
    op.add_column(
        "users",
        sa.Column("profile_image_content_type", sa.String(length=32), nullable=True),
    )
    op.create_check_constraint(
        "ck_users_profile_image_pair",
        "users",
        "(profile_image_data IS NULL AND profile_image_content_type IS NULL) OR "
        "(profile_image_data IS NOT NULL AND profile_image_content_type IS NOT NULL)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_users_profile_image_pair", "users", type_="check")
    op.drop_column("users", "profile_image_content_type")
    op.drop_column("users", "profile_image_data")

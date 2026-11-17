"""add organization location and medication inventory

Revision ID: 20261115_med_stock
Revises: 20261115_medication_directory
Create Date: 2026-11-15 17:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261115_med_stock"
down_revision: Union[str, None] = "20261115_medication_directory"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("latitude", sa.Float(), nullable=True))
    op.add_column("organizations", sa.Column("longitude", sa.Float(), nullable=True))
    op.create_check_constraint(
        "ck_organizations_coordinates_pair",
        "organizations",
        "(latitude IS NULL AND longitude IS NULL) OR "
        "(latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)",
    )
    op.create_table(
        "organization_medication_stock",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("medication_id", sa.Uuid(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("quantity >= 0", name="ck_medication_stock_quantity"),
        sa.ForeignKeyConstraint(["medication_id"], ["medication_directory.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id",
            "medication_id",
            name="uq_organization_medication_stock_item",
        ),
    )
    op.create_index(
        op.f("ix_organization_medication_stock_organization_id"),
        "organization_medication_stock",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_organization_medication_stock_medication_id"),
        "organization_medication_stock",
        ["medication_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_organization_medication_stock_medication_id"),
        table_name="organization_medication_stock",
    )
    op.drop_index(
        op.f("ix_organization_medication_stock_organization_id"),
        table_name="organization_medication_stock",
    )
    op.drop_table("organization_medication_stock")
    op.drop_constraint(
        "ck_organizations_coordinates_pair",
        "organizations",
        type_="check",
    )
    op.drop_column("organizations", "longitude")
    op.drop_column("organizations", "latitude")

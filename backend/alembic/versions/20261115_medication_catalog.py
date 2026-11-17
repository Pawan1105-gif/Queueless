"""add organization medication catalogs

Revision ID: 20261115_medication_catalog
Revises: 20261114_prescription
Create Date: 2026-11-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261115_medication_catalog"
down_revision: Union[str, None] = "20261114_prescription"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "organization_medication_catalog",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_organization_medication_catalog_organization_id"),
        "organization_medication_catalog",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_organization_medication_catalog_created_by_id"),
        "organization_medication_catalog",
        ["created_by_id"],
        unique=False,
    )
    op.create_index(
        "uq_organization_medication_name_ci",
        "organization_medication_catalog",
        ["organization_id", sa.text("lower(name)")],
        unique=True,
    )
    op.add_column(
        "prescription_medications",
        sa.Column("catalog_item_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_prescription_medications_catalog_item_id",
        "prescription_medications",
        "organization_medication_catalog",
        ["catalog_item_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_prescription_medications_catalog_item_id"),
        "prescription_medications",
        ["catalog_item_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_prescription_medications_catalog_item_id"),
        table_name="prescription_medications",
    )
    op.drop_constraint(
        "fk_prescription_medications_catalog_item_id",
        "prescription_medications",
        type_="foreignkey",
    )
    op.drop_column("prescription_medications", "catalog_item_id")
    op.drop_index(
        "uq_organization_medication_name_ci",
        table_name="organization_medication_catalog",
    )
    op.drop_index(
        op.f("ix_organization_medication_catalog_created_by_id"),
        table_name="organization_medication_catalog",
    )
    op.drop_index(
        op.f("ix_organization_medication_catalog_organization_id"),
        table_name="organization_medication_catalog",
    )
    op.drop_table("organization_medication_catalog")

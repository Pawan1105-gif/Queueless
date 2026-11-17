"""store organization-scoped doctor details and availability

Revision ID: 20261115_doctor_details
Revises: 20261115_profile_image
Create Date: 2026-11-15 18:28:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261115_doctor_details"
down_revision: Union[str, None] = "20261115_profile_image"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "organization_staff",
        sa.Column(
            "availability_status",
            sa.String(length=20),
            server_default="available",
            nullable=False,
        ),
    )
    op.add_column(
        "organization_staff",
        sa.Column("specialization", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "organization_staff",
        sa.Column("qualification", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "organization_staff",
        sa.Column("registration_number", sa.String(length=80), nullable=True),
    )
    op.add_column(
        "organization_staff",
        sa.Column("experience_years", sa.Integer(), nullable=True),
    )
    op.add_column(
        "organization_staff",
        sa.Column("department", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "organization_staff",
        sa.Column("consultation_fee", sa.Numeric(precision=10, scale=2), nullable=True),
    )
    op.create_check_constraint(
        "ck_organization_staff_availability",
        "organization_staff",
        "availability_status IN ('available', 'occupied')",
    )
    op.create_index(
        "uq_organization_staff_registration_number_ci",
        "organization_staff",
        ["organization_id", sa.text("lower(registration_number)")],
        unique=True,
        postgresql_where=sa.text("registration_number IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_organization_staff_registration_number_ci",
        table_name="organization_staff",
    )
    op.drop_constraint(
        "ck_organization_staff_availability",
        "organization_staff",
        type_="check",
    )
    op.drop_column("organization_staff", "consultation_fee")
    op.drop_column("organization_staff", "department")
    op.drop_column("organization_staff", "experience_years")
    op.drop_column("organization_staff", "registration_number")
    op.drop_column("organization_staff", "qualification")
    op.drop_column("organization_staff", "specialization")
    op.drop_column("organization_staff", "availability_status")

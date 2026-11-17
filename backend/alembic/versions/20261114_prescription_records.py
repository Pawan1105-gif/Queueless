"""add doctor accounts and prescription records

Revision ID: 20261114_prescription
Revises: 10f1b85322e1
Create Date: 2026-11-14 23:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261114_prescription"
down_revision: Union[str, None] = "10f1b85322e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("ck_users_role", "users", type_="check")
    op.create_check_constraint(
        "ck_users_role",
        "users",
        "role IN ('customer', 'organization_admin', 'staff', 'doctor', 'super_admin')",
    )
    op.drop_constraint("ck_organization_staff_role", "organization_staff", type_="check")
    op.create_check_constraint(
        "ck_organization_staff_role",
        "organization_staff",
        "role IN ('admin', 'staff', 'doctor')",
    )
    op.create_table(
        "prescription_images",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("appointment_id", sa.Uuid(), nullable=False),
        sa.Column("uploaded_by_id", sa.Uuid(), nullable=True),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=32), nullable=False),
        sa.Column("image_data", sa.LargeBinary(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["appointment_id"], ["appointments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_prescription_images_appointment_id"),
        "prescription_images",
        ["appointment_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prescription_images_uploaded_by_id"),
        "prescription_images",
        ["uploaded_by_id"],
        unique=False,
    )
    op.create_table(
        "prescription_medications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("appointment_id", sa.Uuid(), nullable=False),
        sa.Column("prescribed_by_id", sa.Uuid(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("dosage", sa.String(length=80), nullable=False),
        sa.Column("frequency", sa.String(length=120), nullable=False),
        sa.Column("duration", sa.String(length=120), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["appointment_id"], ["appointments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["prescribed_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_prescription_medications_appointment_id"),
        "prescription_medications",
        ["appointment_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_prescription_medications_prescribed_by_id"),
        "prescription_medications",
        ["prescribed_by_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_prescription_medications_prescribed_by_id"),
        table_name="prescription_medications",
    )
    op.drop_index(
        op.f("ix_prescription_medications_appointment_id"),
        table_name="prescription_medications",
    )
    op.drop_table("prescription_medications")
    op.drop_index(
        op.f("ix_prescription_images_uploaded_by_id"),
        table_name="prescription_images",
    )
    op.drop_index(
        op.f("ix_prescription_images_appointment_id"),
        table_name="prescription_images",
    )
    op.drop_table("prescription_images")
    op.drop_constraint("ck_organization_staff_role", "organization_staff", type_="check")
    op.create_check_constraint(
        "ck_organization_staff_role",
        "organization_staff",
        "role IN ('admin', 'staff')",
    )
    op.drop_constraint("ck_users_role", "users", type_="check")
    op.create_check_constraint(
        "ck_users_role",
        "users",
        "role IN ('customer', 'organization_admin', 'staff', 'super_admin')",
    )

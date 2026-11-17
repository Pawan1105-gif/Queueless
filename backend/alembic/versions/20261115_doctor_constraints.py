"""constrain doctor experience and fees

Revision ID: 20261115_doctor_constraints
Revises: 20261115_doctor_details
Create Date: 2026-11-15 18:31:00

"""
from typing import Sequence, Union

from alembic import op


revision: str = "20261115_doctor_constraints"
down_revision: Union[str, None] = "20261115_doctor_details"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_check_constraint(
        "ck_organization_staff_experience_years",
        "organization_staff",
        "experience_years IS NULL OR experience_years BETWEEN 0 AND 80",
    )
    op.create_check_constraint(
        "ck_organization_staff_consultation_fee",
        "organization_staff",
        "consultation_fee IS NULL OR consultation_fee >= 0",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_organization_staff_consultation_fee",
        "organization_staff",
        type_="check",
    )
    op.drop_constraint(
        "ck_organization_staff_experience_years",
        "organization_staff",
        type_="check",
    )

"""create customer medication search directory

Revision ID: 20261115_medication_directory
Revises: 20261115_medication_catalog
Create Date: 2026-11-15 17:00:00.000000

"""
from typing import Sequence, Union
from uuid import UUID

from alembic import op
import sqlalchemy as sa


revision: str = "20261115_medication_directory"
down_revision: Union[str, None] = "20261115_medication_catalog"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SEED_MEDICATIONS = (
    ("a3c74190-0732-4c61-8ac1-3f901bc00001", "Calcium carbonate"),
    ("a3c74190-0732-4c61-8ac1-3f901bc00002", "Cetirizine"),
    ("a3c74190-0732-4c61-8ac1-3f901bc00003", "Ibuprofen"),
    ("a3c74190-0732-4c61-8ac1-3f901bc00004", "Loratadine"),
    ("a3c74190-0732-4c61-8ac1-3f901bc00005", "Omeprazole"),
    ("a3c74190-0732-4c61-8ac1-3f901bc00006", "Oral rehydration salts (ORS)"),
    ("a3c74190-0732-4c61-8ac1-3f901bc00007", "Paracetamol"),
    ("a3c74190-0732-4c61-8ac1-3f901bc00008", "Saline nasal spray"),
    ("a3c74190-0732-4c61-8ac1-3f901bc00009", "Vitamin C"),
    ("a3c74190-0732-4c61-8ac1-3f901bc00010", "Zinc supplement"),
)


def upgrade() -> None:
    op.create_table(
        "medication_directory",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_medication_directory_name_ci",
        "medication_directory",
        [sa.text("lower(name)")],
        unique=True,
    )
    medication_table = sa.table(
        "medication_directory",
        sa.column("id", sa.Uuid()),
        sa.column("name", sa.String(length=120)),
    )
    op.bulk_insert(
        medication_table,
        [{"id": UUID(medication_id), "name": name} for medication_id, name in SEED_MEDICATIONS],
    )


def downgrade() -> None:
    op.drop_index("uq_medication_directory_name_ci", table_name="medication_directory")
    op.drop_table("medication_directory")

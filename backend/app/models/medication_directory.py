import uuid
from datetime import datetime

from sqlalchemy import DateTime, Index, String, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class MedicationDirectoryItem(Base):
    __tablename__ = "medication_directory"
    __table_args__ = (
        Index("uq_medication_directory_name_ci", text("lower(name)"), unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

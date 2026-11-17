import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class QueueToken(Base):
    __tablename__ = "queue_tokens"
    __table_args__ = (
        UniqueConstraint("appointment_id", name="uq_queue_tokens_appointment"),
        UniqueConstraint(
            "organization_id",
            "service_id",
            "service_date",
            "token_number",
            name="uq_queue_tokens_daily_number",
        ),
        CheckConstraint("queue_position > 0", name="ck_queue_tokens_position_positive"),
        CheckConstraint(
            "status IN ('waiting', 'checked_in', 'called', 'serving', 'completed', "
            "'skipped', 'cancelled', 'no_show')",
            name="ck_queue_tokens_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    appointment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("appointments.id", ondelete="CASCADE"), nullable=False
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("organizations.id", ondelete="RESTRICT"), index=True
    )
    service_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("services.id", ondelete="RESTRICT"), index=True
    )
    counter_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("counters.id", ondelete="SET NULL"), index=True
    )
    service_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    token_number: Mapped[str] = mapped_column(String(24), nullable=False)
    queue_position: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="waiting")
    qr_secret_hash: Mapped[str | None] = mapped_column(String(255))
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    called_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

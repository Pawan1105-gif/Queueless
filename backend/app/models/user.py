import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, LargeBinary, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "role IN ('customer', 'organization_admin', 'staff', 'doctor', 'super_admin')",
            name="ck_users_role",
        ),
        CheckConstraint(
            "(profile_image_data IS NULL AND profile_image_content_type IS NULL) OR "
            "(profile_image_data IS NOT NULL AND profile_image_content_type IS NOT NULL)",
            name="ck_users_profile_image_pair",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32))
    profile_image_data: Mapped[bytes | None] = mapped_column(LargeBinary)
    profile_image_content_type: Mapped[str | None] = mapped_column(String(32))
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="customer")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

import uuid
from datetime import date, datetime, time as datetime_time
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class Organization(Base):
    __tablename__ = "organizations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'active', 'suspended')",
            name="ck_organizations_status",
        ),
        CheckConstraint(
            "(latitude IS NULL AND longitude IS NULL) OR "
            "(latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)",
            name="ck_organizations_coordinates_pair",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_admin_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    logo_url: Mapped[str | None] = mapped_column(String(2048))
    address: Mapped[str | None] = mapped_column(Text)
    contact_number: Mapped[str | None] = mapped_column(String(32))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    email: Mapped[str | None] = mapped_column(String(320))
    category: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class OrganizationStaff(Base):
    __tablename__ = "organization_staff"
    __table_args__ = (
        UniqueConstraint("organization_id", "user_id", name="uq_organization_staff_member"),
        CheckConstraint("role IN ('admin', 'staff', 'doctor')", name="ck_organization_staff_role"),
        CheckConstraint("status IN ('active', 'inactive')", name="ck_organization_staff_status"),
        CheckConstraint(
            "availability_status IN ('available', 'occupied')",
            name="ck_organization_staff_availability",
        ),
        CheckConstraint(
            "experience_years IS NULL OR experience_years BETWEEN 0 AND 80",
            name="ck_organization_staff_experience_years",
        ),
        CheckConstraint(
            "consultation_fee IS NULL OR consultation_fee >= 0",
            name="ck_organization_staff_consultation_fee",
        ),
        Index(
            "uq_organization_staff_registration_number_ci",
            "organization_id",
            text("lower(registration_number)"),
            unique=True,
            postgresql_where=text("registration_number IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    counter_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey(
            "counters.id",
            ondelete="SET NULL",
            name="fk_organization_staff_counter_id_counters",
        ),
        index=True,
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="staff")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    availability_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="available", server_default="available"
    )
    specialization: Mapped[str | None] = mapped_column(String(120))
    qualification: Mapped[str | None] = mapped_column(String(200))
    registration_number: Mapped[str | None] = mapped_column(String(80))
    experience_years: Mapped[int | None] = mapped_column(Integer)
    department: Mapped[str | None] = mapped_column(String(120))
    consultation_fee: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Counter(Base):
    __tablename__ = "counters"
    __table_args__ = (
        UniqueConstraint("organization_id", "name", name="uq_counters_organization_name"),
        CheckConstraint(
            "status IN ('active', 'paused', 'inactive')", name="ck_counters_status"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ServiceCounter(Base):
    __tablename__ = "service_counters"
    __table_args__ = (
        UniqueConstraint("service_id", "counter_id", name="uq_service_counters_pair"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    service_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("services.id", ondelete="CASCADE"), index=True
    )
    counter_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("counters.id", ondelete="CASCADE"), index=True
    )


class OperatingHour(Base):
    __tablename__ = "operating_hours"
    __table_args__ = (
        UniqueConstraint("organization_id", "weekday", name="uq_operating_hours_weekday"),
        CheckConstraint("weekday BETWEEN 0 AND 6", name="ck_operating_hours_weekday"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    weekday: Mapped[int] = mapped_column(Integer, nullable=False)
    opens_at: Mapped[datetime_time | None] = mapped_column(Time)
    closes_at: Mapped[datetime_time | None] = mapped_column(Time)
    is_closed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class OrganizationHoliday(Base):
    __tablename__ = "organization_holidays"
    __table_args__ = (
        UniqueConstraint("organization_id", "holiday_date", name="uq_organization_holiday_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    holiday_date: Mapped[date] = mapped_column(Date, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)

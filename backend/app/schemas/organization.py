from datetime import date, time
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=120)
    description: str | None = None
    address: str | None = None
    contact_number: str | None = Field(default=None, max_length=32)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    email: EmailStr | None = None
    category: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def validate_coordinates(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Both organization coordinates must be provided together")
        return self


class OrganizationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = None
    logo_url: str | None = Field(default=None, max_length=2048)
    address: str | None = None
    contact_number: str | None = Field(default=None, max_length=32)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    email: EmailStr | None = None
    category: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def validate_coordinates(self):
        coordinate_fields = {"latitude", "longitude"}
        supplied = coordinate_fields.intersection(self.model_fields_set)
        if supplied and supplied != coordinate_fields:
            raise ValueError("Both organization coordinates must be provided together")
        return self


class OrganizationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    name: str
    description: str | None
    logo_url: str | None
    address: str | None
    contact_number: str | None
    latitude: float | None
    longitude: float | None
    email: str | None
    category: str | None
    status: str

    @model_validator(mode="after")
    def validate_coordinates(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Both organization coordinates must be provided together")
        return self


class OperatingHourInput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    weekday: int = Field(ge=0, le=6)
    opens_at: time | None = None
    closes_at: time | None = None
    is_closed: bool = False

    @model_validator(mode="after")
    def validate_hours(self):
        if self.is_closed:
            if self.opens_at or self.closes_at:
                raise ValueError("Closed days cannot have opening or closing times")
        elif self.opens_at is None or self.closes_at is None or self.closes_at <= self.opens_at:
            raise ValueError("Open days require a valid opening and closing time")
        return self


class HolidayInput(BaseModel):
    holiday_date: date
    name: str = Field(min_length=1, max_length=160)


class ServiceInput(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    description: str | None = None
    category: str | None = Field(default=None, max_length=100)
    duration_minutes: int = Field(gt=0, le=480)
    max_appointment_capacity: int = Field(default=1, gt=0, le=1000)
    is_available: bool = True


class ServiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    name: str
    description: str | None
    category: str | None
    duration_minutes: int
    max_appointment_capacity: int
    is_available: bool


class CounterInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    status: str = Field(default="active", pattern=r"^(active|paused|inactive)$")


class CounterRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    name: str
    status: str


class StaffInput(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=160)
    password: str = Field(min_length=12, max_length=128)
    role: str = Field(default="staff", pattern=r"^(staff|admin|doctor)$")
    counter_id: UUID | None = None
    phone: str | None = Field(default=None, max_length=32)
    specialization: str | None = Field(default=None, max_length=120)
    qualification: str | None = Field(default=None, max_length=200)
    registration_number: str | None = Field(default=None, max_length=80)
    experience_years: int | None = Field(default=None, ge=0, le=80)
    department: str | None = Field(default=None, max_length=120)
    consultation_fee: Decimal | None = Field(
        default=None, ge=0, max_digits=10, decimal_places=2
    )

    @field_validator(
        "phone",
        "specialization",
        "qualification",
        "registration_number",
        "department",
        mode="before",
    )
    @classmethod
    def trim_optional_details(cls, value):
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def require_doctor_details(self):
        if self.role == "doctor":
            required_fields = (
                "phone",
                "specialization",
                "qualification",
                "registration_number",
                "experience_years",
                "department",
                "consultation_fee",
            )
            missing = [
                field for field in required_fields
                if getattr(self, field) is None or getattr(self, field) == ""
            ]
            if missing:
                raise ValueError(f"Doctor accounts require: {', '.join(missing)}")
        return self


class StaffUpdate(BaseModel):
    full_name: str = Field(min_length=1, max_length=160)
    password: str | None = Field(default=None, min_length=12, max_length=128)
    role: str = Field(default="staff", pattern=r"^(staff|admin|doctor)$")
    status: str = Field(default="active", pattern=r"^(active|inactive)$")
    counter_id: UUID | None = None


class StaffRead(BaseModel):
    id: UUID
    user_id: UUID
    organization_id: UUID
    email: EmailStr
    full_name: str
    phone: str | None = None
    role: str
    status: str
    counter_id: UUID | None
    availability_status: str = "available"
    specialization: str | None = None
    qualification: str | None = None
    registration_number: str | None = None
    experience_years: int | None = None
    department: str | None = None
    consultation_fee: Decimal | None = None


class DoctorAvailabilityUpdate(BaseModel):
    availability_status: str = Field(pattern=r"^(available|occupied)$")

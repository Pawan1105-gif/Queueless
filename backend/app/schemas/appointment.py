from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SlotRead(BaseModel):
    starts_at: datetime
    ends_at: datetime
    available_capacity: int


class AppointmentCreate(BaseModel):
    service_id: UUID
    starts_at: datetime
    customer_notes: str | None = Field(default=None, max_length=2000)


class AppointmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    reference: str
    customer_id: UUID
    organization_id: UUID
    service_id: UUID
    starts_at: datetime
    ends_at: datetime
    status: str
    customer_notes: str | None
    created_at: datetime


class AppointmentDetail(AppointmentRead):
    organization_name: str
    service_name: str
    token_id: UUID | None = None
    token_number: str | None = None
    queue_status: str | None = None
    estimated_wait_minutes: int | None = None


class AppointmentManage(BaseModel):
    status: str = Field(pattern=r"^(confirmed|rejected|cancelled)$")


class QueueTokenRead(BaseModel):
    id: UUID
    appointment_id: UUID
    reference: str
    organization_id: UUID
    organization_name: str
    service_id: UUID
    service_name: str
    service_date: date
    token_number: str
    queue_position: int
    status: str
    counter_id: UUID | None
    counter_name: str | None
    customers_ahead: int
    estimated_wait_minutes: int
    waiting_time_is_estimate: bool = True

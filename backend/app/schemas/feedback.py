from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class FeedbackCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comments: str | None = Field(default=None, max_length=4000)


class FeedbackRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    appointment_id: UUID
    customer_id: UUID
    organization_id: UUID
    rating: int
    comments: str | None
    created_at: datetime


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID | None
    title: str
    message: str
    channel: str
    is_read: bool
    created_at: datetime

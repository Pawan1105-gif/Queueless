from uuid import UUID

from pydantic import BaseModel, Field


class QRCheckInRequest(BaseModel):
    qr_token: str = Field(min_length=20, max_length=4096)


class QueueActionRequest(BaseModel):
    token_id: UUID


class CounterStatusRequest(BaseModel):
    status: str = Field(pattern=r"^(active|paused|inactive)$")

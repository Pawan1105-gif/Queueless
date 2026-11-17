from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class MedicationDirectoryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return " ".join(value.split())


class MedicationDirectoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    created_at: datetime


class NearbyPharmacyRead(BaseModel):
    id: str
    name: str
    latitude: float
    longitude: float
    distance_km: float
    address: str | None
    phone: str | None
    website: str | None

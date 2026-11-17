from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class MedicationStockCreate(BaseModel):
    medication_id: UUID
    quantity: int = Field(ge=0, le=1_000_000)


class MedicationStockUpdate(BaseModel):
    quantity: int = Field(ge=0, le=1_000_000)


class MedicationStockRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    medication_id: UUID
    medication_name: str
    quantity: int
    updated_at: datetime


class NearbyMedicationStockRead(BaseModel):
    organization_id: UUID
    organization_name: str
    address: str | None
    contact_number: str | None
    latitude: float
    longitude: float
    medication_name: str
    quantity: int
    distance_km: float
    estimated_travel_minutes: int

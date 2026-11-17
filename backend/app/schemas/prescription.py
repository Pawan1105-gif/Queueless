from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PrescriptionImageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    file_name: str
    content_type: str
    created_at: datetime


class PrescriptionMedicationInput(BaseModel):
    catalog_item_id: UUID | None = None
    name: str = Field(min_length=1, max_length=120)
    dosage: str = Field(min_length=1, max_length=80)
    frequency: str = Field(min_length=1, max_length=120)
    duration: str = Field(min_length=1, max_length=120)
    instructions: str | None = Field(default=None, max_length=2000)


class PrescriptionMedicationRead(PrescriptionMedicationInput):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    position: int


class PrescriptionMedicationList(BaseModel):
    medications: list[PrescriptionMedicationInput] = Field(max_length=50)


class PrescriptionRead(BaseModel):
    images: list[PrescriptionImageRead]
    medications: list[PrescriptionMedicationRead]

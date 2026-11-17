import json
import math
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.dependencies import require_roles
from app.database.session import get_db
from app.models import (
    MedicationDirectoryItem,
    Organization,
    OrganizationMedicationStock,
    User,
)
from app.schemas.medication_directory import MedicationDirectoryRead, NearbyPharmacyRead
from app.schemas.medication_stock import NearbyMedicationStockRead

router = APIRouter(prefix="/medications", tags=["medications"])
OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter"


@router.get("/catalog", response_model=list[MedicationDirectoryRead])
def list_medications(
    search: str | None = Query(default=None, max_length=120),
    user: User = Depends(require_roles("customer")),
    db: Session = Depends(get_db),
):
    query = select(MedicationDirectoryItem).where(MedicationDirectoryItem.is_active.is_(True))
    if search and search.strip():
        query = query.where(MedicationDirectoryItem.name.ilike(f"%{search.strip()}%"))
    return db.scalars(query.order_by(MedicationDirectoryItem.name)).all()


@router.get("/nearby-pharmacies", response_model=list[NearbyPharmacyRead])
def nearby_pharmacies(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
    radius_meters: int = Query(default=5000, ge=500, le=20000),
    user: User = Depends(require_roles("customer")),
):
    query = (
        "[out:json][timeout:18];"
        "("
        f'node(around:{radius_meters},{latitude},{longitude})["amenity"="pharmacy"];'
        f'way(around:{radius_meters},{latitude},{longitude})["amenity"="pharmacy"];'
        f'relation(around:{radius_meters},{latitude},{longitude})["amenity"="pharmacy"];'
        f'node(around:{radius_meters},{latitude},{longitude})["shop"="chemist"];'
        f'way(around:{radius_meters},{latitude},{longitude})["shop"="chemist"];'
        f'relation(around:{radius_meters},{latitude},{longitude})["shop"="chemist"];'
        ");out center tags;"
    )
    request = Request(
        OVERPASS_ENDPOINT,
        data=urlencode({"data": query}).encode("utf-8"),
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "QueueLess/1.0 (nearby-pharmacy search)",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=22) as response:
            payload = json.loads(response.read())
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=503,
            detail="Nearby pharmacy search is temporarily unavailable. Please try again later.",
        ) from exc

    if not isinstance(payload, dict) or payload.get("remark"):
        raise HTTPException(
            status_code=503,
            detail="Nearby pharmacy search is temporarily unavailable. Please try again later.",
        )
    return normalize_pharmacy_results(payload, latitude, longitude)


@router.get("/nearby-stock", response_model=list[NearbyMedicationStockRead])
def nearby_medication_stock(
    medication_id: UUID,
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
    radius_meters: int = Query(default=10000, ge=500, le=50000),
    user: User = Depends(require_roles("customer")),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        select(
            OrganizationMedicationStock,
            Organization,
            MedicationDirectoryItem.name,
        )
        .join(Organization, Organization.id == OrganizationMedicationStock.organization_id)
        .join(MedicationDirectoryItem, MedicationDirectoryItem.id == OrganizationMedicationStock.medication_id)
        .where(
            OrganizationMedicationStock.medication_id == medication_id,
            OrganizationMedicationStock.quantity > 0,
            Organization.status == "active",
            Organization.latitude.is_not(None),
            Organization.longitude.is_not(None),
            MedicationDirectoryItem.is_active.is_(True),
        )
    ).all()
    results = []
    for stock, organization, medication_name in rows:
        distance = haversine_km(
            latitude,
            longitude,
            organization.latitude,
            organization.longitude,
        )
        if distance * 1000 > radius_meters:
            continue
        results.append(
            NearbyMedicationStockRead(
                organization_id=organization.id,
                organization_name=organization.name,
                address=organization.address,
                contact_number=organization.contact_number,
                latitude=organization.latitude,
                longitude=organization.longitude,
                medication_name=medication_name,
                quantity=stock.quantity,
                distance_km=round(distance, 2),
                estimated_travel_minutes=max(1, math.ceil(distance * 1.3 / 25 * 60)),
            )
        )
    return sorted(results, key=lambda item: (item.distance_km, item.organization_name.casefold()))


def normalize_pharmacy_results(
    payload: dict,
    origin_latitude: float,
    origin_longitude: float,
) -> list[NearbyPharmacyRead]:
    pharmacies = []
    seen = set()
    for element in payload.get("elements", []):
        if not isinstance(element, dict):
            continue
        tags = element.get("tags", {})
        tags = tags if isinstance(tags, dict) else {}
        coordinates = element.get("center", element)
        coordinates = coordinates if isinstance(coordinates, dict) else {}
        name_value = tags.get("name", "")
        name = name_value.strip() if isinstance(name_value, str) else ""
        latitude = coordinates.get("lat")
        longitude = coordinates.get("lon")
        key = (element.get("type"), element.get("id"))
        if (
            not name
            or key in seen
            or not isinstance(latitude, (int, float))
            or not isinstance(longitude, (int, float))
        ):
            continue
        seen.add(key)
        address = tags.get("addr:full")
        if not address:
            address_parts = [
                tags.get("addr:housenumber"),
                tags.get("addr:street"),
                tags.get("addr:suburb"),
                tags.get("addr:city"),
                tags.get("addr:postcode"),
            ]
            address = ", ".join(part for part in address_parts if isinstance(part, str) and part) or None
        phone = tags.get("contact:phone") or tags.get("phone")
        website = tags.get("contact:website") or tags.get("website")
        phone = phone if isinstance(phone, str) else None
        website = website if isinstance(website, str) else None
        pharmacies.append(
            NearbyPharmacyRead(
                id=f"{element.get('type')}/{element.get('id')}",
                name=name,
                latitude=latitude,
                longitude=longitude,
                distance_km=round(
                    haversine_km(
                        origin_latitude,
                        origin_longitude,
                        latitude,
                        longitude,
                    ),
                    2,
                ),
                address=address,
                phone=phone,
                website=website,
            )
        )
    return sorted(pharmacies, key=lambda pharmacy: (pharmacy.distance_km, pharmacy.name.casefold()))


def haversine_km(latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float) -> float:
    radians = math.radians
    latitude_delta = radians(latitude_b - latitude_a)
    longitude_delta = radians(longitude_b - longitude_a)
    value = (
        math.sin(latitude_delta / 2) ** 2
        + math.cos(radians(latitude_a))
        * math.cos(radians(latitude_b))
        * math.sin(longitude_delta / 2) ** 2
    )
    value = min(1.0, max(0.0, value))
    return 6371 * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))

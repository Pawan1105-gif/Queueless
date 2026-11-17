import json
from io import BytesIO
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.api.routes import medications as medication_routes
from app.core.security import hash_password
from app.database.session import SessionLocal
from app.main import app
from app.models import User
from app.api.routes.medications import haversine_km, normalize_pharmacy_results

client = TestClient(app)
TEST_PASSWORD = "QueueLess-medication-test-1"


def test_pharmacies_are_normalized_and_sorted_by_distance():
    payload = {
        "elements": [
            {
                "type": "way",
                "id": 20,
                "center": {"lat": 28.62, "lon": 77.22},
                "tags": {
                    "name": "Far Pharmacy",
                    "addr:street": "Market Road",
                    "addr:city": "Delhi",
                    "contact:phone": "+91 11111 11111",
                    "contact:website": "https://example.test",
                },
            },
            {
                "type": "node",
                "id": 10,
                "lat": 28.61,
                "lon": 77.21,
                "tags": {"name": "Near Pharmacy", "phone": "+91 22222 22222"},
            },
            {
                "type": "node",
                "id": 30,
                "lat": 28.61,
                "lon": 77.21,
                "tags": {},
            },
        ]
    }

    pharmacies = normalize_pharmacy_results(payload, 28.6, 77.2)

    assert [pharmacy.name for pharmacy in pharmacies] == ["Near Pharmacy", "Far Pharmacy"]
    assert pharmacies[0].phone == "+91 22222 22222"
    assert pharmacies[1].address == "Market Road, Delhi"
    assert pharmacies[1].website == "https://example.test"
    assert pharmacies[0].distance_km < pharmacies[1].distance_km


def test_haversine_distance_is_zero_for_same_location():
    assert haversine_km(28.6, 77.2, 28.6, 77.2) == 0


def test_customer_can_search_seeded_medications_and_nearby_pharmacies(monkeypatch):
    user_id = uuid4()
    email = f"medication-search-{user_id.hex}@example.com"
    with SessionLocal.begin() as db:
        db.add(
            User(
                id=user_id,
                email=email,
                full_name="Medication Search Test",
                password_hash=hash_password(TEST_PASSWORD),
                role="customer",
            )
        )

    try:
        login = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": TEST_PASSWORD},
        )
        assert login.status_code == 200, login.text
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        catalog = client.get("/api/v1/medications/catalog", headers=headers)
        assert catalog.status_code == 200, catalog.text
        assert len(catalog.json()) == 10
        assert "Paracetamol" in {item["name"] for item in catalog.json()}

        payload = {
            "elements": [
                {
                    "type": "node",
                    "id": 123,
                    "lat": 28.61,
                    "lon": 77.21,
                    "tags": {"name": "Nearby Pharmacy", "phone": "+91 22222 22222"},
                }
            ]
        }
        monkeypatch.setattr(
            medication_routes,
            "urlopen",
            lambda request, timeout: BytesIO(json.dumps(payload).encode("utf-8")),
        )
        nearby = client.get(
            "/api/v1/medications/nearby-pharmacies",
            headers=headers,
            params={"latitude": 28.6, "longitude": 77.2, "radius_meters": 10000},
        )
        assert nearby.status_code == 200, nearby.text
        assert nearby.json()[0]["name"] == "Nearby Pharmacy"
        assert nearby.json()[0]["phone"] == "+91 22222 22222"

        invalid_location = client.get(
            "/api/v1/medications/nearby-pharmacies",
            headers=headers,
            params={"latitude": 100, "longitude": 77.2},
        )
        assert invalid_location.status_code == 422
    finally:
        with SessionLocal.begin() as db:
            db.execute(delete(User).where(User.id == user_id))

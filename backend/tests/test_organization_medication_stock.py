from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.core.security import hash_password
from app.database.session import SessionLocal
from app.main import app
from app.models import (
    AuditLog,
    MedicationDirectoryItem,
    Organization,
    OrganizationMedicationStock,
    User,
)

client = TestClient(app)
TEST_PASSWORD = "QueueLess-stock-test-password"


def _login(email: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": TEST_PASSWORD},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_organization_inventory_is_tenant_scoped_and_visible_nearby():
    suffix = uuid4().hex
    customer_email = f"stock-customer-{suffix}@example.com"
    first_admin_email = f"stock-first-admin-{suffix}@example.com"
    second_admin_email = f"stock-second-admin-{suffix}@example.com"
    customer_id, first_admin_id, second_admin_id = uuid4(), uuid4(), uuid4()
    first_org_id, second_org_id = uuid4(), uuid4()
    custom_medication_id = None
    with SessionLocal.begin() as db:
        db.add_all(
            [
                User(id=customer_id, email=customer_email, full_name="Stock Customer", password_hash=hash_password(TEST_PASSWORD), role="customer"),
                User(id=first_admin_id, email=first_admin_email, full_name="First Store Admin", password_hash=hash_password(TEST_PASSWORD), role="organization_admin"),
                User(id=second_admin_id, email=second_admin_email, full_name="Second Store Admin", password_hash=hash_password(TEST_PASSWORD), role="organization_admin"),
            ]
        )
        db.flush()
        db.add_all(
            [
                Organization(
                    id=first_org_id,
                    owner_admin_id=first_admin_id,
                    slug=f"stock-first-{suffix}",
                    name="Nearby Pharmacy",
                    status="active",
                    address="1 Main Street",
                    contact_number="+91 11111 11111",
                    latitude=28.61,
                    longitude=77.21,
                ),
                Organization(
                    id=second_org_id,
                    owner_admin_id=second_admin_id,
                    slug=f"stock-second-{suffix}",
                    name="Farther Pharmacy",
                    status="active",
                    latitude=28.65,
                    longitude=77.25,
                ),
            ]
        )
        medication_id = db.scalar(
            select(MedicationDirectoryItem.id).where(
                MedicationDirectoryItem.name == "Paracetamol"
            )
        )
        assert medication_id is not None

    try:
        customer_headers = _login(customer_email)
        first_admin_headers = _login(first_admin_email)
        second_admin_headers = _login(second_admin_email)

        first_stock = client.post(
            f"/api/v1/organizations/{first_org_id}/medication-stock",
            headers=first_admin_headers,
            json={"medication_id": str(medication_id), "quantity": 12},
        )
        assert first_stock.status_code == 201, first_stock.text
        assert first_stock.json()["quantity"] == 12
        shared_catalog = client.get(
            f"/api/v1/organizations/{first_org_id}/medication-stock/catalog",
            headers=first_admin_headers,
        )
        assert shared_catalog.status_code == 200, shared_catalog.text
        assert len(shared_catalog.json()) == 10
        custom_medication = client.post(
            f"/api/v1/organizations/{first_org_id}/medication-stock/catalog",
            headers=first_admin_headers,
            json={"name": f"Store-specific medicine {suffix}"},
        )
        assert custom_medication.status_code == 201, custom_medication.text
        custom_medication_id = custom_medication.json()["id"]
        assert client.post(
            f"/api/v1/organizations/{first_org_id}/medication-stock/catalog",
            headers=first_admin_headers,
            json={"name": f" Store-specific   medicine {suffix} "},
        ).status_code == 409
        custom_stock = client.post(
            f"/api/v1/organizations/{first_org_id}/medication-stock",
            headers=first_admin_headers,
            json={"medication_id": custom_medication_id, "quantity": 2},
        )
        assert custom_stock.status_code == 201, custom_stock.text

        assert client.get(
            f"/api/v1/organizations/{first_org_id}/medication-stock",
            headers=second_admin_headers,
        ).status_code == 403
        assert client.patch(
            f"/api/v1/organizations/{first_org_id}/medication-stock/{first_stock.json()['id']}",
            headers=second_admin_headers,
            json={"quantity": 100},
        ).status_code == 403

        second_stock = client.post(
            f"/api/v1/organizations/{second_org_id}/medication-stock",
            headers=second_admin_headers,
            json={"medication_id": str(medication_id), "quantity": 3},
        )
        assert second_stock.status_code == 201, second_stock.text

        nearby = client.get(
            "/api/v1/medications/nearby-stock",
            headers=customer_headers,
            params={
                "medication_id": str(medication_id),
                "latitude": 28.6,
                "longitude": 77.2,
                "radius_meters": 10000,
            },
        )
        assert nearby.status_code == 200, nearby.text
        assert [item["organization_name"] for item in nearby.json()] == [
            "Nearby Pharmacy",
            "Farther Pharmacy",
        ]
        assert nearby.json()[0]["contact_number"] == "+91 11111 11111"
        assert nearby.json()[0]["quantity"] == 12
        assert nearby.json()[0]["estimated_travel_minutes"] > 0

        custom_nearby = client.get(
            "/api/v1/medications/nearby-stock",
            headers=customer_headers,
            params={
                "medication_id": custom_medication_id,
                "latitude": 28.6,
                "longitude": 77.2,
                "radius_meters": 10000,
            },
        )
        assert [item["organization_name"] for item in custom_nearby.json()] == [
            "Nearby Pharmacy"
        ]

        updated = client.patch(
            f"/api/v1/organizations/{first_org_id}/medication-stock/{first_stock.json()['id']}",
            headers=first_admin_headers,
            json={"quantity": 0},
        )
        assert updated.status_code == 200, updated.text
        nearby_after_update = client.get(
            "/api/v1/medications/nearby-stock",
            headers=customer_headers,
            params={
                "medication_id": str(medication_id),
                "latitude": 28.6,
                "longitude": 77.2,
                "radius_meters": 10000,
            },
        )
        assert [item["organization_name"] for item in nearby_after_update.json()] == [
            "Farther Pharmacy"
        ]

        assert client.delete(
            f"/api/v1/organizations/{first_org_id}/medication-stock/{first_stock.json()['id']}",
            headers=first_admin_headers,
        ).status_code == 204
        assert client.post(
            f"/api/v1/organizations/{first_org_id}/medication-stock",
            headers=first_admin_headers,
            json={"medication_id": str(medication_id), "quantity": -1},
        ).status_code == 422
    finally:
        with SessionLocal.begin() as db:
            db.execute(
                delete(AuditLog).where(
                    AuditLog.organization_id.in_([first_org_id, second_org_id])
                )
            )
            db.execute(
                delete(OrganizationMedicationStock).where(
                    OrganizationMedicationStock.organization_id.in_([first_org_id, second_org_id])
                )
            )
            if custom_medication_id:
                db.execute(
                    delete(MedicationDirectoryItem).where(
                        MedicationDirectoryItem.id == custom_medication_id
                    )
                )
            db.execute(delete(Organization).where(Organization.id.in_([first_org_id, second_org_id])))
            db.execute(
                delete(User).where(
                    User.id.in_([customer_id, first_admin_id, second_admin_id])
                )
            )

from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.core.security import hash_password
from app.database.session import SessionLocal
from app.main import app
from app.models import Organization, OrganizationStaff, User

client = TestClient(app)
TEST_PASSWORD = "QueueLess-doctor-test-password"


def _login(email: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": TEST_PASSWORD},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _doctor_payload(email: str, registration_number: str) -> dict:
    return {
        "email": email,
        "full_name": "Available Test Doctor",
        "password": TEST_PASSWORD,
        "role": "doctor",
        "phone": "+91 98765 43210",
        "specialization": "Cardiology",
        "qualification": "MBBS, MD",
        "registration_number": registration_number,
        "experience_years": 8,
        "department": "Cardiology",
        "consultation_fee": "450.50",
    }


def test_organization_doctor_details_availability_and_tenant_scope():
    suffix = uuid4().hex
    first_admin_email = f"doctor-first-admin-{suffix}@example.com"
    second_admin_email = f"doctor-second-admin-{suffix}@example.com"
    first_doctor_email = f"doctor-first-{suffix}@example.com"
    second_doctor_email = f"doctor-second-{suffix}@example.com"
    first_admin_id, second_admin_id = uuid4(), uuid4()
    first_org_id, second_org_id = uuid4(), uuid4()

    with SessionLocal.begin() as db:
        db.add_all(
            [
                User(
                    id=first_admin_id,
                    email=first_admin_email,
                    full_name="First Clinic Admin",
                    password_hash=hash_password(TEST_PASSWORD),
                    role="organization_admin",
                ),
                User(
                    id=second_admin_id,
                    email=second_admin_email,
                    full_name="Second Clinic Admin",
                    password_hash=hash_password(TEST_PASSWORD),
                    role="organization_admin",
                ),
            ]
        )
        db.flush()
        db.add_all(
            [
                Organization(
                    id=first_org_id,
                    owner_admin_id=first_admin_id,
                    slug=f"doctor-first-{suffix}",
                    name="First Doctor Clinic",
                    status="active",
                ),
                Organization(
                    id=second_org_id,
                    owner_admin_id=second_admin_id,
                    slug=f"doctor-second-{suffix}",
                    name="Second Doctor Clinic",
                    status="active",
                ),
            ]
        )

    try:
        first_admin_headers = _login(first_admin_email)
        second_admin_headers = _login(second_admin_email)
        first_doctor_payload = _doctor_payload(first_doctor_email, f"REG-{suffix}")

        incomplete = client.post(
            f"/api/v1/organizations/{first_org_id}/staff",
            headers=first_admin_headers,
            json={
                "email": first_doctor_email,
                "full_name": "Incomplete Test Doctor",
                "password": TEST_PASSWORD,
                "role": "doctor",
            },
        )
        assert incomplete.status_code == 422

        created = client.post(
            f"/api/v1/organizations/{first_org_id}/staff",
            headers=first_admin_headers,
            json=first_doctor_payload,
        )
        assert created.status_code == 201, created.text
        doctor = created.json()
        assert doctor["organization_id"] == str(first_org_id)
        assert doctor["phone"] == first_doctor_payload["phone"]
        assert doctor["specialization"] == "Cardiology"
        assert doctor["qualification"] == "MBBS, MD"
        assert doctor["registration_number"] == f"REG-{suffix}".upper()
        assert doctor["experience_years"] == 8
        assert doctor["department"] == "Cardiology"
        assert doctor["consultation_fee"] == "450.50"
        assert doctor["availability_status"] == "available"

        available = client.get(
            f"/api/v1/organizations/{first_org_id}/doctors",
            headers=first_admin_headers,
        )
        assert available.status_code == 200, available.text
        assert [item["id"] for item in available.json()] == [doctor["id"]]

        occupied = client.patch(
            f"/api/v1/organizations/{first_org_id}/doctors/{doctor['id']}/availability",
            headers=first_admin_headers,
            json={"availability_status": "occupied"},
        )
        assert occupied.status_code == 200, occupied.text
        assert occupied.json()["availability_status"] == "occupied"

        assert client.get(
            f"/api/v1/organizations/{first_org_id}/doctors",
            headers=second_admin_headers,
        ).status_code == 403
        assert client.patch(
            f"/api/v1/organizations/{first_org_id}/doctors/{doctor['id']}/availability",
            headers=second_admin_headers,
            json={"availability_status": "available"},
        ).status_code == 403
        assert client.patch(
            f"/api/v1/organizations/{first_org_id}/doctors/{doctor['id']}/availability",
            headers=first_admin_headers,
            json={"availability_status": "on_break"},
        ).status_code == 422

        duplicate_registration = client.post(
            f"/api/v1/organizations/{first_org_id}/staff",
            headers=first_admin_headers,
            json=_doctor_payload(f"doctor-duplicate-{suffix}@example.com", f"reg-{suffix}"),
        )
        assert duplicate_registration.status_code == 409

        same_registration_other_org = client.post(
            f"/api/v1/organizations/{second_org_id}/staff",
            headers=second_admin_headers,
            json=_doctor_payload(second_doctor_email, f"reg-{suffix}"),
        )
        assert same_registration_other_org.status_code == 201, same_registration_other_org.text
    finally:
        with SessionLocal.begin() as db:
            db.execute(
                delete(OrganizationStaff).where(
                    OrganizationStaff.organization_id.in_([first_org_id, second_org_id])
                )
            )
            db.execute(
                delete(Organization).where(
                    Organization.id.in_([first_org_id, second_org_id])
                )
            )
            db.execute(
                delete(User).where(
                    User.email.in_(
                        [
                            first_admin_email,
                            second_admin_email,
                            first_doctor_email,
                            second_doctor_email,
                            f"doctor-duplicate-{suffix}@example.com",
                        ]
                    )
                )
            )

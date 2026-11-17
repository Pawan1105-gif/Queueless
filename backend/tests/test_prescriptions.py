import base64
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.core.security import hash_password
from app.database.session import SessionLocal
from app.main import app
from app.models import (
    Appointment,
    AuditLog,
    MedicationCatalogItem,
    Organization,
    OrganizationStaff,
    PrescriptionImage,
    PrescriptionMedication,
    Service,
    User,
)

client = TestClient(app)
TEST_PASSWORD = "QueueLess-prescription-test-1"
PNG_IMAGE = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8//8/AwMDEwMYAAAk"
    "BgMBXaJOiAAAAABJRU5ErkJggg=="
)


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _login(email: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": TEST_PASSWORD},
    )
    assert response.status_code == 200, response.text
    return _headers(response.json()["access_token"])


def test_doctor_prescriptions_are_organization_scoped_and_patient_read_only():
    suffix = uuid4().hex
    owner_email = f"prescription-owner-{suffix}@example.com"
    customer_email = f"prescription-customer-{suffix}@example.com"
    doctor_email = f"prescription-doctor-{suffix}@example.com"
    outsider_email = f"prescription-outsider-{suffix}@example.com"
    organization_id = uuid4()
    outsider_organization_id = uuid4()
    appointment_id = uuid4()
    outsider_appointment_id = uuid4()
    now = datetime.now(timezone.utc)

    with SessionLocal.begin() as db:
        owner = User(
            id=uuid4(),
            email=owner_email,
            full_name="Prescription Clinic Owner",
            password_hash=hash_password(TEST_PASSWORD),
            role="organization_admin",
        )
        customer = User(
            id=uuid4(),
            email=customer_email,
            full_name="Prescription Test Patient",
            password_hash=hash_password(TEST_PASSWORD),
            role="customer",
        )
        outsider = User(
            id=uuid4(),
            email=outsider_email,
            full_name="Unrelated Doctor",
            password_hash=hash_password(TEST_PASSWORD),
            role="doctor",
        )
        org = Organization(
            id=organization_id,
            owner_admin_id=owner.id,
            slug=f"prescription-{suffix}",
            name="Prescription Test Clinic",
            status="active",
        )
        outsider_org = Organization(
            id=outsider_organization_id,
            slug=f"other-prescription-{suffix}",
            name="Other Prescription Clinic",
            status="active",
        )
        service = Service(
            id=uuid4(),
            organization_id=organization_id,
            name="Consultation",
            duration_minutes=30,
            max_appointment_capacity=1,
        )
        outsider_service = Service(
            id=uuid4(),
            organization_id=outsider_organization_id,
            name="Other consultation",
            duration_minutes=30,
            max_appointment_capacity=1,
        )
        appointment = Appointment(
            id=appointment_id,
            reference=f"PR{suffix[:10].upper()}",
            customer_id=customer.id,
            organization_id=organization_id,
            service_id=service.id,
            starts_at=now + timedelta(days=1),
            ends_at=now + timedelta(days=1, minutes=30),
            status="confirmed",
            customer_notes="Patient describes recurring symptoms before the visit.",
        )
        outsider_appointment = Appointment(
            id=outsider_appointment_id,
            reference=f"PX{suffix[:10].upper()}",
            customer_id=customer.id,
            organization_id=outsider_organization_id,
            service_id=outsider_service.id,
            starts_at=now + timedelta(days=1),
            ends_at=now + timedelta(days=1, minutes=30),
            status="confirmed",
        )
        db.add_all([owner, customer, outsider])
        db.flush()
        db.add_all([org, outsider_org])
        db.flush()
        db.add_all([service, outsider_service])
        db.flush()
        db.add_all([appointment, outsider_appointment])
        db.flush()
        db.add(
            OrganizationStaff(
                organization_id=outsider_organization_id,
                user_id=outsider.id,
                role="doctor",
                status="active",
            )
        )

    try:
        owner_headers = _login(owner_email)
        customer_headers = _login(customer_email)
        outsider_headers = _login(outsider_email)

        created_doctor = client.post(
            f"/api/v1/organizations/{organization_id}/staff",
            headers=owner_headers,
            json={
                "email": doctor_email,
                "full_name": "Clinic Doctor",
                "password": TEST_PASSWORD,
                "role": "doctor",
                "phone": "+91 98765 43210",
                "specialization": "General medicine",
                "qualification": "MBBS",
                "registration_number": f"REG-{suffix}",
                "experience_years": 5,
                "department": "Outpatient",
                "consultation_fee": "300.00",
            },
        )
        assert created_doctor.status_code == 201, created_doctor.text
        assert created_doctor.json()["role"] == "doctor"
        doctor_headers = _login(doctor_email)

        doctor_appointments = client.get("/api/v1/appointments", headers=doctor_headers)
        assert doctor_appointments.status_code == 200, doctor_appointments.text
        assert [item["id"] for item in doctor_appointments.json()] == [str(appointment_id)]
        assert doctor_appointments.json()[0]["customer_notes"] == (
            "Patient describes recurring symptoms before the visit."
        )

        organization_appointments = client.get(
            f"/api/v1/appointments?organization_id={organization_id}",
            headers=owner_headers,
        )
        assert organization_appointments.status_code == 200
        assert organization_appointments.json()[0]["customer_notes"] == (
            "Patient describes recurring symptoms before the visit."
        )
        appointment_detail = client.get(
            f"/api/v1/appointments/{appointment_id}",
            headers=doctor_headers,
        )
        assert appointment_detail.status_code == 200
        assert appointment_detail.json()["customer_notes"] == (
            "Patient describes recurring symptoms before the visit."
        )

        catalog_create = client.post(
            f"/api/v1/organizations/{organization_id}/medication-catalog",
            headers=owner_headers,
            json={"name": "Clinic catalog medication"},
        )
        assert catalog_create.status_code == 201, catalog_create.text
        catalog_item_id = catalog_create.json()["id"]
        assert client.post(
            f"/api/v1/organizations/{organization_id}/medication-catalog",
            headers=owner_headers,
            json={"name": " clinic   catalog medication "},
        ).status_code == 409
        assert client.get(
            f"/api/v1/organizations/{organization_id}/medication-catalog",
            headers=customer_headers,
        ).status_code == 403
        assert client.post(
            f"/api/v1/organizations/{organization_id}/medication-catalog",
            headers=doctor_headers,
            json={"name": "Doctor cannot manage catalog"},
        ).status_code == 403
        catalog_search = client.get(
            f"/api/v1/organizations/{organization_id}/medication-catalog",
            headers=doctor_headers,
            params={"search": "catalog med"},
        )
        assert catalog_search.status_code == 200
        assert [item["id"] for item in catalog_search.json()] == [catalog_item_id]
        assert client.post(
            f"/api/v1/organizations/{outsider_organization_id}/medication-catalog",
            headers=outsider_headers,
            json={"name": "Unauthorized item"},
        ).status_code == 403

        image_upload = client.post(
            f"/api/v1/appointments/{appointment_id}/prescription/images",
            headers=doctor_headers,
            files={"file": ("doctor-note.png", PNG_IMAGE, "image/png")},
        )
        assert image_upload.status_code == 201, image_upload.text
        image_id = image_upload.json()["id"]
        assert image_upload.json()["content_type"] == "image/png"
        second_image_upload = client.post(
            f"/api/v1/appointments/{appointment_id}/prescription/images",
            headers=doctor_headers,
            files={"file": ("doctor-note-slide-2.png", PNG_IMAGE, "image/png")},
        )
        assert second_image_upload.status_code == 201, second_image_upload.text
        second_image_id = second_image_upload.json()["id"]
        admin_image_upload = client.post(
            f"/api/v1/appointments/{appointment_id}/prescription/images",
            headers=owner_headers,
            files={"file": ("admin-added-slide.png", PNG_IMAGE, "image/png")},
        )
        assert admin_image_upload.status_code == 201, admin_image_upload.text

        medications = [
            {
                "name": "Prescribed medicine",
                "catalog_item_id": catalog_item_id,
                "dosage": "1 tablet",
                "frequency": "Twice daily",
                "duration": "5 days",
                "instructions": "Take after meals",
            }
        ]
        update_response = client.put(
            f"/api/v1/appointments/{appointment_id}/prescription/medications",
            headers=doctor_headers,
            json={"medications": medications},
        )
        assert update_response.status_code == 200, update_response.text
        assert update_response.json()[0]["name"] == "Clinic catalog medication"
        assert update_response.json()[0]["catalog_item_id"] == catalog_item_id

        assert client.patch(
            f"/api/v1/organizations/{organization_id}/medication-catalog/{catalog_item_id}",
            headers=owner_headers,
            json={"is_active": False},
        ).status_code == 200
        assert client.put(
            f"/api/v1/appointments/{appointment_id}/prescription/medications",
            headers=doctor_headers,
            json={"medications": medications},
        ).status_code == 422
        assert client.patch(
            f"/api/v1/organizations/{organization_id}/medication-catalog/{catalog_item_id}",
            headers=owner_headers,
            json={"is_active": True},
        ).status_code == 200

        medication_update = client.put(
            f"/api/v1/appointments/{appointment_id}/prescription/medications",
            headers=doctor_headers,
            json={
                "medications": [
                    {
                        **medications[0],
                        "name": "Updated prescribed medicine",
                    }
                ]
            },
        )
        assert medication_update.status_code == 200, medication_update.text
        assert medication_update.json()[0]["name"] == "Clinic catalog medication"

        owner_update = client.put(
            f"/api/v1/appointments/{appointment_id}/prescription/medications",
            headers=owner_headers,
            json={"medications": medications},
        )
        assert owner_update.status_code == 200, owner_update.text
        assert client.get(
            f"/api/v1/appointments/{appointment_id}/prescription",
            headers=owner_headers,
        ).status_code == 200

        patient_record = client.get(
            f"/api/v1/appointments/{appointment_id}/prescription",
            headers=customer_headers,
        )
        assert patient_record.status_code == 200, patient_record.text
        assert len(patient_record.json()["images"]) == 3
        assert patient_record.json()["medications"][0]["name"] == "Clinic catalog medication"

        patient_image = client.get(
            f"/api/v1/appointments/{appointment_id}/prescription/images/{image_id}",
            headers=customer_headers,
        )
        assert patient_image.status_code == 200
        assert patient_image.content == PNG_IMAGE
        assert patient_image.headers["cache-control"] == "private, no-store"
        assert client.put(
            f"/api/v1/appointments/{appointment_id}/prescription/medications",
            headers=customer_headers,
            json={"medications": []},
        ).status_code == 403
        assert client.post(
            f"/api/v1/appointments/{appointment_id}/prescription/images",
            headers=customer_headers,
            files={"file": ("doctor-note.png", PNG_IMAGE, "image/png")},
        ).status_code == 403

        assert client.get(
            f"/api/v1/appointments/{outsider_appointment_id}/prescription",
            headers=doctor_headers,
        ).status_code == 404
        assert client.put(
            f"/api/v1/appointments/{appointment_id}/prescription/medications",
            headers=outsider_headers,
            json={"medications": medications},
        ).status_code == 403
        assert client.get(
            f"/api/v1/appointments/{outsider_appointment_id}/prescription",
            headers=owner_headers,
        ).status_code == 403
        assert client.post(
            f"/api/v1/appointments/{appointment_id}/prescription/images",
            headers=doctor_headers,
            files={"file": ("not-an-image.png", b"not an image", "image/png")},
        ).status_code == 422
        assert client.delete(
            f"/api/v1/appointments/{appointment_id}/prescription/images/{image_id}",
            headers=customer_headers,
        ).status_code == 403
        assert client.delete(
            f"/api/v1/appointments/{appointment_id}/prescription/images/{image_id}",
            headers=doctor_headers,
        ).status_code == 204
        assert client.get(
            f"/api/v1/appointments/{appointment_id}/prescription",
            headers=customer_headers,
        ).json()["images"][0]["id"] == str(second_image_id)
        assert client.delete(
            f"/api/v1/appointments/{appointment_id}/prescription/images/{second_image_id}",
            headers=doctor_headers,
        ).status_code == 204
        assert client.delete(
            f"/api/v1/appointments/{appointment_id}/prescription/images/{admin_image_upload.json()['id']}",
            headers=owner_headers,
        ).status_code == 204
        assert client.get(
            f"/api/v1/appointments/{appointment_id}/prescription",
            headers=customer_headers,
        ).json()["images"] == []
    finally:
        with SessionLocal.begin() as db:
            db.execute(
                delete(PrescriptionMedication).where(
                    PrescriptionMedication.appointment_id.in_(
                        [appointment_id, outsider_appointment_id]
                    )
                )
            )
            db.execute(
                delete(MedicationCatalogItem).where(
                    MedicationCatalogItem.organization_id.in_(
                        [organization_id, outsider_organization_id]
                    )
                )
            )
            db.execute(
                delete(PrescriptionImage).where(
                    PrescriptionImage.appointment_id.in_(
                        [appointment_id, outsider_appointment_id]
                    )
                )
            )
            db.execute(
                delete(AuditLog).where(
                    AuditLog.organization_id.in_(
                        [organization_id, outsider_organization_id]
                    )
                )
            )
            db.execute(
                delete(Appointment).where(
                    Appointment.id.in_([appointment_id, outsider_appointment_id])
                )
            )
            db.execute(
                delete(OrganizationStaff).where(
                    OrganizationStaff.organization_id.in_(
                        [organization_id, outsider_organization_id]
                    )
                )
            )
            db.execute(
                delete(Organization).where(
                    Organization.id.in_([organization_id, outsider_organization_id])
                )
            )
            db.execute(
                delete(Service).where(
                    Service.organization_id.in_(
                        [organization_id, outsider_organization_id]
                    )
                )
            )
            db.execute(
                delete(User).where(
                    User.email.in_(
                        [owner_email, customer_email, doctor_email, outsider_email]
                    )
                )
            )

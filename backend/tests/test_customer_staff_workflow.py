from datetime import datetime, time, timedelta, timezone
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.core.security import hash_password
from app.database.session import SessionLocal
from app.main import app
from app.models import (
    Appointment,
    Feedback,
    Organization,
    QueueToken,
    User,
)

client = TestClient(app)


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_customer_to_staff_queue_workflow():
    suffix = uuid4().hex
    customer_email = f"customer-{suffix}@example.com"
    staff_email = f"staff-{suffix}@example.com"
    admin_email = f"platform-{suffix}@example.com"
    customer_id = None
    organization_id = None

    try:
        customer = client.post(
            "/api/v1/auth/register",
            json={
                "email": customer_email,
                "password": "QueueLess-strong-passphrase-1",
                "full_name": "Queue Test Customer",
            },
        )
        assert customer.status_code == 201, customer.text
        customer_auth = customer.json()
        customer_id = customer_auth["user"]["id"]
        customer_headers = _headers(customer_auth["access_token"])

        organization_response = client.post(
            "/api/v1/organizations",
            headers=customer_headers,
            json={
                "name": "Queue Test Clinic",
                "slug": f"queue-test-{suffix}",
                "category": "clinic",
                "email": f"clinic-{suffix}@example.com",
            },
        )
        assert organization_response.status_code == 201, organization_response.text
        organization = organization_response.json()
        organization_id = organization["id"]
        assert organization["status"] == "pending"

        organization_login = client.post(
            "/api/v1/auth/login",
            json={
                "email": customer_email,
                "password": "QueueLess-strong-passphrase-1",
            },
        )
        assert organization_login.status_code == 200, organization_login.text
        assert organization_login.json()["user"]["role"] == "organization_admin"
        organization_headers = _headers(organization_login.json()["access_token"])
        owned_organizations = client.get(
            "/api/v1/organizations/mine",
            headers=organization_headers,
        )
        assert owned_organizations.status_code == 200, owned_organizations.text
        assert [item["id"] for item in owned_organizations.json()] == [organization_id]

        with SessionLocal() as db:
            platform_admin = User(
                email=admin_email,
                full_name="Test Super Admin",
                password_hash=hash_password("QueueLess-platform-admin-1"),
                role="super_admin",
            )
            db.add(platform_admin)
            db.commit()

        platform_login = client.post(
            "/api/v1/auth/login",
            json={"email": admin_email, "password": "QueueLess-platform-admin-1"},
        )
        assert platform_login.status_code == 200, platform_login.text
        platform_headers = _headers(platform_login.json()["access_token"])
        approval = client.patch(
            f"/api/v1/organizations/_admin/{organization_id}/status?new_status=active",
            headers=platform_headers,
        )
        assert approval.status_code == 200, approval.text

        today = datetime.now(timezone.utc).date()
        hours = [
            {
                "weekday": day,
                "opens_at": "00:00:00",
                "closes_at": "23:59:00",
                "is_closed": False,
            }
            for day in range(7)
        ]
        configured_hours = client.put(
            f"/api/v1/organizations/{organization_id}/operating-hours",
            headers=customer_headers,
            json=hours,
        )
        assert configured_hours.status_code == 200, configured_hours.text

        counter_response = client.post(
            f"/api/v1/organizations/{organization_id}/counters",
            headers=customer_headers,
            json={"name": "Test counter"},
        )
        assert counter_response.status_code == 201, counter_response.text
        counter_id = counter_response.json()["id"]

        service_response = client.post(
            f"/api/v1/organizations/{organization_id}/services",
            headers=customer_headers,
            json={
                "name": "General consultation",
                "category": "general",
                "duration_minutes": 15,
                "max_appointment_capacity": 1,
            },
        )
        assert service_response.status_code == 201, service_response.text
        service_id = service_response.json()["id"]

        unavailable_services = client.patch(
            f"/api/v1/organizations/{organization_id}/services/{service_id}",
            headers=customer_headers,
            json={
                "name": "General consultation",
                "category": "general",
                "duration_minutes": 15,
                "max_appointment_capacity": 1,
                "is_available": False,
            },
        )
        assert unavailable_services.status_code == 200, unavailable_services.text
        public_services = client.get(
            f"/api/v1/organizations/{organization_id}/services",
        )
        assert public_services.status_code == 200
        assert public_services.json() == []
        public_private_services = client.get(
            f"/api/v1/organizations/{organization_id}/services?include_unavailable=true",
        )
        assert public_private_services.status_code == 401
        admin_services = client.get(
            f"/api/v1/organizations/{organization_id}/services?include_unavailable=true",
            headers=customer_headers,
        )
        assert admin_services.status_code == 200
        assert len(admin_services.json()) == 1
        available_service = client.patch(
            f"/api/v1/organizations/{organization_id}/services/{service_id}",
            headers=customer_headers,
            json={
                "name": "General consultation",
                "category": "general",
                "duration_minutes": 15,
                "max_appointment_capacity": 1,
                "is_available": True,
            },
        )
        assert available_service.status_code == 200, available_service.text

        now = datetime.now(timezone.utc)
        slot_minute = ((now.minute // 15) + 2) * 15
        slot_hour = now.hour + slot_minute // 60
        slot_minute %= 60
        appointment_day = today
        if slot_hour >= 23:
            appointment_day += timedelta(days=1)
            slot_hour = 10
            slot_minute = 0
        starts_at = datetime.combine(
            appointment_day,
            time(slot_hour, slot_minute),
            tzinfo=timezone.utc,
        )
        availability = client.get(
            "/api/v1/appointments/availability",
            params={
                "organization_id": organization_id,
                "service_id": service_id,
                "service_date": appointment_day.isoformat(),
            },
        )
        assert availability.status_code == 200, availability.text
        assert any(slot["starts_at"] == starts_at.isoformat().replace("+00:00", "Z")
                   or slot["starts_at"].startswith(starts_at.isoformat()[:19])
                   for slot in availability.json())

        booking = client.post(
            f"/api/v1/appointments?organization_id={organization_id}",
            headers=customer_headers,
            json={"service_id": service_id, "starts_at": starts_at.isoformat()},
        )
        assert booking.status_code == 201, booking.text
        appointment = booking.json()
        assert appointment["status"] == "confirmed"
        assert appointment["token_number"].startswith("G")

        duplicate = client.post(
            f"/api/v1/appointments?organization_id={organization_id}",
            headers=customer_headers,
            json={"service_id": service_id, "starts_at": starts_at.isoformat()},
        )
        assert duplicate.status_code == 409

        qr_response = client.get(
            f"/api/v1/appointments/{appointment['id']}/qr",
            headers=customer_headers,
        )
        assert qr_response.status_code == 200, qr_response.text
        qr = qr_response.json()
        assert qr["qr_code"].startswith("data:image/png;base64,")

        staff_response = client.post(
            f"/api/v1/organizations/{organization_id}/staff",
            headers=customer_headers,
            json={
                "email": staff_email,
                "full_name": "Queue Test Staff",
                "password": "QueueLess-staff-passphrase-1",
                "counter_id": counter_id,
            },
        )
        assert staff_response.status_code == 201, staff_response.text
        staff_login = client.post(
            "/api/v1/auth/login",
            json={"email": staff_email, "password": "QueueLess-staff-passphrase-1"},
        )
        assert staff_login.status_code == 200, staff_login.text
        staff_headers = _headers(staff_login.json()["access_token"])

        pause_counter = client.patch(
            f"/api/v1/queue/organizations/{organization_id}/counters/{counter_id}/status",
            headers=staff_headers,
            json={"status": "paused"},
        )
        assert pause_counter.status_code == 200, pause_counter.text
        resume_counter = client.patch(
            f"/api/v1/queue/organizations/{organization_id}/counters/{counter_id}/status",
            headers=staff_headers,
            json={"status": "active"},
        )
        assert resume_counter.status_code == 200, resume_counter.text
        deactivate_counter = client.patch(
            f"/api/v1/queue/organizations/{organization_id}/counters/{counter_id}/status",
            headers=staff_headers,
            json={"status": "inactive"},
        )
        assert deactivate_counter.status_code == 403

        checkin = client.post(
            "/api/v1/queue/check-in",
            headers=staff_headers,
            json={"qr_token": qr["qr_token"]},
        )
        assert checkin.status_code == 200, checkin.text
        assert checkin.json()["status"] == "checked_in"
        duplicate_checkin = client.post(
            "/api/v1/queue/check-in",
            headers=staff_headers,
            json={"qr_token": qr["qr_token"]},
        )
        assert duplicate_checkin.status_code == 409

        called = client.post(
            f"/api/v1/queue/organizations/{organization_id}/counters/{counter_id}/call-next",
            headers=staff_headers,
        )
        assert called.status_code == 200, called.text
        assert called.json()["status"] == "called"

        started = client.post(
            f"/api/v1/queue/organizations/{organization_id}/tokens/{appointment['token_id']}/start",
            headers=staff_headers,
        )
        assert started.status_code == 200, started.text
        completed = client.post(
            f"/api/v1/queue/organizations/{organization_id}/tokens/{appointment['token_id']}/complete",
            headers=staff_headers,
        )
        assert completed.status_code == 200, completed.text
        assert completed.json()["status"] == "completed"

        feedback = client.post(
            f"/api/v1/appointments/{appointment['id']}/feedback",
            headers=customer_headers,
            json={"rating": 5, "comments": "Quick and clear."},
        )
        assert feedback.status_code == 201, feedback.text
        duplicate_feedback = client.post(
            f"/api/v1/appointments/{appointment['id']}/feedback",
            headers=customer_headers,
            json={"rating": 5},
        )
        assert duplicate_feedback.status_code == 409

        analytics = client.get(
            f"/api/v1/organizations/{organization_id}/analytics",
            headers=customer_headers,
        )
        assert analytics.status_code == 200, analytics.text
        assert analytics.json()["appointments"]["completed"] == 1
        assert analytics.json()["customer_satisfaction"] == 5.0
        notifications = client.get("/api/v1/notifications", headers=customer_headers)
        assert notifications.status_code == 200
        assert len(notifications.json()) >= 3

        other_customer = client.post(
            "/api/v1/auth/register",
            json={
                "email": f"other-{suffix}@example.com",
                "password": "QueueLess-other-passphrase-1",
                "full_name": "Other Customer",
            },
        )
        assert other_customer.status_code == 201
        isolated = client.get(
            f"/api/v1/queue/organizations/{organization_id}",
            headers=_headers(other_customer.json()["access_token"]),
        )
        assert isolated.status_code == 403
    finally:
        with SessionLocal() as db:
            if organization_id:
                organization_uuid = Organization.id.type.python_type(organization_id)
                db.execute(delete(QueueToken).where(QueueToken.organization_id == organization_uuid))
                db.execute(delete(Feedback).where(Feedback.organization_id == organization_uuid))
                db.execute(delete(Appointment).where(Appointment.organization_id == organization_uuid))
                db.execute(delete(Organization).where(Organization.id == organization_uuid))
            db.execute(
                delete(User).where(
                    User.email.in_(
                        [customer_email, staff_email, admin_email, f"other-{suffix}@example.com"]
                    )
                )
            )
            db.commit()

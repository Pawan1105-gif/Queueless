from datetime import time

from sqlalchemy import select

from app.database.session import SessionLocal
from app.models import Counter, OperatingHour, Organization, Service, ServiceCounter

DEMO_ORGANIZATIONS = (
    {
        "slug": "queueless-demo-family-clinic",
        "name": "QueueLess Demo Family Clinic",
        "category": "clinic",
        "description": "Sample clinic for trying QueueLess appointment booking.",
        "services": (
            ("General consultation", "Routine consultation with a care provider.", 30, 2),
            ("Follow-up visit", "Follow-up appointment for an existing care plan.", 20, 2),
        ),
    },
    {
        "slug": "queueless-demo-diagnostics",
        "name": "QueueLess Demo Diagnostics",
        "category": "laboratory",
        "description": "Sample diagnostic laboratory for trying QueueLess appointments.",
        "services": (
            ("Blood test", "Sample collection appointment.", 15, 2),
            ("Health screening", "General diagnostic screening appointment.", 30, 1),
        ),
    },
    {
        "slug": "queueless-demo-service-center",
        "name": "QueueLess Demo Service Center",
        "category": "service centre",
        "description": "Sample public service center for trying QueueLess appointments.",
        "services": (
            ("Document services", "Appointment for document-related assistance.", 20, 2),
            ("General assistance", "Appointment for general service inquiries.", 15, 2),
        ),
    },
)


def main() -> None:
    created_names: list[str] = []
    skipped_slugs: list[str] = []

    with SessionLocal.begin() as db:
        for definition in DEMO_ORGANIZATIONS:
            existing = db.scalar(
                select(Organization).where(Organization.slug == definition["slug"])
            )
            if existing is not None:
                skipped_slugs.append(definition["slug"])
                continue

            organization = Organization(
                slug=definition["slug"],
                name=definition["name"],
                category=definition["category"],
                description=definition["description"],
                address="QueueLess sample data",
                status="active",
            )
            db.add(organization)
            db.flush()

            counter = Counter(
                organization_id=organization.id,
                name="Main counter",
                status="active",
            )
            db.add(counter)
            db.flush()

            services = []
            for name, description, duration, capacity in definition["services"]:
                service = Service(
                    organization_id=organization.id,
                    name=name,
                    description=description,
                    category=definition["category"],
                    duration_minutes=duration,
                    max_appointment_capacity=capacity,
                    is_available=True,
                )
                db.add(service)
                services.append(service)

            for weekday in range(7):
                db.add(
                    OperatingHour(
                        organization_id=organization.id,
                        weekday=weekday,
                        opens_at=time(9, 0),
                        closes_at=time(17, 0),
                        is_closed=False,
                    )
                )

            db.flush()
            db.add_all(
                ServiceCounter(service_id=service.id, counter_id=counter.id)
                for service in services
            )
            created_names.append(organization.name)

    if created_names:
        print("Created demo organizations:")
        for name in created_names:
            print(f"- {name}")
    if skipped_slugs:
        print("Already present; left unchanged:")
        for slug in skipped_slugs:
            print(f"- {slug}")
    if not created_names and not skipped_slugs:
        print("No demo organizations were configured.")


if __name__ == "__main__":
    main()

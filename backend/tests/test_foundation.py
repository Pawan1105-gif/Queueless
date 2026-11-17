from fastapi.testclient import TestClient

from app.database.base import Base
from app.main import app as fastapi_app
import app.models  # noqa: F401


client = TestClient(fastapi_app)


def test_root_endpoint_is_available():
    response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {
        "message": "Welcome to QueueLess API",
        "status": "Running",
    }


def test_database_health_does_not_expose_database_identity():
    response = client.get("/health/db")

    assert response.status_code == 200
    assert response.json() == {"status": "Connected"}


def test_initial_model_metadata_contains_required_tables():
    expected_tables = {
        "users",
        "organizations",
        "organization_staff",
        "services",
        "counters",
        "service_counters",
        "operating_hours",
        "organization_holidays",
        "appointments",
        "queue_tokens",
        "notifications",
        "feedback",
        "audit_logs",
    }

    assert expected_tables <= set(Base.metadata.tables)

from urllib.parse import urlsplit

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app

client = TestClient(app)


def test_registration_preflight_allows_configured_frontend_and_loopback_alias():
    configured = settings.FRONTEND_URL
    parsed = urlsplit(configured)
    if parsed.hostname not in {"localhost", "127.0.0.1"}:
        return

    alias_host = "127.0.0.1" if parsed.hostname == "localhost" else "localhost"
    alias = f"{parsed.scheme}://{alias_host}"
    if parsed.port:
        alias += f":{parsed.port}"

    for origin in {configured, alias}:
        response = client.options(
            "/api/v1/auth/register",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin


def test_registration_preflight_rejects_untrusted_origins():
    response = client.options(
        "/api/v1/auth/register",
        headers={
            "Origin": "https://untrusted.example",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 400

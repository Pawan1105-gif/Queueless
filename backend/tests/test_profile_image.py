from io import BytesIO
from uuid import uuid4

from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import delete

from app.core.security import hash_password
from app.database.session import SessionLocal
from app.main import app
from app.models import User

client = TestClient(app)
TEST_PASSWORD = "QueueLess-profile-image-test-password"


def test_customer_can_upload_view_and_remove_private_profile_image():
    user_id = uuid4()
    email = f"profile-image-{user_id.hex}@example.com"
    with SessionLocal.begin() as db:
        db.add(
            User(
                id=user_id,
                email=email,
                full_name="Profile Image Customer",
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

        assert client.get("/api/v1/auth/me/profile-image", headers=headers).status_code == 404
        assert client.get("/api/v1/auth/me/profile-image").status_code == 401

        image = Image.new("RGB", (4, 4), color="blue")
        image_bytes = BytesIO()
        image.save(image_bytes, format="PNG")
        image_bytes.seek(0)
        uploaded = client.put(
            "/api/v1/auth/me/profile-image",
            headers=headers,
            files={"file": ("profile.png", image_bytes, "image/png")},
        )
        assert uploaded.status_code == 204, uploaded.text

        downloaded = client.get("/api/v1/auth/me/profile-image", headers=headers)
        assert downloaded.status_code == 200, downloaded.text
        assert downloaded.headers["content-type"] == "image/png"
        assert downloaded.content == image_bytes.getvalue()
        assert downloaded.headers["cache-control"] == "private, no-store"

        invalid_image = client.put(
            "/api/v1/auth/me/profile-image",
            headers=headers,
            files={"file": ("profile.png", b"not an image", "image/png")},
        )
        assert invalid_image.status_code == 422

        removed = client.delete("/api/v1/auth/me/profile-image", headers=headers)
        assert removed.status_code == 204, removed.text
        assert client.get("/api/v1/auth/me/profile-image", headers=headers).status_code == 404
    finally:
        with SessionLocal.begin() as db:
            db.execute(delete(User).where(User.id == user_id))

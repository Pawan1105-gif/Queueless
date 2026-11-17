import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import jwt
from fastapi import HTTPException, status
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError

from app.core.config import settings

password_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return password_hasher.verify(password_hash, password)
    except (VerificationError, VerifyMismatchError):
        return False


def create_access_token(subject: UUID, role: str) -> str:
    return _encode_token(
        {"sub": str(subject), "role": role, "type": "access"},
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_qr_token(appointment_id: UUID, queue_token_id: UUID) -> str:
    return _encode_token(
        {
            "sub": str(appointment_id),
            "queue_token_id": str(queue_token_id),
            "type": "queue_checkin",
        },
        timedelta(minutes=settings.QR_TOKEN_EXPIRE_MINUTES),
    )


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    secret = _get_signing_secret()
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    if payload.get("type") != expected_type:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


def qr_token_fingerprint(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_temporary_password() -> str:
    return secrets.token_urlsafe(18)


def _encode_token(claims: dict[str, Any], lifetime: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {**claims, "iat": now, "exp": now + lifetime}
    return jwt.encode(payload, _get_signing_secret(), algorithm="HS256")


def _get_signing_secret() -> str:
    secret = settings.JWT_SECRET_KEY
    if not secret or len(secret) < 32:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Authentication is not configured. Set JWT_SECRET_KEY to a random "
                "secret of at least 32 characters."
            ),
        )
    return secret

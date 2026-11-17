from collections.abc import Callable
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.database.session import get_db
from app.models import Organization, OrganizationStaff, User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
optional_oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login",
    auto_error=False,
)


def get_optional_current_user(
    token: str | None = Depends(optional_oauth2_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    if token is None:
        return None
    payload = decode_token(token, "access")
    try:
        user_id = UUID(payload["sub"])
    except (KeyError, ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive or does not exist",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    payload = decode_token(token, "access")
    try:
        user_id = UUID(payload["sub"])
    except (KeyError, ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive or does not exist",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_roles(*roles: str) -> Callable:
    def role_dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return user

    return role_dependency


def require_organization_access(
    organization_id: UUID,
    user: User,
    db: Session,
    *,
    admin_only: bool = False,
) -> Organization:
    organization = db.get(Organization, organization_id)
    if organization is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    if user.role == "super_admin":
        return organization

    membership = db.scalar(
        select(OrganizationStaff).where(
            OrganizationStaff.organization_id == organization_id,
            OrganizationStaff.user_id == user.id,
            OrganizationStaff.status == "active",
        )
    )
    is_owner = organization.owner_admin_id == user.id
    if is_owner or (membership and membership.role == "admin"):
        return organization
    if not admin_only and membership and membership.role in ("staff", "doctor"):
        return organization
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have access to this organization",
    )

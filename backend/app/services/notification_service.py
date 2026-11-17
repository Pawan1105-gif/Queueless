from uuid import UUID

from sqlalchemy.orm import Session

from app.models import Notification


def create_notification(
    db: Session,
    user_id: UUID,
    title: str,
    message: str,
    organization_id: UUID | None = None,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        organization_id=organization_id,
        title=title,
        message=message,
        channel="in_app",
    )
    db.add(notification)
    return notification

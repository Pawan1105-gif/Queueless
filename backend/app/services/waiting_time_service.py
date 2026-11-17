from datetime import date
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Counter, QueueToken, Service

ACTIVE_QUEUE_STATUSES = ("waiting", "checked_in", "called", "serving")


def estimate_wait_minutes(
    db: Session,
    organization_id: UUID,
    service_id: UUID,
    service_date: date,
    queue_position: int,
) -> int:
    service = db.get(Service, service_id)
    if service is None:
        return 0
    active_counters = db.scalar(
        select(func.count(Counter.id)).where(
            Counter.organization_id == organization_id,
            Counter.status == "active",
        )
    ) or 0
    counter_count = max(1, active_counters)
    active_tokens = db.scalar(
        select(func.count(QueueToken.id)).where(
            QueueToken.organization_id == organization_id,
            QueueToken.service_id == service_id,
            QueueToken.service_date == service_date,
            QueueToken.status.in_(ACTIVE_QUEUE_STATUSES),
        )
    ) or 0
    effective_ahead = max(0, min(queue_position - 1, active_tokens - 1))
    return round(effective_ahead * service.duration_minutes / counter_count)

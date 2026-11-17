from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import case, cast, Date, func, select
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_organization_access
from app.database.session import get_db
from app.models import Appointment, Counter, Feedback, Organization, QueueToken, Service, User

router = APIRouter(tags=["analytics"])


@router.get("/organizations/{organization_id}/analytics")
def organization_analytics(
    organization_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db, admin_only=True)
    today = datetime.now(timezone.utc).date()
    counts = db.execute(
        select(
            func.count(Appointment.id).label("total"),
            func.count(case((cast(Appointment.starts_at, Date) == today, Appointment.id))).label("today"),
            func.count(case((Appointment.status == "completed", Appointment.id))).label("completed"),
            func.count(case((Appointment.status == "cancelled", Appointment.id))).label("cancelled"),
            func.count(case((Appointment.status == "no_show", Appointment.id))).label("no_show"),
        ).where(Appointment.organization_id == organization_id)
    ).one()
    waiting = db.scalar(
        select(func.count(QueueToken.id)).where(
            QueueToken.organization_id == organization_id,
            QueueToken.service_date == today,
            QueueToken.status.in_(("waiting", "checked_in", "called", "serving")),
        )
    ) or 0
    avg_wait = db.scalar(
        select(func.avg(func.extract("epoch", QueueToken.called_at - QueueToken.checked_in_at) / 60))
        .where(
            QueueToken.organization_id == organization_id,
            QueueToken.called_at.is_not(None),
            QueueToken.checked_in_at.is_not(None),
        )
    )
    avg_duration = db.scalar(
        select(func.avg(func.extract("epoch", QueueToken.completed_at - QueueToken.started_at) / 60))
        .where(
            QueueToken.organization_id == organization_id,
            QueueToken.completed_at.is_not(None),
            QueueToken.started_at.is_not(None),
        )
    )
    daily = db.execute(
        select(
            cast(Appointment.starts_at, Date).label("day"),
            func.count(Appointment.id).label("count"),
        )
        .where(
            Appointment.organization_id == organization_id,
            Appointment.starts_at >= datetime.combine(
                today - timedelta(days=13), datetime.min.time(), timezone.utc
            ),
        )
        .group_by(cast(Appointment.starts_at, Date))
        .order_by(cast(Appointment.starts_at, Date))
    ).all()
    popularity = db.execute(
        select(Service.name, func.count(Appointment.id).label("count"))
        .join(Appointment, Appointment.service_id == Service.id)
        .where(Appointment.organization_id == organization_id)
        .group_by(Service.id, Service.name)
        .order_by(func.count(Appointment.id).desc())
        .limit(10)
    ).all()
    satisfaction = db.scalar(
        select(func.avg(Feedback.rating)).where(Feedback.organization_id == organization_id)
    )
    counters = db.execute(
        select(Counter.name, Counter.status, func.count(QueueToken.id).label("completed"))
        .outerjoin(QueueToken, QueueToken.counter_id == Counter.id)
        .where(Counter.organization_id == organization_id)
        .group_by(Counter.id, Counter.name, Counter.status)
        .order_by(Counter.name)
    ).all()
    return {
        "appointments": {
            "total": counts.total,
            "today": counts.today,
            "completed": counts.completed,
            "waiting": waiting,
            "cancelled": counts.cancelled,
            "no_show": counts.no_show,
        },
        "average_wait_minutes": round(float(avg_wait), 1) if avg_wait is not None else None,
        "average_service_minutes": round(float(avg_duration), 1) if avg_duration is not None else None,
        "customer_satisfaction": round(float(satisfaction), 2) if satisfaction is not None else None,
        "daily_trends": [{"date": row.day.isoformat(), "appointments": row.count} for row in daily],
        "service_popularity": [{"service": row.name, "appointments": row.count} for row in popularity],
        "counter_performance": [
            {"counter": row.name, "status": row.status, "completed_tokens": row.completed}
            for row in counters
        ],
    }


@router.get("/admin/analytics")
def platform_analytics(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "super_admin":
        from fastapi import HTTPException

        raise HTTPException(status_code=403, detail="Super admin access required")
    organization_counts = db.execute(
        select(
            func.count(Organization.id).label("total"),
            func.count(case((Organization.status == "active", Organization.id))).label("active"),
        )
    ).one()
    appointment_count = db.scalar(select(func.count(Appointment.id))) or 0
    queue_counts = db.execute(
        select(
            func.count(case((QueueToken.status.in_(("waiting", "checked_in")), QueueToken.id))).label("waiting"),
            func.count(case((QueueToken.status == "serving", QueueToken.id))).label("serving"),
            func.count(case((QueueToken.status == "completed", QueueToken.id))).label("completed"),
        )
    ).one()
    organizations = db.execute(
        select(
            Organization.id,
            Organization.name,
            Organization.status,
            func.count(Appointment.id).label("appointments"),
        )
        .outerjoin(Appointment, Appointment.organization_id == Organization.id)
        .group_by(Organization.id, Organization.name, Organization.status)
        .order_by(func.count(Appointment.id).desc())
    ).all()
    return {
        "customers": db.scalar(select(func.count(User.id)).where(User.role == "customer")) or 0,
        "organizations": organization_counts.total,
        "active_organizations": organization_counts.active,
        "appointments": appointment_count,
        "queue": {
            "waiting": queue_counts.waiting,
            "serving": queue_counts.serving,
            "completed": queue_counts.completed,
        },
        "organization_performance": [
            {
                "organization_id": str(row.id),
                "organization": row.name,
                "status": row.status,
                "appointments": row.appointments,
            }
            for row in organizations
        ],
    }


@router.get("/admin/organizations")
def platform_organizations(
    status_filter: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "super_admin":
        from fastapi import HTTPException

        raise HTTPException(status_code=403, detail="Super admin access required")
    query = select(Organization)
    if status_filter:
        query = query.where(Organization.status == status_filter)
    return db.scalars(query.order_by(Organization.created_at.desc())).all()


@router.get("/admin/users")
def platform_users(
    search: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "super_admin":
        from fastapi import HTTPException

        raise HTTPException(status_code=403, detail="Super admin access required")
    query = select(User)
    if search:
        term = f"%{search.strip()}%"
        query = query.where(User.email.ilike(term) | User.full_name.ilike(term))
    return db.scalars(query.order_by(User.created_at.desc()).limit(250)).all()


@router.patch("/admin/users/{user_id}/active")
def update_user_status(
    user_id: UUID,
    is_active: bool,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "super_admin":
        from fastapi import HTTPException

        raise HTTPException(status_code=403, detail="Super admin access required")
    account = db.get(User, user_id)
    if account is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="User not found")
    if account.id == user.id and not is_active:
        from fastapi import HTTPException

        raise HTTPException(status_code=409, detail="You cannot suspend your own account")
    account.is_active = is_active
    db.commit()
    return {"user_id": account.id, "is_active": account.is_active}


@router.get("/admin/audit-logs")
def platform_audit_logs(
    limit: int = 100,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from fastapi import HTTPException
    from app.models import AuditLog

    if user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin access required")
    return db.scalars(
        select(AuditLog).order_by(AuditLog.created_at.desc()).limit(min(max(limit, 1), 500))
    ).all()

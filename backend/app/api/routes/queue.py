from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_organization_access, require_roles
from app.core.security import decode_token, qr_token_fingerprint
from app.database.session import get_db
from app.models import (
    Appointment,
    AuditLog,
    Counter,
    Notification,
    Organization,
    OrganizationStaff,
    QueueToken,
    Service,
    User,
)
from app.schemas.appointment import QueueTokenRead
from app.schemas.queue import CounterStatusRequest, QRCheckInRequest
from app.services.notification_service import create_notification
from app.services.waiting_time_service import ACTIVE_QUEUE_STATUSES, estimate_wait_minutes
from app.websocket.manager import queue_connections

router = APIRouter(prefix="/queue", tags=["queue"])


@router.get("/mine", response_model=list[QueueTokenRead])
def my_queue_tokens(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tokens = db.scalars(
        select(QueueToken)
        .where(QueueToken.customer_id == user.id)
        .order_by(QueueToken.created_at.desc())
        .limit(100)
    ).all()
    return [_queue_token_read(db, item) for item in tokens]


@router.get("/organizations/{organization_id}", response_model=list[QueueTokenRead])
def organization_queue(
    organization_id: UUID,
    active_only: bool = True,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db)
    query = select(QueueToken).where(QueueToken.organization_id == organization_id)
    if user.role == "staff":
        membership = _staff_membership(db, user, organization_id)
        if membership.counter_id is None:
            raise HTTPException(status_code=403, detail="No counter is assigned to this staff account")
        query = query.where(
            (QueueToken.counter_id == membership.counter_id)
            | (QueueToken.counter_id.is_(None))
        )
    if active_only:
        query = query.where(QueueToken.status.in_(ACTIVE_QUEUE_STATUSES))
    tokens = db.scalars(
        query.order_by(QueueToken.service_date, QueueToken.queue_position).limit(500)
    ).all()
    return [_queue_token_read(db, item) for item in tokens]


@router.post("/check-in", response_model=QueueTokenRead)
async def check_in_customer(
    payload: QRCheckInRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_roles("staff", "organization_admin", "super_admin")),
    db: Session = Depends(get_db),
):
    claims = decode_token(payload.qr_token, "queue_checkin")
    try:
        appointment_id = UUID(claims["sub"])
        queue_token_id = UUID(claims["queue_token_id"])
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=401, detail="Invalid appointment QR code") from exc
    token = db.scalar(
        select(QueueToken)
        .where(
            QueueToken.id == queue_token_id,
            QueueToken.appointment_id == appointment_id,
        )
        .with_for_update()
    )
    if token is None:
        raise HTTPException(status_code=404, detail="Queue token not found")
    require_organization_access(token.organization_id, user, db)
    membership = _staff_membership(db, user, token.organization_id) if user.role == "staff" else None
    if token.status != "waiting":
        raise HTTPException(status_code=409, detail="This queue token has already been checked in or processed")
    appointment = db.get(Appointment, appointment_id)
    if appointment is None or appointment.status != "confirmed":
        raise HTTPException(status_code=409, detail="Appointment is not eligible for check-in")
    if token.service_date != datetime.now(timezone.utc).date():
        raise HTTPException(status_code=409, detail="QR check-in is only available on the appointment date")
    token.status = "checked_in"
    token.checked_in_at = datetime.now(timezone.utc)
    if membership and membership.counter_id:
        token.counter_id = membership.counter_id
    appointment.status = "checked_in"
    create_notification(
        db,
        token.customer_id,
        "Check-in complete",
        f"Your token {token.token_number} has been checked in.",
        token.organization_id,
    )
    _audit(db, user, token, "queue.checked_in")
    db.commit()
    db.refresh(token)
    background_tasks.add_task(
        queue_connections.publish,
        token.organization_id,
        {"type": "queue.checked_in", "token_id": str(token.id), "status": token.status},
    )
    return _queue_token_read(db, token)


@router.post(
    "/organizations/{organization_id}/counters/{counter_id}/call-next",
    response_model=QueueTokenRead,
)
async def call_next(
    organization_id: UUID,
    counter_id: UUID,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_roles("staff", "organization_admin", "super_admin")),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db)
    counter = _get_counter(db, organization_id, counter_id)
    _authorize_counter(db, user, organization_id, counter)
    if counter.status != "active":
        raise HTTPException(status_code=409, detail="Counter is not active")
    token = db.scalar(
        select(QueueToken)
        .where(
            QueueToken.organization_id == organization_id,
            QueueToken.service_date == datetime.now(timezone.utc).date(),
            QueueToken.status == "checked_in",
            (QueueToken.counter_id == counter_id) | (QueueToken.counter_id.is_(None)),
        )
        .order_by(QueueToken.queue_position)
        .with_for_update(skip_locked=True)
        .limit(1)
    )
    if token is None:
        raise HTTPException(status_code=404, detail="No checked-in customers are waiting")
    token.status = "called"
    token.counter_id = counter.id
    token.called_at = datetime.now(timezone.utc)
    create_notification(
        db,
        token.customer_id,
        "Your token is being called",
        f"Please proceed to {counter.name}.",
        organization_id,
    )
    _audit(db, user, token, "queue.called")
    db.commit()
    db.refresh(token)
    background_tasks.add_task(
        queue_connections.publish,
        organization_id,
        {"type": "queue.called", "token_id": str(token.id), "counter_id": str(counter.id)},
    )
    return _queue_token_read(db, token)


@router.post("/organizations/{organization_id}/tokens/{token_id}/start", response_model=QueueTokenRead)
async def start_service(
    organization_id: UUID,
    token_id: UUID,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_roles("staff", "organization_admin", "super_admin")),
    db: Session = Depends(get_db),
):
    token = _get_authorized_token(db, user, organization_id, token_id)
    if token.status != "called":
        raise HTTPException(status_code=409, detail="Only a called token can start service")
    token.status = "serving"
    token.started_at = datetime.now(timezone.utc)
    appointment = db.get(Appointment, token.appointment_id)
    if appointment:
        appointment.status = "in_service"
    _audit(db, user, token, "queue.started")
    db.commit()
    db.refresh(token)
    background_tasks.add_task(
        queue_connections.publish,
        organization_id,
        {"type": "queue.started", "token_id": str(token.id), "status": token.status},
    )
    return _queue_token_read(db, token)


@router.post("/organizations/{organization_id}/tokens/{token_id}/complete", response_model=QueueTokenRead)
async def complete_service(
    organization_id: UUID,
    token_id: UUID,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_roles("staff", "organization_admin", "super_admin")),
    db: Session = Depends(get_db),
):
    token = _get_authorized_token(db, user, organization_id, token_id)
    if token.status != "serving":
        raise HTTPException(status_code=409, detail="Only a serving token can be completed")
    token.status = "completed"
    token.completed_at = datetime.now(timezone.utc)
    appointment = db.get(Appointment, token.appointment_id)
    if appointment:
        appointment.status = "completed"
    create_notification(
        db,
        token.customer_id,
        "Appointment completed",
        f"Your appointment {appointment.reference if appointment else ''} is complete. You can now leave feedback.",
        organization_id,
    )
    _audit(db, user, token, "queue.completed")
    db.commit()
    db.refresh(token)
    background_tasks.add_task(
        queue_connections.publish,
        organization_id,
        {"type": "queue.completed", "token_id": str(token.id), "status": token.status},
    )
    return _queue_token_read(db, token)


@router.post("/organizations/{organization_id}/tokens/{token_id}/skip", response_model=QueueTokenRead)
async def skip_token(
    organization_id: UUID,
    token_id: UUID,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_roles("staff", "organization_admin", "super_admin")),
    db: Session = Depends(get_db),
):
    token = _get_authorized_token(db, user, organization_id, token_id)
    if token.status not in ("checked_in", "called"):
        raise HTTPException(status_code=409, detail="Only a checked-in or called token can be skipped")
    token.status = "skipped"
    appointment = db.get(Appointment, token.appointment_id)
    if appointment:
        appointment.status = "no_show"
    create_notification(
        db,
        token.customer_id,
        "Queue token skipped",
        f"Your token {token.token_number} was skipped. Please contact the service desk for help.",
        organization_id,
    )
    _audit(db, user, token, "queue.skipped")
    db.commit()
    db.refresh(token)
    background_tasks.add_task(
        queue_connections.publish,
        organization_id,
        {"type": "queue.skipped", "token_id": str(token.id), "status": token.status},
    )
    return _queue_token_read(db, token)


@router.post("/organizations/{organization_id}/tokens/{token_id}/no-show", response_model=QueueTokenRead)
async def mark_no_show(
    organization_id: UUID,
    token_id: UUID,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_roles("staff", "organization_admin", "super_admin")),
    db: Session = Depends(get_db),
):
    token = _get_authorized_token(db, user, organization_id, token_id)
    if token.status not in ("waiting", "checked_in", "called"):
        raise HTTPException(status_code=409, detail="This token cannot be marked no-show")
    token.status = "no_show"
    appointment = db.get(Appointment, token.appointment_id)
    if appointment:
        appointment.status = "no_show"
    _audit(db, user, token, "queue.no_show")
    db.commit()
    db.refresh(token)
    background_tasks.add_task(
        queue_connections.publish,
        organization_id,
        {"type": "queue.no_show", "token_id": str(token.id), "status": token.status},
    )
    return _queue_token_read(db, token)


@router.patch("/organizations/{organization_id}/counters/{counter_id}/status")
async def set_counter_status(
    organization_id: UUID,
    counter_id: UUID,
    payload: CounterStatusRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_roles("staff", "organization_admin", "super_admin")),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db)
    counter = _get_counter(db, organization_id, counter_id)
    _authorize_counter(db, user, organization_id, counter)
    if user.role == "staff" and (
        counter.status == "inactive" or payload.status == "inactive"
    ):
        raise HTTPException(
            status_code=403,
            detail="Only organization administrators can deactivate or reactivate a counter",
        )
    counter.status = payload.status
    db.add(
        AuditLog(
            actor_user_id=user.id,
            organization_id=organization_id,
            action="counter.status_changed",
            entity_type="counter",
            entity_id=str(counter_id),
            details={"status": payload.status},
        )
    )
    db.commit()
    background_tasks.add_task(
        queue_connections.publish,
        organization_id,
        {"type": "counter.status_changed", "counter_id": str(counter_id), "status": counter.status},
    )
    return {"counter_id": counter.id, "status": counter.status}


def _queue_token_read(db: Session, token: QueueToken) -> QueueTokenRead:
    appointment = db.get(Appointment, token.appointment_id)
    organization = db.get(Organization, token.organization_id)
    service = db.get(Service, token.service_id)
    counter = db.get(Counter, token.counter_id) if token.counter_id else None
    ahead = db.query(QueueToken).filter(
        QueueToken.organization_id == token.organization_id,
        QueueToken.service_id == token.service_id,
        QueueToken.service_date == token.service_date,
        QueueToken.queue_position < token.queue_position,
        QueueToken.status.in_(ACTIVE_QUEUE_STATUSES),
    ).count()
    return QueueTokenRead(
        id=token.id,
        appointment_id=token.appointment_id,
        reference=appointment.reference if appointment else "",
        organization_id=token.organization_id,
        organization_name=organization.name if organization else "",
        service_id=token.service_id,
        service_name=service.name if service else "",
        service_date=token.service_date,
        token_number=token.token_number,
        queue_position=token.queue_position,
        status=token.status,
        counter_id=token.counter_id,
        counter_name=counter.name if counter else None,
        customers_ahead=ahead,
        estimated_wait_minutes=estimate_wait_minutes(
            db,
            token.organization_id,
            token.service_id,
            token.service_date,
            token.queue_position,
        ),
    )


def _staff_membership(db: Session, user: User, organization_id: UUID) -> OrganizationStaff:
    membership = db.scalar(
        select(OrganizationStaff).where(
            OrganizationStaff.user_id == user.id,
            OrganizationStaff.organization_id == organization_id,
            OrganizationStaff.status == "active",
        )
    )
    if membership is None:
        raise HTTPException(status_code=403, detail="No active organization membership")
    return membership


def _get_counter(db: Session, organization_id: UUID, counter_id: UUID) -> Counter:
    counter = db.scalar(
        select(Counter).where(
            Counter.id == counter_id,
            Counter.organization_id == organization_id,
        )
    )
    if counter is None:
        raise HTTPException(status_code=404, detail="Counter not found")
    return counter


def _authorize_counter(
    db: Session, user: User, organization_id: UUID, counter: Counter
) -> None:
    if user.role == "staff":
        membership = _staff_membership(db, user, organization_id)
        if membership.counter_id != counter.id:
            raise HTTPException(status_code=403, detail="This counter is not assigned to you")


def _get_authorized_token(
    db: Session, user: User, organization_id: UUID, token_id: UUID
) -> QueueToken:
    require_organization_access(organization_id, user, db)
    token = db.scalar(
        select(QueueToken).where(
            QueueToken.id == token_id,
            QueueToken.organization_id == organization_id,
        )
    )
    if token is None:
        raise HTTPException(status_code=404, detail="Queue token not found")
    if user.role == "staff":
        membership = _staff_membership(db, user, organization_id)
        if membership.counter_id is None or token.counter_id != membership.counter_id:
            raise HTTPException(status_code=403, detail="This token is not assigned to your counter")
    return token


def _audit(db: Session, user: User, token: QueueToken, action: str) -> None:
    db.add(
        AuditLog(
            actor_user_id=user.id,
            organization_id=token.organization_id,
            action=action,
            entity_type="queue_token",
            entity_id=str(token.id),
            details={"status": token.status, "token_number": token.token_number},
        )
    )

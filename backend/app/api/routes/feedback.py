from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_organization_access, require_roles
from app.database.session import get_db
from app.models import Appointment, Feedback, User
from app.schemas.feedback import FeedbackCreate, FeedbackRead

router = APIRouter(tags=["feedback"])


@router.post(
    "/appointments/{appointment_id}/feedback",
    response_model=FeedbackRead,
    status_code=status.HTTP_201_CREATED,
)
def submit_feedback(
    appointment_id: UUID,
    payload: FeedbackCreate,
    user: User = Depends(require_roles("customer", "organization_admin", "staff")),
    db: Session = Depends(get_db),
):
    appointment = db.get(Appointment, appointment_id)
    if appointment is None or appointment.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if appointment.status != "completed":
        raise HTTPException(status_code=409, detail="Feedback is available after appointment completion")
    feedback = Feedback(
        appointment_id=appointment.id,
        customer_id=user.id,
        organization_id=appointment.organization_id,
        **payload.model_dump(),
    )
    db.add(feedback)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Feedback has already been submitted") from exc
    db.refresh(feedback)
    return feedback


@router.get("/organizations/{organization_id}/feedback", response_model=list[FeedbackRead])
def list_organization_feedback(
    organization_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db, admin_only=True)
    return db.scalars(
        select(Feedback)
        .where(Feedback.organization_id == organization_id)
        .order_by(Feedback.created_at.desc())
        .limit(250)
    ).all()

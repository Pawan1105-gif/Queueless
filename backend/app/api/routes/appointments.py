import base64
import io
import secrets
from datetime import date, datetime, timedelta, timezone
from pathlib import PurePath
from uuid import UUID

import qrcode
from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from PIL import Image, UnidentifiedImageError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.dependencies import (
    get_current_user,
    require_organization_access,
    require_roles,
)
from app.core.config import settings
from app.core.security import create_qr_token
from app.database.session import get_db
from app.models import (
    Appointment,
    AuditLog,
    MedicationCatalogItem,
    OperatingHour,
    Organization,
    OrganizationHoliday,
    OrganizationStaff,
    PrescriptionImage,
    PrescriptionMedication,
    QueueToken,
    Service,
    User,
)
from app.schemas.appointment import (
    AppointmentCreate,
    AppointmentDetail,
    AppointmentManage,
    AppointmentRead,
    SlotRead,
)
from app.schemas.prescription import (
    PrescriptionImageRead,
    PrescriptionMedicationList,
    PrescriptionMedicationRead,
    PrescriptionRead,
)
from app.services.notification_service import create_notification
from app.services.waiting_time_service import estimate_wait_minutes

router = APIRouter(prefix="/appointments", tags=["appointments"])
MAX_PRESCRIPTION_IMAGE_BYTES = 5 * 1024 * 1024
MAX_PRESCRIPTION_IMAGES = 10
PRESCRIPTION_IMAGE_TYPES = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}


@router.get("/availability", response_model=list[SlotRead])
def get_availability(
    organization_id: UUID,
    service_id: UUID,
    service_date: date,
    db: Session = Depends(get_db),
):
    organization = db.get(Organization, organization_id)
    service = db.get(Service, service_id)
    if (
        organization is None
        or organization.status != "active"
        or service is None
        or service.organization_id != organization_id
        or not service.is_available
    ):
        raise HTTPException(status_code=404, detail="Available service not found")
    now = datetime.now(timezone.utc)
    if service_date < now.date() or service_date > (now.date() + timedelta(days=90)):
        return []
    if db.scalar(
        select(OrganizationHoliday.id).where(
            OrganizationHoliday.organization_id == organization_id,
            OrganizationHoliday.holiday_date == service_date,
        )
    ):
        return []
    hours = db.scalar(
        select(OperatingHour).where(
            OperatingHour.organization_id == organization_id,
            OperatingHour.weekday == service_date.weekday(),
        )
    )
    if hours is None or hours.is_closed or hours.opens_at is None or hours.closes_at is None:
        return []
    cursor = datetime.combine(service_date, hours.opens_at, tzinfo=timezone.utc)
    closing = datetime.combine(service_date, hours.closes_at, tzinfo=timezone.utc)
    duration = timedelta(minutes=service.duration_minutes)
    occupied_slots = dict(
        db.execute(
            select(Appointment.starts_at, func.count(Appointment.id))
            .where(
                Appointment.organization_id == organization_id,
                Appointment.service_id == service_id,
                func.date(Appointment.starts_at) == service_date,
                Appointment.status.not_in(("cancelled", "rejected")),
            )
            .group_by(Appointment.starts_at)
        ).all()
    )
    slots = []
    while cursor + duration <= closing:
        existing_count = occupied_slots.get(cursor, 0)
        if cursor > now and existing_count < service.max_appointment_capacity:
            slots.append(
                SlotRead(
                    starts_at=cursor,
                    ends_at=cursor + duration,
                    available_capacity=service.max_appointment_capacity - existing_count,
                )
            )
        cursor += duration
    return slots


@router.post("", response_model=AppointmentDetail, status_code=status.HTTP_201_CREATED)
def create_appointment(
    payload: AppointmentCreate,
    organization_id: UUID,
    user: User = Depends(require_roles("customer", "organization_admin", "staff")),
    db: Session = Depends(get_db),
):
    if payload.starts_at.tzinfo is None or payload.starts_at.utcoffset() is None:
        raise HTTPException(status_code=422, detail="Appointment time must include a timezone")
    starts_at = payload.starts_at.astimezone(timezone.utc)
    service = db.scalar(
        select(Service)
        .where(
            Service.id == payload.service_id,
            Service.organization_id == organization_id,
            Service.is_available.is_(True),
        )
        .with_for_update()
    )
    organization = db.get(Organization, organization_id)
    if service is None or organization is None or organization.status != "active":
        raise HTTPException(status_code=404, detail="Available organization service not found")
    day = starts_at.date()
    if day < datetime.now(timezone.utc).date() or day > date.today() + timedelta(days=90):
        raise HTTPException(status_code=422, detail="Appointments must be within the next 90 days")
    if db.scalar(
        select(OrganizationHoliday.id).where(
            OrganizationHoliday.organization_id == organization_id,
            OrganizationHoliday.holiday_date == day,
        )
    ):
        raise HTTPException(status_code=409, detail="The organization is closed on this date")
    hours = db.scalar(
        select(OperatingHour).where(
            OperatingHour.organization_id == organization_id,
            OperatingHour.weekday == day.weekday(),
        )
    )
    if (
        hours is None
        or hours.is_closed
        or hours.opens_at is None
        or hours.closes_at is None
    ):
        raise HTTPException(status_code=409, detail="The organization has no opening hours for this date")
    starts_time = starts_at.timetz().replace(tzinfo=None)
    ends_at = starts_at + timedelta(minutes=service.duration_minutes)
    if starts_time < hours.opens_at or ends_at.time() > hours.closes_at:
        raise HTTPException(status_code=422, detail="Selected time is outside operating hours")
    if starts_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=422, detail="Appointment time must be in the future")

    occupied = db.scalar(
        select(func.count(Appointment.id)).where(
            Appointment.organization_id == organization_id,
            Appointment.service_id == service.id,
            Appointment.starts_at == starts_at,
            Appointment.status.not_in(("cancelled", "rejected")),
        )
    ) or 0
    if occupied >= service.max_appointment_capacity:
        raise HTTPException(status_code=409, detail="This appointment slot is no longer available")

    appointment = Appointment(
        reference=f"QL{secrets.token_hex(5).upper()}",
        customer_id=user.id,
        organization_id=organization.id,
        service_id=service.id,
        starts_at=starts_at,
        ends_at=ends_at,
        status="confirmed",
        customer_notes=payload.customer_notes,
    )
    db.add(appointment)
    db.flush()
    position = (
        db.scalar(
            select(func.max(QueueToken.queue_position)).where(
                QueueToken.organization_id == organization_id,
                QueueToken.service_id == service.id,
                QueueToken.service_date == day,
            )
        )
        or 0
    ) + 1
    prefix_source = service.category or service.name
    prefix = next((char.upper() for char in prefix_source if char.isalpha()), "Q")
    queue_token = QueueToken(
        appointment_id=appointment.id,
        customer_id=user.id,
        organization_id=organization_id,
        service_id=service.id,
        service_date=day,
        token_number=f"{prefix}{position:03d}",
        queue_position=position,
        status="waiting",
    )
    db.add(queue_token)
    create_notification(
        db,
        user.id,
        "Appointment confirmed",
        f"Your appointment {appointment.reference} at {organization.name} is confirmed.",
        organization.id,
    )
    db.commit()
    db.refresh(appointment)
    return _appointment_detail(db, appointment)


@router.get("", response_model=list[AppointmentDetail])
def list_appointments(
    organization_id: UUID | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = select(Appointment)
    if user.role == "customer":
        query = query.where(Appointment.customer_id == user.id)
    elif organization_id is not None:
        require_organization_access(organization_id, user, db)
        query = query.where(Appointment.organization_id == organization_id)
    elif user.role != "super_admin":
        memberships = select(OrganizationStaff.organization_id).where(
            OrganizationStaff.user_id == user.id,
            OrganizationStaff.status == "active",
        )
        query = query.where(Appointment.organization_id.in_(memberships))
    if status_filter:
        query = query.where(Appointment.status == status_filter)
    appointments = db.scalars(query.order_by(Appointment.starts_at.desc()).limit(250)).all()
    return [_appointment_detail(db, item) for item in appointments]


@router.get("/{appointment_id}", response_model=AppointmentDetail)
def get_appointment(
    appointment_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    appointment = db.get(Appointment, appointment_id)
    if appointment is None:
        raise HTTPException(status_code=404, detail="Appointment not found")
    _authorize_appointment(appointment, user, db)
    return _appointment_detail(db, appointment)


@router.get("/{appointment_id}/prescription", response_model=PrescriptionRead)
def get_prescription(
    appointment_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    appointment = _get_prescription_appointment(appointment_id, user, db)
    images = db.scalars(
        select(PrescriptionImage)
        .where(PrescriptionImage.appointment_id == appointment.id)
        .order_by(PrescriptionImage.created_at, PrescriptionImage.id)
    ).all()
    medications = db.scalars(
        select(PrescriptionMedication)
        .where(PrescriptionMedication.appointment_id == appointment.id)
        .order_by(PrescriptionMedication.position, PrescriptionMedication.created_at)
    ).all()
    return PrescriptionRead(
        images=images,
        medications=medications,
    )


@router.get("/{appointment_id}/prescription/images/{image_id}")
def get_prescription_image(
    appointment_id: UUID,
    image_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    appointment = _get_prescription_appointment(appointment_id, user, db)
    image = db.scalar(
        select(PrescriptionImage).where(
            PrescriptionImage.id == image_id,
            PrescriptionImage.appointment_id == appointment.id,
        )
    )
    if image is None:
        raise HTTPException(status_code=404, detail="Prescription image not found")
    extension = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[
        image.content_type
    ]
    return Response(
        content=image.image_data,
        media_type=image.content_type,
        headers={
            "Cache-Control": "private, no-store",
            "Content-Disposition": f'inline; filename="prescription-{image.id}.{extension}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post(
    "/{appointment_id}/prescription/images",
    response_model=PrescriptionImageRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_prescription_image(
    appointment_id: UUID,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    appointment = _get_prescription_appointment(appointment_id, user, db, write=True)
    image_count = db.scalar(
        select(func.count(PrescriptionImage.id)).where(
            PrescriptionImage.appointment_id == appointment.id
        )
    ) or 0
    if image_count >= MAX_PRESCRIPTION_IMAGES:
        raise HTTPException(status_code=409, detail="This appointment already has the maximum number of prescription images")
    image_data = await file.read(MAX_PRESCRIPTION_IMAGE_BYTES + 1)
    if len(image_data) > MAX_PRESCRIPTION_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Prescription images must be 5 MB or smaller")
    try:
        with Image.open(io.BytesIO(image_data)) as image:
            image_format = image.format
            width, height = image.size
            if width * height > 25_000_000:
                raise HTTPException(status_code=422, detail="Prescription image dimensions are too large")
            image.verify()
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError) as exc:
        raise HTTPException(status_code=422, detail="Upload a valid JPEG, PNG, or WebP image") from exc
    content_type = PRESCRIPTION_IMAGE_TYPES.get(image_format or "")
    if content_type is None:
        raise HTTPException(status_code=422, detail="Upload a valid JPEG, PNG, or WebP image")

    image_record = PrescriptionImage(
        appointment_id=appointment.id,
        uploaded_by_id=user.id,
        file_name=PurePath(file.filename or "prescription-image").name[:255],
        content_type=content_type,
        image_data=image_data,
    )
    db.add(image_record)
    db.flush()
    db.add(
        AuditLog(
            actor_user_id=user.id,
            organization_id=appointment.organization_id,
            action="prescription_image_uploaded",
            entity_type="prescription_image",
            entity_id=str(image_record.id),
            details={"appointment_id": str(appointment.id)},
        )
    )
    db.commit()
    db.refresh(image_record)
    return image_record


@router.delete(
    "/{appointment_id}/prescription/images/{image_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_prescription_image(
    appointment_id: UUID,
    image_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    appointment = _get_prescription_appointment(appointment_id, user, db, write=True)
    image = db.scalar(
        select(PrescriptionImage).where(
            PrescriptionImage.id == image_id,
            PrescriptionImage.appointment_id == appointment.id,
        )
    )
    if image is None:
        raise HTTPException(status_code=404, detail="Prescription image not found")
    db.add(
        AuditLog(
            actor_user_id=user.id,
            organization_id=appointment.organization_id,
            action="prescription_image_deleted",
            entity_type="prescription_image",
            entity_id=str(image.id),
            details={"appointment_id": str(appointment.id)},
        )
    )
    db.delete(image)
    db.commit()


@router.put(
    "/{appointment_id}/prescription/medications",
    response_model=list[PrescriptionMedicationRead],
)
def replace_prescription_medications(
    appointment_id: UUID,
    payload: PrescriptionMedicationList,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    appointment = _get_prescription_appointment(appointment_id, user, db, write=True)
    if any(item.catalog_item_id is None for item in payload.medications):
        raise HTTPException(
            status_code=422,
            detail="Select each medication from your organization's active medication catalog",
        )
    catalog_ids = {item.catalog_item_id for item in payload.medications}
    catalog_items = db.scalars(
        select(MedicationCatalogItem).where(
            MedicationCatalogItem.id.in_(catalog_ids),
            MedicationCatalogItem.organization_id == appointment.organization_id,
            MedicationCatalogItem.is_active.is_(True),
        )
    ).all() if catalog_ids else []
    catalog_by_id = {item.id: item for item in catalog_items}
    if set(catalog_by_id) != catalog_ids:
        raise HTTPException(
            status_code=422,
            detail="One or more selected medications are not in this organization's active catalog",
        )
    db.query(PrescriptionMedication).filter(
        PrescriptionMedication.appointment_id == appointment.id
    ).delete(synchronize_session=False)
    medications = [
        PrescriptionMedication(
            appointment_id=appointment.id,
            prescribed_by_id=user.id,
            position=position,
            **{
                **item.model_dump(),
                "name": catalog_by_id[item.catalog_item_id].name,
            },
        )
        for position, item in enumerate(payload.medications)
    ]
    db.add_all(medications)
    db.add(
        AuditLog(
            actor_user_id=user.id,
            organization_id=appointment.organization_id,
            action="prescription_medications_updated",
            entity_type="appointment",
            entity_id=str(appointment.id),
            details={"medication_count": len(medications)},
        )
    )
    db.commit()
    for medication in medications:
        db.refresh(medication)
    return medications


@router.get("/{appointment_id}/qr")
def get_appointment_qr(
    appointment_id: UUID,
    user: User = Depends(require_roles("customer", "organization_admin", "staff")),
    db: Session = Depends(get_db),
):
    appointment = db.get(Appointment, appointment_id)
    if appointment is None or appointment.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if appointment.status not in ("confirmed", "checked_in"):
        raise HTTPException(status_code=409, detail="This appointment is not eligible for check-in")
    queue_token = db.scalar(
        select(QueueToken).where(QueueToken.appointment_id == appointment.id)
    )
    if queue_token is None or queue_token.status in ("cancelled", "completed", "no_show"):
        raise HTTPException(status_code=409, detail="This queue token is not eligible for check-in")
    payload = create_qr_token(appointment.id, queue_token.id)
    image = qrcode.make(payload)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return {
        "qr_code": f"data:image/png;base64,{encoded}",
        "qr_token": payload,
        "expires_in_minutes": settings.QR_TOKEN_EXPIRE_MINUTES,
    }


@router.post("/{appointment_id}/cancel", response_model=AppointmentRead)
def cancel_appointment(
    appointment_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    appointment = db.get(Appointment, appointment_id)
    if appointment is None:
        raise HTTPException(status_code=404, detail="Appointment not found")
    _authorize_appointment(appointment, user, db)
    if appointment.status not in ("pending", "confirmed"):
        raise HTTPException(status_code=409, detail="This appointment can no longer be cancelled")
    if appointment.starts_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=409, detail="Past appointments cannot be cancelled")
    appointment.status = "cancelled"
    queue_token = db.scalar(
        select(QueueToken).where(QueueToken.appointment_id == appointment.id)
    )
    if queue_token:
        queue_token.status = "cancelled"
    create_notification(
        db,
        appointment.customer_id,
        "Appointment cancelled",
        f"Appointment {appointment.reference} has been cancelled.",
        appointment.organization_id,
    )
    db.commit()
    db.refresh(appointment)
    return appointment


@router.patch("/{appointment_id}/status", response_model=AppointmentRead)
def update_appointment_status(
    appointment_id: UUID,
    payload: AppointmentManage,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    appointment = db.get(Appointment, appointment_id)
    if appointment is None:
        raise HTTPException(status_code=404, detail="Appointment not found")
    require_organization_access(appointment.organization_id, user, db, admin_only=True)
    if appointment.status not in ("pending", "confirmed"):
        raise HTTPException(status_code=409, detail="Appointment can no longer be modified")
    appointment.status = payload.status
    if payload.status in ("rejected", "cancelled"):
        queue_token = db.scalar(
            select(QueueToken).where(QueueToken.appointment_id == appointment.id)
        )
        if queue_token:
            queue_token.status = "cancelled"
    create_notification(
        db,
        appointment.customer_id,
        f"Appointment {payload.status}",
        f"Your appointment {appointment.reference} was {payload.status}.",
        appointment.organization_id,
    )
    db.commit()
    db.refresh(appointment)
    return appointment


def _authorize_appointment(appointment: Appointment, user: User, db: Session) -> None:
    if appointment.customer_id == user.id:
        return
    if user.role in ("organization_admin", "staff", "doctor", "super_admin"):
        require_organization_access(appointment.organization_id, user, db)
        return
    raise HTTPException(status_code=404, detail="Appointment not found")


def _get_prescription_appointment(
    appointment_id: UUID,
    user: User,
    db: Session,
    *,
    write: bool = False,
) -> Appointment:
    query = select(Appointment).where(Appointment.id == appointment_id)
    if write:
        query = query.with_for_update()
    appointment = db.scalar(query)
    if appointment is None:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if not write and user.role == "customer" and appointment.customer_id == user.id:
        return appointment
    if user.role == "organization_admin":
        require_organization_access(
            appointment.organization_id,
            user,
            db,
            admin_only=True,
        )
        return appointment
    if user.role != "doctor":
        if write:
            raise HTTPException(status_code=403, detail="Only organization administrators and assigned doctors can update prescriptions")
        raise HTTPException(status_code=404, detail="Appointment not found")
    membership = db.scalar(
        select(OrganizationStaff.id).where(
            OrganizationStaff.organization_id == appointment.organization_id,
            OrganizationStaff.user_id == user.id,
            OrganizationStaff.role == "doctor",
            OrganizationStaff.status == "active",
        )
    )
    if membership is None:
        if write:
            raise HTTPException(status_code=403, detail="You do not have doctor access to this appointment")
        raise HTTPException(status_code=404, detail="Appointment not found")
    return appointment


def _appointment_detail(db: Session, appointment: Appointment) -> AppointmentDetail:
    organization = db.get(Organization, appointment.organization_id)
    service = db.get(Service, appointment.service_id)
    queue_token = db.scalar(
        select(QueueToken).where(QueueToken.appointment_id == appointment.id)
    )
    return AppointmentDetail(
        **AppointmentRead.model_validate(appointment).model_dump(),
        organization_name=organization.name if organization else "Organization",
        service_name=service.name if service else "Service",
        token_id=queue_token.id if queue_token else None,
        token_number=queue_token.token_number if queue_token else None,
        queue_status=queue_token.status if queue_token else None,
        estimated_wait_minutes=(
            estimate_wait_minutes(
                db,
                appointment.organization_id,
                appointment.service_id,
                queue_token.service_date,
                queue_token.queue_position,
            )
            if queue_token
            else None
        ),
    )

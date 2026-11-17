from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import (
    get_current_user,
    get_optional_current_user,
    require_organization_access,
    require_roles,
)
from app.core.security import hash_password
from app.database.session import get_db
from app.models import (
    AuditLog,
    Counter,
    MedicationCatalogItem,
    OperatingHour,
    Organization,
    OrganizationHoliday,
    OrganizationMedicationStock,
    OrganizationStaff,
    MedicationDirectoryItem,
    Service,
    ServiceCounter,
    User,
)
from app.schemas.organization import (
    CounterInput,
    CounterRead,
    DoctorAvailabilityUpdate,
    HolidayInput,
    OperatingHourInput,
    OrganizationCreate,
    OrganizationRead,
    OrganizationUpdate,
    ServiceInput,
    ServiceRead,
    StaffInput,
    StaffRead,
    StaffUpdate,
)
from app.schemas.medication import (
    MedicationCatalogCreate,
    MedicationCatalogRead,
    MedicationCatalogUpdate,
)
from app.schemas.medication_directory import MedicationDirectoryCreate, MedicationDirectoryRead
from app.schemas.medication_stock import MedicationStockCreate, MedicationStockRead, MedicationStockUpdate

router = APIRouter(prefix="/organizations", tags=["organizations"])


def _medication_stock_read(stock: OrganizationMedicationStock, name: str) -> MedicationStockRead:
    return MedicationStockRead(
        id=stock.id,
        organization_id=stock.organization_id,
        medication_id=stock.medication_id,
        medication_name=name,
        quantity=stock.quantity,
        updated_at=stock.updated_at,
    )


def _staff_read(membership: OrganizationStaff, staff_user: User) -> StaffRead:
    return StaffRead(
        id=membership.id,
        user_id=staff_user.id,
        organization_id=membership.organization_id,
        email=staff_user.email,
        full_name=staff_user.full_name,
        phone=staff_user.phone,
        role=membership.role,
        status=membership.status,
        counter_id=membership.counter_id,
        availability_status=membership.availability_status,
        specialization=membership.specialization,
        qualification=membership.qualification,
        registration_number=membership.registration_number,
        experience_years=membership.experience_years,
        department=membership.department,
        consultation_fee=membership.consultation_fee,
    )


@router.get(
    "/{organization_id}/medication-stock",
    response_model=list[MedicationStockRead],
)
def list_organization_medication_stock(
    organization_id: UUID,
    user: User = Depends(require_roles("organization_admin")),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db, admin_only=True)
    rows = db.execute(
        select(OrganizationMedicationStock, MedicationDirectoryItem.name)
        .join(MedicationDirectoryItem, MedicationDirectoryItem.id == OrganizationMedicationStock.medication_id)
        .where(OrganizationMedicationStock.organization_id == organization_id)
        .order_by(MedicationDirectoryItem.name)
    ).all()
    return [_medication_stock_read(stock, name) for stock, name in rows]


@router.get(
    "/{organization_id}/medication-stock/catalog",
    response_model=list[MedicationDirectoryRead],
)
def list_shared_medication_directory(
    organization_id: UUID,
    user: User = Depends(require_roles("organization_admin")),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db, admin_only=True)
    return db.scalars(
        select(MedicationDirectoryItem)
        .where(MedicationDirectoryItem.is_active.is_(True))
        .order_by(MedicationDirectoryItem.name)
    ).all()


@router.post(
    "/{organization_id}/medication-stock/catalog",
    response_model=MedicationDirectoryRead,
    status_code=status.HTTP_201_CREATED,
)
def add_shared_medication_directory_item(
    organization_id: UUID,
    payload: MedicationDirectoryCreate,
    user: User = Depends(require_roles("organization_admin")),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db, admin_only=True)
    if db.scalar(
        select(MedicationDirectoryItem.id).where(
            func.lower(MedicationDirectoryItem.name) == payload.name.lower()
        )
    ):
        raise HTTPException(status_code=409, detail="This medication name is already in the shared directory")
    item = MedicationDirectoryItem(name=payload.name)
    db.add(item)
    try:
        db.flush()
        db.add(
            AuditLog(
                actor_user_id=user.id,
                organization_id=organization_id,
                action="shared_medication_directory_item_created",
                entity_type="medication_directory_item",
                entity_id=str(item.id),
                details={"name": item.name},
            )
        )
        db.commit()
        db.refresh(item)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="This medication name is already in the shared directory") from exc
    return item


@router.post(
    "/{organization_id}/medication-stock",
    response_model=MedicationStockRead,
    status_code=status.HTTP_201_CREATED,
)
def add_organization_medication_stock(
    organization_id: UUID,
    payload: MedicationStockCreate,
    user: User = Depends(require_roles("organization_admin")),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db, admin_only=True)
    medication = db.get(MedicationDirectoryItem, payload.medication_id)
    if medication is None or not medication.is_active:
        raise HTTPException(status_code=404, detail="Medication is not available in the shared catalog")
    existing = db.scalar(
        select(OrganizationMedicationStock).where(
            OrganizationMedicationStock.organization_id == organization_id,
            OrganizationMedicationStock.medication_id == payload.medication_id,
        )
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="This medication is already listed; update its stock instead")
    stock = OrganizationMedicationStock(
        organization_id=organization_id,
        medication_id=payload.medication_id,
        quantity=payload.quantity,
    )
    db.add(stock)
    try:
        db.flush()
        db.add(
            AuditLog(
                actor_user_id=user.id,
                organization_id=organization_id,
                action="medication_stock_added",
                entity_type="medication_stock",
                entity_id=str(stock.id),
                details={"medication": medication.name, "quantity": stock.quantity},
            )
        )
        db.commit()
        db.refresh(stock)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="This medication is already listed; update its stock instead") from exc
    return _medication_stock_read(stock, medication.name)


@router.patch(
    "/{organization_id}/medication-stock/{stock_id}",
    response_model=MedicationStockRead,
)
def update_organization_medication_stock(
    organization_id: UUID,
    stock_id: UUID,
    payload: MedicationStockUpdate,
    user: User = Depends(require_roles("organization_admin")),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db, admin_only=True)
    row = db.execute(
        select(OrganizationMedicationStock, MedicationDirectoryItem.name)
        .join(MedicationDirectoryItem, MedicationDirectoryItem.id == OrganizationMedicationStock.medication_id)
        .where(
            OrganizationMedicationStock.id == stock_id,
            OrganizationMedicationStock.organization_id == organization_id,
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Medication stock entry not found")
    stock, name = row
    stock.quantity = payload.quantity
    db.add(
        AuditLog(
            actor_user_id=user.id,
            organization_id=organization_id,
            action="medication_stock_updated",
            entity_type="medication_stock",
            entity_id=str(stock.id),
            details={"medication": name, "quantity": stock.quantity},
        )
    )
    db.commit()
    db.refresh(stock)
    return _medication_stock_read(stock, name)


@router.delete(
    "/{organization_id}/medication-stock/{stock_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_organization_medication_stock(
    organization_id: UUID,
    stock_id: UUID,
    user: User = Depends(require_roles("organization_admin")),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db, admin_only=True)
    stock = db.scalar(
        select(OrganizationMedicationStock).where(
            OrganizationMedicationStock.id == stock_id,
            OrganizationMedicationStock.organization_id == organization_id,
        )
    )
    if stock is None:
        raise HTTPException(status_code=404, detail="Medication stock entry not found")
    db.add(
        AuditLog(
            actor_user_id=user.id,
            organization_id=organization_id,
            action="medication_stock_removed",
            entity_type="medication_stock",
            entity_id=str(stock.id),
        )
    )
    db.delete(stock)
    db.commit()


@router.get("", response_model=list[OrganizationRead])
def list_organizations(
    search: str | None = Query(default=None, max_length=100),
    category: str | None = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
):
    query = select(Organization).where(Organization.status == "active")
    if search:
        term = f"%{search.strip()}%"
        query = query.where(
            or_(Organization.name.ilike(term), Organization.description.ilike(term))
        )
    if category:
        query = query.where(Organization.category.ilike(category.strip()))
    return db.scalars(query.order_by(Organization.name)).all()


@router.post("", response_model=OrganizationRead, status_code=status.HTTP_201_CREATED)
def create_organization(
    payload: OrganizationCreate,
    user: User = Depends(require_roles("customer", "organization_admin")),
    db: Session = Depends(get_db),
):
    if user.role == "customer":
        user.role = "organization_admin"
    organization_data = payload.model_dump()
    organization_data["email"] = str(payload.email).lower() if payload.email else None
    organization = Organization(
        **organization_data,
        owner_admin_id=user.id,
        status="pending",
    )
    db.add(organization)
    try:
        db.flush()
        db.add(
            OrganizationStaff(
                organization_id=organization.id,
                user_id=user.id,
                role="admin",
                status="active",
            )
        )
        db.commit()
        db.refresh(organization)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="This organization identifier is already in use") from exc
    return organization


@router.get("/mine", response_model=list[OrganizationRead])
def my_organizations(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role == "super_admin":
        return db.scalars(select(Organization).order_by(Organization.name)).all()
    query = (
        select(Organization)
        .join(OrganizationStaff, OrganizationStaff.organization_id == Organization.id)
        .where(
            OrganizationStaff.user_id == user.id,
            OrganizationStaff.status == "active",
        )
        .order_by(Organization.name)
    )
    if user.role == "organization_admin":
        query = query.where(OrganizationStaff.role == "admin")
    elif user.role != "staff":
        return []
    return db.scalars(query).all()


@router.get("/{organization_id}/my-membership")
def my_organization_membership(
    organization_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db)
    membership = db.scalar(
        select(OrganizationStaff).where(
            OrganizationStaff.organization_id == organization_id,
            OrganizationStaff.user_id == user.id,
            OrganizationStaff.status == "active",
        )
    )
    counter = db.get(Counter, membership.counter_id) if membership and membership.counter_id else None
    return {
        "organization_id": organization_id,
        "organization_role": membership.role if membership else "admin",
        "counter_id": membership.counter_id if membership else None,
        "counter_name": counter.name if counter else None,
        "counter_status": counter.status if counter else None,
    }


@router.get("/{organization_id}", response_model=OrganizationRead)
def get_organization(organization_id: UUID, db: Session = Depends(get_db)):
    organization = db.get(Organization, organization_id)
    if organization is None or organization.status != "active":
        raise HTTPException(status_code=404, detail="Organization not found")
    return organization


@router.patch("/{organization_id}", response_model=OrganizationRead)
def update_organization(
    organization_id: UUID,
    payload: OrganizationUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    organization = require_organization_access(
        organization_id, user, db, admin_only=True
    )
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(organization, field, str(value).lower() if field == "email" and value else value)
    db.commit()
    db.refresh(organization)
    return organization


@router.get(
    "/{organization_id}/medication-catalog",
    response_model=list[MedicationCatalogRead],
)
def list_medication_catalog(
    organization_id: UUID,
    search: str | None = Query(default=None, max_length=100),
    include_inactive: bool = False,
    user: User = Depends(require_roles("organization_admin", "doctor")),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db)
    query = select(MedicationCatalogItem).where(
        MedicationCatalogItem.organization_id == organization_id
    )
    if include_inactive and user.role != "organization_admin":
        raise HTTPException(status_code=403, detail="Only organization admins can view inactive catalog entries")
    if not include_inactive:
        query = query.where(MedicationCatalogItem.is_active.is_(True))
    if search and search.strip():
        query = query.where(MedicationCatalogItem.name.ilike(f"%{search.strip()}%"))
    return db.scalars(query.order_by(MedicationCatalogItem.name).limit(500)).all()


@router.post(
    "/{organization_id}/medication-catalog",
    response_model=MedicationCatalogRead,
    status_code=status.HTTP_201_CREATED,
)
def add_medication_catalog_item(
    organization_id: UUID,
    payload: MedicationCatalogCreate,
    user: User = Depends(require_roles("organization_admin")),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db, admin_only=True)
    if db.scalar(
        select(MedicationCatalogItem.id).where(
            MedicationCatalogItem.organization_id == organization_id,
            func.lower(MedicationCatalogItem.name) == payload.name.lower(),
        )
    ):
        raise HTTPException(status_code=409, detail="This medication is already in the organization catalog")
    item = MedicationCatalogItem(
        organization_id=organization_id,
        created_by_id=user.id,
        name=payload.name,
    )
    db.add(item)
    try:
        db.flush()
        db.add(
            AuditLog(
                actor_user_id=user.id,
                organization_id=organization_id,
                action="medication_catalog_item_created",
                entity_type="medication_catalog_item",
                entity_id=str(item.id),
                details={"name": item.name},
            )
        )
        db.commit()
        db.refresh(item)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="This medication is already in the organization catalog") from exc
    return item


@router.patch(
    "/{organization_id}/medication-catalog/{item_id}",
    response_model=MedicationCatalogRead,
)
def update_medication_catalog_item(
    organization_id: UUID,
    item_id: UUID,
    payload: MedicationCatalogUpdate,
    user: User = Depends(require_roles("organization_admin")),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db, admin_only=True)
    item = db.scalar(
        select(MedicationCatalogItem).where(
            MedicationCatalogItem.id == item_id,
            MedicationCatalogItem.organization_id == organization_id,
        )
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Medication catalog item not found")
    item.is_active = payload.is_active
    db.add(
        AuditLog(
            actor_user_id=user.id,
            organization_id=organization_id,
            action="medication_catalog_item_updated",
            entity_type="medication_catalog_item",
            entity_id=str(item.id),
            details={"is_active": item.is_active},
        )
    )
    db.commit()
    db.refresh(item)
    return item


@router.put("/{organization_id}/operating-hours", response_model=list[OperatingHourInput])
def set_operating_hours(
    organization_id: UUID,
    hours: list[OperatingHourInput],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db, admin_only=True)
    if len({item.weekday for item in hours}) != len(hours):
        raise HTTPException(status_code=422, detail="Each weekday may only be specified once")
    db.query(OperatingHour).filter_by(organization_id=organization_id).delete()
    db.add_all(
        OperatingHour(organization_id=organization_id, **item.model_dump())
        for item in hours
    )
    db.commit()
    return hours


@router.get("/{organization_id}/operating-hours", response_model=list[OperatingHourInput])
def get_operating_hours(organization_id: UUID, db: Session = Depends(get_db)):
    organization = db.get(Organization, organization_id)
    if organization is None or organization.status != "active":
        raise HTTPException(status_code=404, detail="Organization not found")
    return db.scalars(
        select(OperatingHour)
        .where(OperatingHour.organization_id == organization_id)
        .order_by(OperatingHour.weekday)
    ).all()


@router.get("/{organization_id}/holidays")
def list_holidays(organization_id: UUID, db: Session = Depends(get_db)):
    organization = db.get(Organization, organization_id)
    if organization is None or organization.status != "active":
        raise HTTPException(status_code=404, detail="Organization not found")
    return db.scalars(
        select(OrganizationHoliday)
        .where(OrganizationHoliday.organization_id == organization_id)
        .order_by(OrganizationHoliday.holiday_date)
    ).all()


@router.post("/{organization_id}/holidays", status_code=status.HTTP_201_CREATED)
def add_holiday(
    organization_id: UUID,
    payload: HolidayInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db, admin_only=True)
    holiday = OrganizationHoliday(organization_id=organization_id, **payload.model_dump())
    db.add(holiday)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="A holiday is already configured for that date") from exc
    db.refresh(holiday)
    return {"id": holiday.id, **payload.model_dump()}


@router.delete("/{organization_id}/holidays/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_holiday(
    organization_id: UUID,
    holiday_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db, admin_only=True)
    holiday = db.scalar(
        select(OrganizationHoliday).where(
            OrganizationHoliday.id == holiday_id,
            OrganizationHoliday.organization_id == organization_id,
        )
    )
    if holiday is None:
        raise HTTPException(status_code=404, detail="Holiday not found")
    db.delete(holiday)
    db.commit()


@router.get("/{organization_id}/services", response_model=list[ServiceRead])
def list_services(
    organization_id: UUID,
    include_unavailable: bool = False,
    user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    organization = db.get(Organization, organization_id)
    if organization is None or organization.status != "active":
        raise HTTPException(status_code=404, detail="Organization not found")
    if include_unavailable:
        if user is None:
            raise HTTPException(status_code=401, detail="Sign in to view unavailable services")
        require_organization_access(organization_id, user, db, admin_only=True)
    query = select(Service).where(Service.organization_id == organization_id)
    if not include_unavailable:
        query = query.where(Service.is_available.is_(True))
    return db.scalars(query.order_by(Service.name)).all()


@router.post(
    "/{organization_id}/services",
    response_model=ServiceRead,
    status_code=status.HTTP_201_CREATED,
)
def create_service(
    organization_id: UUID,
    payload: ServiceInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    organization = require_organization_access(
        organization_id, user, db, admin_only=True
    )
    if organization.status != "active":
        raise HTTPException(status_code=409, detail="Organization must be approved before managing services")
    service = Service(organization_id=organization_id, **payload.model_dump())
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


@router.patch("/{organization_id}/services/{service_id}", response_model=ServiceRead)
def update_service(
    organization_id: UUID,
    service_id: UUID,
    payload: ServiceInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db, admin_only=True)
    service = db.scalar(
        select(Service).where(
            Service.id == service_id,
            Service.organization_id == organization_id,
        )
    )
    if service is None:
        raise HTTPException(status_code=404, detail="Service not found")
    for field, value in payload.model_dump().items():
        setattr(service, field, value)
    db.commit()
    db.refresh(service)
    return service


@router.delete("/{organization_id}/services/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service(
    organization_id: UUID,
    service_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db, admin_only=True)
    service = db.scalar(
        select(Service).where(
            Service.id == service_id,
            Service.organization_id == organization_id,
        )
    )
    if service is None:
        raise HTTPException(status_code=404, detail="Service not found")
    service.is_available = False
    db.commit()


@router.get("/{organization_id}/counters", response_model=list[CounterRead])
def list_counters(
    organization_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db)
    return db.scalars(
        select(Counter)
        .where(Counter.organization_id == organization_id)
        .order_by(Counter.name)
    ).all()


@router.post(
    "/{organization_id}/counters",
    response_model=CounterRead,
    status_code=status.HTTP_201_CREATED,
)
def create_counter(
    organization_id: UUID,
    payload: CounterInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db, admin_only=True)
    counter = Counter(organization_id=organization_id, **payload.model_dump())
    db.add(counter)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="A counter with this name already exists") from exc
    db.refresh(counter)
    return counter


@router.patch("/{organization_id}/counters/{counter_id}", response_model=CounterRead)
def update_counter(
    organization_id: UUID,
    counter_id: UUID,
    payload: CounterInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db, admin_only=True)
    counter = db.scalar(
        select(Counter).where(
            Counter.id == counter_id,
            Counter.organization_id == organization_id,
        )
    )
    if counter is None:
        raise HTTPException(status_code=404, detail="Counter not found")
    counter.name = payload.name
    counter.status = payload.status
    db.commit()
    db.refresh(counter)
    return counter


@router.get("/{organization_id}/staff", response_model=list[StaffRead])
def list_staff(
    organization_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db, admin_only=True)
    rows = db.execute(
        select(OrganizationStaff, User)
        .join(User, User.id == OrganizationStaff.user_id)
        .where(OrganizationStaff.organization_id == organization_id)
        .order_by(User.full_name)
    ).all()
    return [_staff_read(membership, staff_user) for membership, staff_user in rows]


@router.get("/{organization_id}/doctors", response_model=list[StaffRead])
def list_doctors(
    organization_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db, admin_only=True)
    rows = db.execute(
        select(OrganizationStaff, User)
        .join(User, User.id == OrganizationStaff.user_id)
        .where(
            OrganizationStaff.organization_id == organization_id,
            OrganizationStaff.role == "doctor",
        )
        .order_by(User.full_name)
    ).all()
    return [_staff_read(membership, doctor) for membership, doctor in rows]


@router.post("/{organization_id}/staff", response_model=StaffRead, status_code=201)
def add_staff(
    organization_id: UUID,
    payload: StaffInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db, admin_only=True)
    if payload.role == "admin" and user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Only a super admin may appoint organization admins")
    if payload.counter_id is not None:
        counter = db.scalar(
            select(Counter).where(
                Counter.id == payload.counter_id,
                Counter.organization_id == organization_id,
            )
        )
        if counter is None:
            raise HTTPException(status_code=422, detail="Counter must belong to this organization")
    email = str(payload.email).lower()
    existing_user = db.scalar(select(User).where(func.lower(User.email) == email))
    if existing_user is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    staff_user = User(
        email=email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name.strip(),
        role="doctor" if payload.role == "doctor" else "staff",
        phone=payload.phone,
    )
    db.add(staff_user)
    try:
        db.flush()
        membership = OrganizationStaff(
            organization_id=organization_id,
            user_id=staff_user.id,
            counter_id=payload.counter_id,
            role=payload.role,
            status="active",
            availability_status="available",
            specialization=payload.specialization if payload.role == "doctor" else None,
            qualification=payload.qualification if payload.role == "doctor" else None,
            registration_number=(
                payload.registration_number.upper()
                if payload.role == "doctor" and payload.registration_number
                else None
            ),
            experience_years=payload.experience_years if payload.role == "doctor" else None,
            department=payload.department if payload.role == "doctor" else None,
            consultation_fee=payload.consultation_fee if payload.role == "doctor" else None,
        )
        db.add(membership)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        detail = (
            "A doctor with this registration number already exists in this organization"
            if payload.role == "doctor"
            else "Unable to add this staff member"
        )
        raise HTTPException(status_code=409, detail=detail) from exc
    return _staff_read(membership, staff_user)


@router.patch(
    "/{organization_id}/doctors/{membership_id}/availability",
    response_model=StaffRead,
)
def update_doctor_availability(
    organization_id: UUID,
    membership_id: UUID,
    payload: DoctorAvailabilityUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db, admin_only=True)
    membership = db.scalar(
        select(OrganizationStaff).where(
            OrganizationStaff.id == membership_id,
            OrganizationStaff.organization_id == organization_id,
            OrganizationStaff.role == "doctor",
        )
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="Doctor not found")
    doctor = db.get(User, membership.user_id)
    if doctor is None:
        raise HTTPException(status_code=404, detail="Doctor account not found")
    membership.availability_status = payload.availability_status
    db.commit()
    db.refresh(membership)
    return _staff_read(membership, doctor)


@router.patch("/{organization_id}/staff/{membership_id}", response_model=StaffRead)
def update_staff(
    organization_id: UUID,
    membership_id: UUID,
    payload: StaffUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db, admin_only=True)
    membership = db.scalar(
        select(OrganizationStaff).where(
            OrganizationStaff.id == membership_id,
            OrganizationStaff.organization_id == organization_id,
        )
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="Staff membership not found")
    staff_user = db.get(User, membership.user_id)
    if staff_user is None:
        raise HTTPException(status_code=404, detail="Staff account not found")
    if payload.counter_id is not None and db.scalar(
        select(Counter.id).where(
            Counter.id == payload.counter_id,
            Counter.organization_id == organization_id,
        )
    ) is None:
        raise HTTPException(status_code=422, detail="Counter must belong to this organization")
    staff_user.full_name = payload.full_name.strip()
    staff_user.role = "doctor" if payload.role == "doctor" else "staff"
    if payload.password:
        staff_user.password_hash = hash_password(payload.password)
    membership.counter_id = payload.counter_id
    membership.role = payload.role
    membership.status = payload.status
    db.commit()
    return _staff_read(membership, staff_user)


@router.delete("/{organization_id}/staff/{membership_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_staff(
    organization_id: UUID,
    membership_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db, admin_only=True)
    membership = db.scalar(
        select(OrganizationStaff).where(
            OrganizationStaff.id == membership_id,
            OrganizationStaff.organization_id == organization_id,
        )
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="Staff membership not found")
    membership.status = "inactive"
    membership.counter_id = None
    db.commit()


@router.get("/{organization_id}/services/{service_id}/counters", response_model=list[CounterRead])
def list_service_counters(
    organization_id: UUID,
    service_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db)
    return db.scalars(
        select(Counter)
        .join(ServiceCounter, ServiceCounter.counter_id == Counter.id)
        .where(
            ServiceCounter.service_id == service_id,
            Counter.organization_id == organization_id,
        )
    ).all()


@router.put("/{organization_id}/services/{service_id}/counters")
def assign_service_counters(
    organization_id: UUID,
    service_id: UUID,
    counter_ids: list[UUID],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_organization_access(organization_id, user, db, admin_only=True)
    service = db.scalar(
        select(Service).where(
            Service.id == service_id,
            Service.organization_id == organization_id,
        )
    )
    if service is None:
        raise HTTPException(status_code=404, detail="Service not found")
    counters = db.scalars(
        select(Counter).where(
            Counter.id.in_(counter_ids),
            Counter.organization_id == organization_id,
        )
    ).all() if counter_ids else []
    if len(counters) != len(set(counter_ids)):
        raise HTTPException(status_code=422, detail="All counters must belong to this organization")
    db.query(ServiceCounter).filter_by(service_id=service_id).delete()
    db.add_all(ServiceCounter(service_id=service_id, counter_id=counter_id) for counter_id in counter_ids)
    db.commit()
    return {"service_id": service_id, "counter_ids": counter_ids}


@router.get("/_admin/pending", response_model=list[OrganizationRead])
def list_pending_organizations(
    user: User = Depends(require_roles("super_admin")),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(Organization)
        .where(Organization.status == "pending")
        .order_by(Organization.created_at)
    ).all()


@router.patch("/_admin/{organization_id}/status", response_model=OrganizationRead)
def set_organization_status(
    organization_id: UUID,
    new_status: str = Query(pattern=r"^(active|suspended|pending)$"),
    user: User = Depends(require_roles("super_admin")),
    db: Session = Depends(get_db),
):
    organization = db.get(Organization, organization_id)
    if organization is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    organization.status = new_status
    db.add(
        AuditLog(
            actor_user_id=user.id,
            organization_id=organization.id,
            action="organization.status_changed",
            entity_type="organization",
            entity_id=str(organization.id),
            details={"status": new_status},
        )
    )
    db.commit()
    db.refresh(organization)
    return organization

import io

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from PIL import Image, UnidentifiedImageError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.database.session import get_db
from app.models import User
from app.schemas.auth import (
    LoginRequest,
    PasswordChange,
    ProfileUpdate,
    RegisterRequest,
    TokenResponse,
    UserRead,
)

router = APIRouter(prefix="/auth", tags=["authentication"])
MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024
PROFILE_IMAGE_TYPES = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    user = User(
        email=str(payload.email).lower(),
        password_hash=hash_password(payload.password),
        full_name=payload.full_name.strip(),
        phone=payload.phone,
        role="customer",
    )
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="An account with this email already exists") from exc
    return TokenResponse(access_token=create_access_token(user.id, user.role), user=user)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == str(payload.email).lower()))
    if user is None or not user.is_active or not verify_password(
        payload.password, user.password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return TokenResponse(access_token=create_access_token(user.id, user.role), user=user)


@router.post("/logout")
def logout(user: User = Depends(get_current_user)):
    return {"message": "Logged out. Remove the access token from this device.", "user_id": user.id}


@router.get("/me", response_model=UserRead)
def read_profile(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserRead)
def update_profile(
    payload: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user.full_name = payload.full_name.strip()
    user.phone = payload.phone
    db.commit()
    db.refresh(user)
    return user


@router.get("/me/profile-image")
def read_profile_image(user: User = Depends(get_current_user)):
    if user.profile_image_data is None or user.profile_image_content_type is None:
        raise HTTPException(status_code=404, detail="No profile image has been uploaded")
    return Response(
        content=user.profile_image_data,
        media_type=user.profile_image_content_type,
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.put("/me/profile-image", status_code=status.HTTP_204_NO_CONTENT)
async def update_profile_image(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    image_data = await file.read(MAX_PROFILE_IMAGE_BYTES + 1)
    if len(image_data) > MAX_PROFILE_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Profile images must be 5 MB or smaller")
    try:
        with Image.open(io.BytesIO(image_data)) as image:
            image_format = image.format
            width, height = image.size
            if width * height > 25_000_000:
                raise HTTPException(status_code=422, detail="Profile image dimensions are too large")
            image.verify()
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError) as exc:
        raise HTTPException(status_code=422, detail="Upload a valid JPEG, PNG, or WebP image") from exc
    content_type = PROFILE_IMAGE_TYPES.get(image_format or "")
    if content_type is None:
        raise HTTPException(status_code=422, detail="Upload a valid JPEG, PNG, or WebP image")

    user.profile_image_data = image_data
    user.profile_image_content_type = content_type
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/me/profile-image", status_code=status.HTTP_204_NO_CONTENT)
def delete_profile_image(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user.profile_image_data = None
    user.profile_image_content_type = None
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/change-password")
def change_password(
    payload: PasswordChange,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=400, detail="Choose a new password")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password changed successfully"}

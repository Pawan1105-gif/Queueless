from getpass import getpass

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import func, select

from app.core.security import hash_password
from app.database.session import SessionLocal
from app.models import User


def main() -> None:
    email_input = input("Super admin email: ").strip()
    try:
        email = validate_email(email_input, check_deliverability=False).normalized.lower()
    except EmailNotValidError as exc:
        raise SystemExit(f"Invalid email address: {exc}") from exc

    password = getpass("Password (12+ characters): ")
    if len(password) < 12:
        raise SystemExit("Password must be at least 12 characters.")
    if password != getpass("Confirm password: "):
        raise SystemExit("Passwords do not match.")

    with SessionLocal() as db:
        if db.scalar(select(User.id).where(func.lower(User.email) == email)):
            raise SystemExit("An account with that email already exists.")
        admin = User(
            email=email,
            full_name="QueueLess Super Admin",
            password_hash=hash_password(password),
            role="super_admin",
        )
        db.add(admin)
        db.commit()
    print("Super admin account created.")


if __name__ == "__main__":
    main()

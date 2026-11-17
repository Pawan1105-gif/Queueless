
from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from urllib.parse import urlsplit

from app.api.routes import analytics, appointments, auth, feedback, medications, notifications, organizations, queue
from app.core.config import settings
from app.database.session import engine
from app.websocket.routes import router as websocket_router

app = FastAPI(
    title=settings.APP_NAME,
    description="Smart queue and appointment management API",
    version="0.1.0",
)

frontend_origins = [settings.FRONTEND_URL]
frontend_url = urlsplit(settings.FRONTEND_URL)
if frontend_url.hostname in {"localhost", "127.0.0.1"}:
    alternate_host = "127.0.0.1" if frontend_url.hostname == "localhost" else "localhost"
    alternate_origin = f"{frontend_url.scheme}://{alternate_host}"
    if frontend_url.port:
        alternate_origin += f":{frontend_url.port}"
    frontend_origins.append(alternate_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(organizations.router)
api_router.include_router(appointments.router)
api_router.include_router(medications.router)
api_router.include_router(queue.router)
api_router.include_router(notifications.router)
api_router.include_router(feedback.router)
api_router.include_router(analytics.router)
app.include_router(api_router)
app.include_router(websocket_router)


@app.get("/")
def home():
    return {
        "message": "Welcome to QueueLess API",
        "status": "Running",
    }


@app.get("/health/db")
def database_health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

        return {"status": "Connected"}

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database connection failed",
        )


from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "QueueLess"
    DATABASE_URL: str
    FRONTEND_URL: str = "http://localhost:5173"
    JWT_SECRET_KEY: str | None = None
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    QR_TOKEN_EXPIRE_MINUTES: int = 1440

    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

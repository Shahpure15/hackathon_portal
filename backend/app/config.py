import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./event_portal.db"
    JWT_SECRET_KEY: str = "d8f4e6a2b0c1d3e5f7a9b8c6d4e2f0a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3"
    JWT_REFRESH_SECRET_KEY: str = "e1c3a5b7d9f2e4a6c8b0d2e4f6a8b1c3d5e7f9a1b3c5d7e9f1a3b5c7d9e1f3a5"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    CORS_ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"
    ENVIRONMENT: str = "development"
    SENTRY_DSN: str = ""
    BACKEND_VERSION: str = "9.0.0"

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()

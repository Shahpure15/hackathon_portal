import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./event_portal.db"
    JWT_SECRET_KEY: str = "CHANGE_ME_INSECURE_DEFAULT_SECRET_KEY"
    JWT_REFRESH_SECRET_KEY: str = "CHANGE_ME_INSECURE_DEFAULT_REFRESH_KEY"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    CORS_ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,https://mitindia.vercel.app,https://mitinida-hackathon-portal.vercel.app,https://hackathon.mitindia.com,https://www.hackathon.mitindia.com"
    CORS_ALLOWED_ORIGIN_REGEX: str = ""
    ENVIRONMENT: str = "development"
    SENTRY_DSN: str = ""
    BACKEND_VERSION: str = "10.2.0"

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()

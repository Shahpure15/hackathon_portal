import logging
import os
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("uvicorn.error")

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./event_portal.db"
    JWT_SECRET_KEY: str = "9a6b98e72e1f40d39e2621cb039b4b0e8c89c8a9d0f04fa18dbd846fa5cf613c"
    JWT_REFRESH_SECRET_KEY: str = "2e84d4b1a43a41cb982e0a295c52c2f0f81d11e8a8d052b0f4a8b7ea8b9c02ff"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    CORS_ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,https://mitindia.vercel.app,https://mitinida-hackathon-portal.vercel.app,https://hackathon.mitindia.com,https://www.hackathon.mitindia.com"
    CORS_ALLOWED_ORIGIN_REGEX: str = ""
    ENVIRONMENT: str = "development"
    SENTRY_DSN: str = ""
    BACKEND_VERSION: str = "10.7.1"
    SECRETS_ENCRYPTION_KEY: str = "DTCcIoV1CaV0FgUACAhQjLuJhuFL6p3n01NoIn3RsWA="
    FRONTEND_BASE_URL: str = ""
    EMAIL_WORKER_ENABLED: bool = True

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()

if settings.ENVIRONMENT == "production":
    insecure_jwt = settings.JWT_SECRET_KEY in ("CHANGE_ME_INSECURE_DEFAULT_SECRET_KEY", "")
    insecure_refresh = settings.JWT_REFRESH_SECRET_KEY in ("CHANGE_ME_INSECURE_DEFAULT_REFRESH_KEY", "")
    empty_enc = not settings.SECRETS_ENCRYPTION_KEY or not settings.SECRETS_ENCRYPTION_KEY.strip()
    if insecure_jwt:
        logger.warning(
            "JWT_SECRET_KEY was not explicitly provided or was insecure. Using persistent fallback secret."
        )
        settings.JWT_SECRET_KEY = "9a6b98e72e1f40d39e2621cb039b4b0e8c89c8a9d0f04fa18dbd846fa5cf613c"
    if insecure_refresh:
        logger.warning(
            "JWT_REFRESH_SECRET_KEY was not explicitly provided or was insecure. Using persistent fallback secret."
        )
        settings.JWT_REFRESH_SECRET_KEY = "2e84d4b1a43a41cb982e0a295c52c2f0f81d11e8a8d052b0f4a8b7ea8b9c02ff"
    if empty_enc:
        logger.warning(
            "SECRETS_ENCRYPTION_KEY was not set in production. Using persistent fallback encryption key."
        )
        settings.SECRETS_ENCRYPTION_KEY = "DTCcIoV1CaV0FgUACAhQjLuJhuFL6p3n01NoIn3RsWA="


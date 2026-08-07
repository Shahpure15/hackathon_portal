import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./event_portal.db"
    JWT_SECRET_KEY: str = "9a6b98e72e1f40d39e2621cb039b4b0e8c89c8a9d0f04fa18dbd846fa5cf613c"
    JWT_REFRESH_SECRET_KEY: str = "2e84d4b1a43a41cb982e0a295c52c2f0f81d11e8a8d052b0f4a8b7ea8b9c02ff"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ENVIRONMENT: str = "development"
    SENTRY_DSN: str = ""

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()

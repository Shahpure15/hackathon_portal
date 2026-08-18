import sentry_sdk
from fastapi import FastAPI, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.config import settings
from app.database import get_db, engine
from app.routers import auth, admin, leader, volunteer, ws
from app.limiter import limiter
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from app.logger import logger

import secrets

# Insecure defaults guard & dynamic secure key generator
_INSECURE_DEFAULTS = {
    "9a6b98e72e1f40d39e2621cb039b4b0e8c89c8a9d0f04fa18dbd846fa5cf613c",
    "2e84d4b1a43a41cb982e0a295c52c2f0f81d11e8a8d052b0f4a8b7ea8b9c02ff",
    "CHANGE_ME_INSECURE_DEFAULT_SECRET_KEY",
    "CHANGE_ME_INSECURE_DEFAULT_REFRESH_KEY",
}

if settings.JWT_SECRET_KEY in _INSECURE_DEFAULTS or not settings.JWT_SECRET_KEY:
    if settings.ENVIRONMENT == "production":
        settings.JWT_SECRET_KEY = secrets.token_hex(32)
        logger.warning("JWT_SECRET_KEY was on insecure default in production. Generated a secure runtime key for this boot session.")
    else:
        settings.JWT_SECRET_KEY = "dev_secret_key_change_in_production"

if settings.JWT_REFRESH_SECRET_KEY in _INSECURE_DEFAULTS or not settings.JWT_REFRESH_SECRET_KEY:
    if settings.ENVIRONMENT == "production":
        settings.JWT_REFRESH_SECRET_KEY = secrets.token_hex(32)
        logger.warning("JWT_REFRESH_SECRET_KEY was on insecure default in production. Generated a secure runtime key for this boot session.")
    else:
        settings.JWT_REFRESH_SECRET_KEY = "dev_refresh_secret_key_change_in_production"

# Initialize Sentry if DSN is provided
if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        traces_sample_rate=1.0,
    )

app = FastAPI(
    title="Event Management Portal API",
    description="Backend API for team management, volunteer check-in, and problem statement selection",
    version=settings.BACKEND_VERSION
)

# Set up limiter state
app.state.limiter = limiter

async def cors_rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    response = JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={"detail": "Rate limit exceeded. Please wait a minute before retrying."}
    )
    origin = request.headers.get("origin")
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "*"
    return response

app.add_exception_handler(RateLimitExceeded, cors_rate_limit_exceeded_handler)

import time

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    try:
        response = await call_next(request)
        duration_ms = (time.time() - start_time) * 1000
        client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown").split(",")[0].strip()
        logger.info(f"{client_ip} - \"{request.method} {request.url.path}\" {response.status_code} ({duration_ms:.1f}ms)")
        return response
    except Exception as exc:
        duration_ms = (time.time() - start_time) * 1000
        client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown").split(",")[0].strip()
        logger.error(f"{client_ip} - \"{request.method} {request.url.path}\" ERROR ({duration_ms:.1f}ms) - {exc}")
        raise exc

# Configure CORS middleware
origins = [origin.strip() for origin in settings.CORS_ALLOWED_ORIGINS.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^https://([a-z0-9-]+\.vercel\.app|([a-z0-9-]+\.)*mitindia\.com)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from alembic.config import Config
from alembic import command
import os

@app.on_event("startup")
def run_migrations_on_startup():
    try:
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        alembic_ini_path = os.path.join(backend_dir, "alembic.ini")
        if os.path.exists(alembic_ini_path):
            alembic_cfg = Config(alembic_ini_path)
            alembic_cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
            command.upgrade(alembic_cfg, "head")
            logger.info("Alembic database migrations applied successfully to head on startup.")
    except Exception as e:
        logger.error(f"Error running automatic Alembic startup migration: {e}")

@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    """Health check route validating database connectivity and backend version."""
    try:
        db.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "database": "connected",
            "environment": settings.ENVIRONMENT,
            "version": settings.BACKEND_VERSION
        }
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Database connection error: {str(e)}"
        )

# Register API Routers
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(leader.router)
app.include_router(volunteer.router)
app.include_router(ws.router)

import sentry_sdk
from fastapi import FastAPI, Depends, HTTPException
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

# Insecure defaults guard
_INSECURE_DEFAULTS = {
    "9a6b98e72e1f40d39e2621cb039b4b0e8c89c8a9d0f04fa18dbd846fa5cf613c",
    "2e84d4b1a43a41cb982e0a295c52c2f0f81d11e8a8d052b0f4a8b7ea8b9c02ff",
}
if settings.ENVIRONMENT == "production" and (
    settings.JWT_SECRET_KEY in _INSECURE_DEFAULTS or settings.JWT_REFRESH_SECRET_KEY in _INSECURE_DEFAULTS
):
    raise RuntimeError("Refusing to start: JWT secrets are still on insecure defaults in production")

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
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Configure CORS middleware
origins = [origin.strip() for origin in settings.CORS_ALLOWED_ORIGINS.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^https://[a-z0-9-]+\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

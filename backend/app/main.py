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
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_db_migration():
    try:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE evaluation_rounds ADD COLUMN IF NOT EXISTS description TEXT;"))
            conn.execute(text("ALTER TABLE evaluation_rounds ADD COLUMN IF NOT EXISTS fields JSONB DEFAULT '[]'::jsonb;"))
            conn.execute(text("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS answers JSONB DEFAULT '{}'::jsonb;"))
            conn.execute(text("ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS remarks TEXT;"))
            conn.execute(text("ALTER TABLE volunteers ALTER COLUMN type TYPE VARCHAR(50);"))
            conn.execute(text("ALTER TABLE event_configs ADD COLUMN IF NOT EXISTS \"peopleRoles\" JSONB DEFAULT '[]'::jsonb;"))
            conn.commit()
            logger.info("Successfully executed startup schema migration for event_configs.peopleRoles")
    except Exception as e:
        logger.warning(f"Startup schema migration notice: {e}")

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

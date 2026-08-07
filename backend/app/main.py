import sentry_sdk
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.config import settings
from app.database import get_db
from app.routers import auth, admin, leader, volunteer
from app.limiter import limiter
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

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
    version="1.0.0"
)

# Set up limiter state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Configure CORS middleware
origins = [origin.strip() for origin in settings.CORS_ALLOWED_ORIGINS.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Routers
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(leader.router)
app.include_router(volunteer.router)

@app.get("/health")
async def health_check(db: Session = Depends(get_db)):
    """Health check route validating database connectivity."""
    try:
        # Run a simple query to verify database is reachable
        db.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "database": "connected",
            "environment": settings.ENVIRONMENT
        }
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Database connection error: {str(e)}"
        )

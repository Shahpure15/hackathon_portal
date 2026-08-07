import sentry_sdk
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.config import settings
from app.database import get_db
from app.routers import auth, admin, leader, volunteer

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

# Configure CORS middleware
# Note: Allows localhost for local development and can be extended with production URL.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Nginx serves and routes proxies, but we keep this open/flexible for API dev testing
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

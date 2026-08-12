import sentry_sdk
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.config import settings
from app.database import get_db, engine
from app.models import Base
from app.routers import auth, admin, leader, volunteer, ws
from app.limiter import limiter
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

def _auto_migrate():
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        # Fix event_configs psGateCheckpointTypeId column (quoted camelCase)
        try:
            conn.execute(text("""
                DO $$ 
                BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='event_configs' AND column_name='psGateCheckpointTypeId') THEN
                        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='event_configs' AND column_name='psgatecheckpointtypeid') THEN
                            ALTER TABLE "event_configs" RENAME COLUMN "psgatecheckpointtypeid" TO "psGateCheckpointTypeId";
                        ELSE
                            ALTER TABLE "event_configs" ADD COLUMN "psGateCheckpointTypeId" VARCHAR(36);
                        END IF;
                    END IF;
                END $$;
            """))
            conn.commit()
        except Exception as e:
            print(f"Auto-migrate event_configs warning: {e}")

        # Fix team_members isTeamLeader column (quoted camelCase)
        try:
            conn.execute(text("""
                DO $$ 
                BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='team_members' AND column_name='isTeamLeader') THEN
                        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='team_members' AND column_name='isteamleader') THEN
                            ALTER TABLE "team_members" RENAME COLUMN "isteamleader" TO "isTeamLeader";
                        ELSE
                            ALTER TABLE "team_members" ADD COLUMN "isTeamLeader" BOOLEAN DEFAULT FALSE NOT NULL;
                        END IF;
                    END IF;
                END $$;
            """))
            conn.commit()
        except Exception as e:
            print(f"Auto-migrate team_members warning: {e}")

_auto_migrate()

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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Routers
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(leader.router)
app.include_router(volunteer.router)
app.include_router(ws.router)

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

import sys
import os
from datetime import datetime, timedelta
import secrets
import string

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import (
    Event, EventConfig, User, Role, CheckpointType, 
    Volunteer, Team, TeamMember, Pod, AttendanceRecord, 
    ProblemStatement, PSSelection, RefreshToken, AuditLog, PendingImport
)
from app.auth import get_password_hash
from app.config import settings

def generate_random_password(length=16):
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))

def reset_db():
    print("Connecting to database...")
    db = SessionLocal()
    try:
        print("Cleaning existing database data...")
        
        # Delete child records first to satisfy foreign keys
        db.query(AttendanceRecord).delete()
        db.query(PSSelection).delete()
        db.query(TeamMember).delete()
        db.query(Team).delete()
        db.query(Volunteer).delete()
        db.query(CheckpointType).delete()
        db.query(RefreshToken).delete()
        db.query(User).delete()
        db.query(EventConfig).delete()
        db.query(Pod).delete()
        db.query(ProblemStatement).delete()
        db.query(AuditLog).delete()
        db.query(PendingImport).delete()
        db.query(Event).delete()
        
        db.commit()
        print("Existing database data cleaned successfully.")
        print("Re-seeding database default accounts...")

        # 1. Create the Active Event
        event = Event(
            name="MIT India Hackathon 2026",
            startDate=datetime.utcnow(),
            endDate=datetime.utcnow() + timedelta(days=2),
            isActive=True
        )
        db.add(event)
        db.flush() # Populate ID

        # 2. Create Event Config with PS Release set to tomorrow
        config = EventConfig(
            eventId=event.id,
            psReleaseAt=datetime.utcnow() + timedelta(days=1)
        )
        db.add(config)

        # 3. Create Default Admin User
        admin_username = "admin"
        admin_password = os.environ.get("ADMIN_SEED_PASSWORD")
        if not admin_password:
            if settings.ENVIRONMENT == "development":
                admin_password = "AdminPassword123!"
            else:
                admin_password = generate_random_password()

        admin = User(
            eventId=event.id,
            username=admin_username,
            passwordHash=get_password_hash(admin_password),
            role=Role.ADMIN
        )
        db.add(admin)

        # 4. Create Default Volunteer User
        volunteer_username = "volunteer"
        volunteer_password = os.environ.get("VOLUNTEER_SEED_PASSWORD")
        if not volunteer_password:
            if settings.ENVIRONMENT == "development":
                volunteer_password = "VolunteerPassword123!"
            else:
                volunteer_password = generate_random_password()

        # Create volunteer profile linked to user
        vol_profile = Volunteer(
            eventId=event.id,
            name="Default Volunteer",
            type="FACULTY",
            contact="volunteer@mitindia.com"
        )
        db.add(vol_profile)
        db.flush()

        volunteer = User(
            eventId=event.id,
            username=volunteer_username,
            passwordHash=get_password_hash(volunteer_password),
            role=Role.VOLUNTEER,
            volunteerId=vol_profile.id
        )
        db.add(volunteer)

        # 5. Create Standard Checkpoint Types
        checkpoints = [
            CheckpointType(
                eventId=event.id,
                name="Day 1 Check-In",
                description="Physical Government & College ID verification at entry gate"
            ),
            CheckpointType(
                eventId=event.id,
                name="Day 1 Lunch",
                description="Verification for lunch coupon collection"
            ),
            CheckpointType(
                eventId=event.id,
                name="Day 2 Entry",
                description="Physical check-in at the beginning of day 2"
            )
        ]
        for cp in checkpoints:
            db.add(cp)

        db.commit()
        print("Database reset and seeding completed successfully!")
        print("--------------------------------------")
        print(f"Active Event: {event.name}")
        print("Admin User Credentials:")
        print(f"  Username: {admin_username}")
        print(f"  Password: {admin_password}")
        print("Volunteer User Credentials:")
        print(f"  Username: {volunteer_username}")
        print(f"  Password: {volunteer_password}")
        print("--------------------------------------")

    except Exception as e:
        db.rollback()
        print(f"Error resetting database: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    reset_db()

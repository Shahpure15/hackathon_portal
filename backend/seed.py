import sys
import os
from datetime import datetime, timedelta
import secrets
import string

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import Event, EventConfig, User, Role, CheckpointType
from app.auth import get_password_hash
from app.config import settings
from app.rbac import assign_default_role

def generate_random_password(length=16):
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))

def seed_db():
    db = SessionLocal()
    try:
        # Check if an event already exists
        existing_event = db.query(Event).first()
        if existing_event:
            print("Database already contains event data. Seeding aborted.")
            return

        print("Seeding database...")

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

        volunteer = User(
            eventId=event.id,
            username=volunteer_username,
            passwordHash=get_password_hash(volunteer_password),
            role=Role.VOLUNTEER
        )
        db.add(volunteer)
        db.flush()
        assign_default_role(db, volunteer, None, created_by='SEED')

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
        print("Seeding completed successfully!")
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
        print(f"Error seeding database: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    seed_db()

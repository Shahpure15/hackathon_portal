import sys
import os

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import Event, Team, TeamMember, TeamStatus, User, Role
from app.auth import get_password_hash

def seed_teams():
    db = SessionLocal()
    try:
        event = db.query(Event).filter_by(isActive=True).first()
        if not event:
            print("No active event found. Run reset_db.py first.")
            return

        # Check if teams already exist
        existing = db.query(Team).filter_by(eventId=event.id).first()
        if existing:
            print("Teams already exist.")
            return

        print("Seeding dummy teams...")
        
        # Team 1
        t1 = Team(
            eventId=event.id,
            registrationId="TEAM101",
            name="Alpha Coders",
            leaderName="Aarav Sharma",
            leaderEmail="aarav@gmail.com",
            leaderPhone="+919876543210",
            collegeName="Pune Institute of Computer Technology",
            status=TeamStatus.REGISTERED
        )
        db.add(t1)
        db.flush()

        m1 = TeamMember(teamId=t1.id, name="Aditya Patel", email="aditya@gmail.com", phone="+919876543211", idVerified=False)
        m2 = TeamMember(teamId=t1.id, name="Neha Sen", email="neha@gmail.com", phone="+919876543212", idVerified=False)
        db.add(m1)
        db.add(m2)

        # Create Leader User for Team 1
        u1 = User(
            eventId=event.id,
            username="team101",
            passwordHash=get_password_hash("TeamPassword123!"),
            role=Role.LEADER,
            teamId=t1.id
        )
        db.add(u1)

        # Team 2
        t2 = Team(
            eventId=event.id,
            registrationId="TEAM102",
            name="Beta Builders",
            leaderName="Vihaan Gupta",
            leaderEmail="vihaan@gmail.com",
            leaderPhone="+919876543220",
            collegeName="COEP Technological University",
            status=TeamStatus.SHORTLISTED
        )
        db.add(t2)
        db.flush()

        m3 = TeamMember(teamId=t2.id, name="Riya Joshi", email="riya@gmail.com", phone="+919876543221", idVerified=True)
        db.add(m3)

        # Create Leader User for Team 2
        u2 = User(
            eventId=event.id,
            username="team102",
            passwordHash=get_password_hash("TeamPassword123!"),
            role=Role.LEADER,
            teamId=t2.id
        )
        db.add(u2)

        db.commit()
        print("Dummy teams seeded successfully!")

    except Exception as e:
        db.rollback()
        print(f"Error seeding teams: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_teams()

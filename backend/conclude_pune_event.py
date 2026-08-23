import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import engine, SessionLocal
from app.models import Event
from sqlalchemy import text, inspect

def main():
    db = SessionLocal()
    try:
        # Check if status column exists in DB, add if missing
        inspector = inspect(engine)
        columns = [c['name'] for c in inspector.get_columns('events')]
        if 'status' not in columns:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE events ADD COLUMN status VARCHAR(20) DEFAULT 'active' NOT NULL"))
                conn.commit()
            print("Added 'status' column to 'events' table.")

        events = db.query(Event).all()
        if not events:
            print("No events found in database.")
            return

        for ev in events:
            ev.status = "concluded"
            print(f"Updated event '{ev.name}' (ID: {ev.id}) status -> 'concluded'")

        db.commit()
        print("Pune Qualifier event successfully marked as CONCLUDED.")
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    main()

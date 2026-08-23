import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import RefreshToken, User, Role

def revoke_sessions():
    db = SessionLocal()
    try:
        non_admin_user_ids = [u.id for u in db.query(User).filter(User.role != Role.ADMIN).all()]
        count = db.query(RefreshToken).filter(
            RefreshToken.userId.in_(non_admin_user_ids),
            RefreshToken.revoked == False
        ).update({"revoked": True}, synchronize_session=False)
        
        db.commit()
        print(f"Successfully revoked {count} active non-admin sessions. Admin sessions remain intact.")
    except Exception as e:
        db.rollback()
        print(f"Error revoking non-admin sessions: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    revoke_sessions()

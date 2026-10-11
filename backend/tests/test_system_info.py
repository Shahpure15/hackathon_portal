from datetime import datetime
from pathlib import Path
from app.auth import get_password_hash, create_access_token
from app.models import Event, User, Role
from app.database import SessionLocal

ROOT = Path(__file__).resolve().parent.parent.parent


def test_system_info_endpoint(client, fresh_db):
    db = SessionLocal()
    try:
        ev = Event(
            name="System Info Test Event",
            startDate=datetime.utcnow(),
            endDate=datetime.utcnow(),
            isActive=True
        )
        db.add(ev)
        db.flush()

        admin_user = User(
            eventId=ev.id,
            username="admin_sys",
            passwordHash=get_password_hash("pass1234"),
            role=Role.ADMIN
        )
        vol_user = User(
            eventId=ev.id,
            username="vol_sys",
            passwordHash=get_password_hash("pass1234"),
            role=Role.VOLUNTEER
        )
        db.add(admin_user)
        db.add(vol_user)
        db.commit()

        admin_token = create_access_token({'sub': admin_user.id, 'role': Role.ADMIN.value, 'eventId': ev.id})
        vol_token = create_access_token({'sub': vol_user.id, 'role': Role.VOLUNTEER.value, 'eventId': ev.id})
    finally:
        db.close()

    # 1. No token gives 401 or 403
    res_none = client.get('/admin/system/info')
    assert res_none.status_code in (401, 403)

    # 2. Volunteer token gives 403
    res_vol = client.get('/admin/system/info', headers={'Authorization': f'Bearer {vol_token}'})
    assert res_vol.status_code == 403

    # 3. Admin token gives 200
    res_admin = client.get('/admin/system/info', headers={'Authorization': f'Bearer {admin_token}'})
    assert res_admin.status_code == 200
    data = res_admin.json()
    expected_version = (ROOT / 'VERSION').read_text(encoding='utf-8').strip()
    assert data['appVersion'] == expected_version
    assert 'schemaRevision' in data
    assert 'commit' in data
    assert 'environment' in data

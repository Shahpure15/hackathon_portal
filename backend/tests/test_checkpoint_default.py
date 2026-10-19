import pytest
from app.models import CheckpointType, Role
from app.rbac import assign_default_role
from tests.factories import make_org_event, make_user, make_volunteer, auth_header


def test_checkpoint_default_lifecycle(client, db):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "admin_test_cp")
    vol_rec = make_volunteer(db, event, "Vol Person")
    vol_user = make_user(db, event, Role.VOLUNTEER, "vol_test_cp", volunteer=vol_rec)
    assign_default_role(db, vol_user, None)

    admin_headers = auth_header(admin)
    vol_headers = auth_header(vol_user)

    # 1. Admin creates first checkpoint (default is False)
    resp1 = client.post(
        "/admin/checkpoints",
        headers=admin_headers,
        json={"name": "Registration Desk", "description": "Check in for day 1"}
    )
    assert resp1.status_code == 200, resp1.text
    cp1_id = resp1.json()["id"]
    assert resp1.json()["isDefault"] is False

    # 2. Admin creates second checkpoint with isDefault=True
    resp2 = client.post(
        "/admin/checkpoints",
        headers=admin_headers,
        json={"name": "Lunch Slot", "description": "Day 1 Lunch", "isDefault": True}
    )
    assert resp2.status_code == 200, resp2.text
    cp2_id = resp2.json()["id"]
    assert resp2.json()["isDefault"] is True

    # Check db: cp1 must be False, cp2 must be True
    db_cp1 = db.query(CheckpointType).filter_by(id=cp1_id).first()
    db_cp2 = db.query(CheckpointType).filter_by(id=cp2_id).first()
    assert db_cp1.isDefault is False
    assert db_cp2.isDefault is True

    # 3. Admin creates third checkpoint with isDefault=True -> cp2 should lose default
    resp3 = client.post(
        "/admin/checkpoints",
        headers=admin_headers,
        json={"name": "Dinner Slot", "isDefault": True}
    )
    assert resp3.status_code == 200, resp3.text
    cp3_id = resp3.json()["id"]
    assert resp3.json()["isDefault"] is True

    db.expire_all()
    assert db.query(CheckpointType).filter_by(id=cp1_id).first().isDefault is False
    assert db.query(CheckpointType).filter_by(id=cp2_id).first().isDefault is False
    assert db.query(CheckpointType).filter_by(id=cp3_id).first().isDefault is True

    # 4. Admin updates cp1 to be default via PATCH
    patch_resp = client.patch(
        f"/admin/checkpoints/{cp1_id}",
        headers=admin_headers,
        json={"isDefault": True}
    )
    assert patch_resp.status_code == 200, patch_resp.text
    assert patch_resp.json()["isDefault"] is True

    db.expire_all()
    assert db.query(CheckpointType).filter_by(id=cp1_id).first().isDefault is True
    assert db.query(CheckpointType).filter_by(id=cp2_id).first().isDefault is False
    assert db.query(CheckpointType).filter_by(id=cp3_id).first().isDefault is False

    # 5. Volunteer fetches checkpoints -> sees isDefault flag accurately
    vol_resp = client.get(
        "/volunteer/checkpoints",
        headers=vol_headers
    )
    assert vol_resp.status_code == 200, vol_resp.text
    cps = vol_resp.json()["checkpoints"]
    cp_map = {c["id"]: c["isDefault"] for c in cps}
    assert cp_map[cp1_id] is True
    assert cp_map[cp2_id] is False
    assert cp_map[cp3_id] is False

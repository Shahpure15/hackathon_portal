import pytest
from app.models import Event, EventConfig, Role
from tests.factories import make_org_event, make_user, auth_header


def test_get_and_patch_event_config(client, db):
    event = make_org_event(db, name="Hackathon 2026")
    admin = make_user(db, event, role="ADMIN", username="admin_cfg")
    headers = auth_header(admin)

    # 1. GET initial event config
    res = client.get("/admin/config", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["eventId"] == event.id
    assert data["eventName"] == "Hackathon 2026"
    assert data["status"] in ("active", "upcoming")
    assert data["isActive"] is True

    # 2. Conclude the event via PATCH
    res_conclude = client.patch(
        "/admin/config",
        headers=headers,
        json={"status": "concluded"}
    )
    assert res_conclude.status_code == 200
    assert res_conclude.json()["status"] == "concluded"

    # Verify event in DB is concluded
    db.refresh(event)
    assert event.status == "concluded"

    # 3. Reactivate the event via PATCH
    res_reactivate = client.patch(
        "/admin/config",
        headers=headers,
        json={"status": "active"}
    )
    assert res_reactivate.status_code == 200
    assert res_reactivate.json()["status"] == "active"
    assert res_reactivate.json()["isActive"] is True

    db.refresh(event)
    assert event.status == "active"
    assert event.isActive is True

    # 4. Invalid status -> 422
    res_invalid = client.patch(
        "/admin/config",
        headers=headers,
        json={"status": "invalid_status"}
    )
    assert res_invalid.status_code == 422


def test_concluded_event_blocks_participant_login(client, db):
    event = make_org_event(db, name="Concluded Gate Event")
    admin = make_user(db, event, role="ADMIN", username="admin_gate")
    leader = make_user(db, event, role="LEADER", username="team_lead_1", password="password123")
    admin_hdr = auth_header(admin)

    # 1. When event is active, leader can login
    res_login_ok = client.post("/auth/login", json={"username": "team_lead_1", "password": "password123"})
    assert res_login_ok.status_code == 200

    # 2. Mark event concluded via PATCH /admin/config
    res_patch = client.patch("/admin/config", headers=admin_hdr, json={"status": "concluded"})
    assert res_patch.status_code == 200
    assert res_patch.json()["status"] == "concluded"

    # 3. Non-admin login is now HTTP 410 GONE
    res_login_concluded = client.post("/auth/login", json={"username": "team_lead_1", "password": "password123"})
    assert res_login_concluded.status_code == 410

    # 4. Reactivate event via PATCH /admin/config
    res_reopen = client.patch("/admin/config", headers=admin_hdr, json={"status": "active"})
    assert res_reopen.status_code == 200

    # 5. Non-admin can login again!
    res_login_again = client.post("/auth/login", json={"username": "team_lead_1", "password": "password123"})
    assert res_login_again.status_code == 200

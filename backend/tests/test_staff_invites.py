from datetime import datetime, timedelta
import hashlib
import json
import pytest

from app.models import (
    Role,
    Volunteer,
    User,
    SmtpAccount,
    AuthToken,
    EmailOutbox,
    UserRoleAssignment,
    RbacRole,
)
from app.config import settings
from tests.factories import make_org_event, make_user, make_volunteer, auth_header


@pytest.fixture
def invite_fixture(db, monkeypatch):
    monkeypatch.setattr(settings, "SECRETS_ENCRYPTION_KEY", "bXlfdGVzdF9mZXJuZXRfa2V5XzMyX2J5dGVzX2xvbmchISE=")
    monkeypatch.setattr(settings, "FRONTEND_BASE_URL", "https://portal.example.com")

    event = make_org_event(db, name="Invite Event")
    admin = make_user(db, event, Role.ADMIN, username="admin_invite")
    vol_user = make_user(db, event, Role.VOLUNTEER, username="vol_user")

    # Add active SMTP account
    smtp = SmtpAccount(
        orgId=event.orgId,
        label="Primary SMTP",
        host="smtp.example.com",
        port=587,
        security="starttls",
        username="smtp_user",
        passwordEnc="dummy_encrypted",
        fromEmail="noreply@example.com",
        fromName="Event Portal",
        status="active",
        createdAt=datetime.utcnow(),
    )
    db.add(smtp)

    # Volunteer to invite
    v1 = make_volunteer(db, event, name="Judge Bob", type="JUDGE", email="bob@example.com")
    v2 = make_volunteer(db, event, name="Vol Charlie", type="VOLUNTEER", email="charlie@example.com")
    db.commit()

    return {
        "event": event,
        "admin": admin,
        "volunteer_user": vol_user,
        "v1": v1,
        "v2": v2,
        "smtp": smtp,
    }


def test_permission_gates_email_and_invites(client, invite_fixture):
    fx = invite_fixture
    vol_h = auth_header(fx["volunteer_user"])
    v1_id = fx["v1"].id

    # Seeded volunteer gets 403 on admin email & invite routes
    res1 = client.get("/admin/email/accounts", headers=vol_h)
    assert res1.status_code == 403

    res2 = client.get("/admin/staff/access", headers=vol_h)
    assert res2.status_code == 403

    res3 = client.post(f"/admin/staff/{v1_id}/invite", json={}, headers=vol_h)
    assert res3.status_code == 403

    res4 = client.put(f"/admin/staff/{v1_id}/email", json={"email": "new@ex.com"}, headers=vol_h)
    assert res4.status_code == 403


def test_smtp_account_crud_and_secrets_guard(client, invite_fixture, monkeypatch):
    fx = invite_fixture
    adm_h = auth_header(fx["admin"])

    # List accounts - never echoes password
    res = client.get("/admin/email/accounts", headers=adm_h)
    assert res.status_code == 200
    accounts = res.json()
    assert len(accounts) >= 1
    for a in accounts:
        assert "password" not in a
        assert a["hasPassword"] is True

    # Missing SECRETS_ENCRYPTION_KEY gives 409
    monkeypatch.setattr(settings, "SECRETS_ENCRYPTION_KEY", "")
    res_no_sec = client.post(
        "/admin/email/accounts",
        json={
            "label": "Test",
            "host": "smtp.mailgun.org",
            "port": 587,
            "security": "starttls",
            "username": "u",
            "password": "p",
            "fromEmail": "test@ex.com",
        },
        headers=adm_h,
    )
    assert res_no_sec.status_code == 409


def test_template_validation(client, invite_fixture):
    fx = invite_fixture
    adm_h = auth_header(fx["admin"])

    # CRLF in subject rejected
    res_crlf = client.put(
        "/admin/email/templates/staff_invite",
        json={"subject": "Hello\nWorld", "body": "Body {{recipient_name}}"},
        headers=adm_h,
    )
    assert res_crlf.status_code == 422

    # Disallowed variable rejected
    res_disallowed = client.put(
        "/admin/email/templates/staff_invite",
        json={"subject": "Invite", "body": "Hello {{recipient_name}}, {{forbidden_var}}"},
        headers=adm_h,
    )
    assert res_disallowed.status_code == 422
    assert "disallowed variables" in res_disallowed.json()["detail"].lower()


def test_staff_invite_and_accept_lifecycle(client, invite_fixture, db):
    fx = invite_fixture
    adm_h = auth_header(fx["admin"])
    v1 = fx["v1"]

    # Send invite
    res_inv = client.post(f"/admin/staff/{v1.id}/invite", json={}, headers=adm_h)
    assert res_inv.status_code == 200
    data = res_inv.json()
    assert data["invited"] is True
    assert data["username"] == "bob@example.com"

    # User created with status 'invited'
    user = db.query(User).filter(User.username == "bob@example.com").first()
    assert user is not None
    assert user.status == "invited"
    assert user.role == Role.VOLUNTEER

    # Assigned to Judge role
    assign = db.query(UserRoleAssignment).filter(UserRoleAssignment.userId == user.id).first()
    assert assign is not None

    # Outbox row queued
    outbox = db.query(EmailOutbox).filter(EmailOutbox.toEmail == "bob@example.com").first()
    assert outbox is not None
    assert outbox.status == "queued"
    assert "https://portal.example.com/accept-invite?token=" in outbox.body

    # Extract token from invite_link in outbox body
    import re
    match = re.search(r"token=([A-Za-z0-9_-]+)", outbox.body)
    assert match is not None
    raw_token = match.group(1)

    # DB holds SHA-256 hash, not raw token
    tok_row = db.query(AuthToken).filter(AuthToken.userId == user.id).first()
    assert tok_row is not None
    assert tok_row.tokenHash == hashlib.sha256(raw_token.encode()).hexdigest()
    assert tok_row.tokenHash != raw_token

    # Invited user cannot log in before accepting
    res_login_invited = client.post("/auth/login", json={"username": "bob@example.com", "password": "anypassword"})
    assert res_login_invited.status_code in (401, 403)

    # Public invite-info endpoint
    res_info = client.get(f"/auth/invite-info?token={raw_token}")
    assert res_info.status_code == 200
    info_data = res_info.json()
    assert info_data["username"] == "bob@example.com"
    assert info_data["recipientName"] == "Judge Bob"

    # Garbage token gives generic 400
    res_garbage = client.get("/auth/invite-info?token=garbage_token_123")
    assert res_garbage.status_code == 400
    assert "invalid or has expired" in res_garbage.json()["detail"].lower()

    # Short password gives generic 400
    res_short = client.post("/auth/accept-invite", json={"token": raw_token, "password": "short"})
    assert res_short.status_code == 400

    # Accept invite
    res_accept = client.post("/auth/accept-invite", json={"token": raw_token, "password": "SecurePassword123!"})
    assert res_accept.status_code == 200
    assert res_accept.json()["ok"] is True

    # User is now active and can log in!
    db.refresh(user)
    assert user.status == "active"

    res_login_ok = client.post("/auth/login", json={"username": "bob@example.com", "password": "SecurePassword123!"})
    assert res_login_ok.status_code == 200
    assert "access_token" in res_login_ok.json()

    # Re-use of accepted token fails
    res_reuse = client.post("/auth/accept-invite", json={"token": raw_token, "password": "AnotherPassword123!"})
    assert res_reuse.status_code == 400

    # Inviting an already active user gives 409
    res_reinv = client.post(f"/admin/staff/{v1.id}/invite", json={}, headers=adm_h)
    assert res_reinv.status_code == 409

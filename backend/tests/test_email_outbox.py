from datetime import datetime, timedelta
import pytest
from app.models import SmtpAccount, EmailOutbox
from app.services.email_outbox import enqueue_email, process_due
from tests.factories import make_org_event


@pytest.fixture
def test_account(db):
    event = make_org_event(db, name="E-Mail")
    acc = SmtpAccount(
        orgId=event.orgId,
        label="Test Relay",
        host="smtp.example.com",
        port=587,
        security="starttls",
        username="user",
        passwordEnc="dummy-enc",
        fromEmail="noreply@example.com",
        fromName="Hackathon",
        status="active",
        priority=10,
    )
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return acc, event


def test_enqueue_and_process_success(db, test_account):
    acc, event = test_account
    row = enqueue_email(
        db,
        event_id=event.id,
        to_email="attendee@example.com",
        template_key="staff_invite",
        context={
            "recipient_name": "Bob",
            "event_name": "Hackathon 2026",
            "invite_link": "https://hackathon.mitindia.com/accept-invite?token=xyz",
            "expires_at": "tomorrow",
        },
        category="critical",
    )
    assert row.status == "queued"
    assert row.priority == 0
    assert "Bob" in row.body
    assert row.body != ""

    # Fake sender that succeeds
    sent_calls = []

    def fake_sender(account, to, subject, text, html):
        sent_calls.append((to, subject, text))
        return True, 250, None

    res = process_due(db, sender=fake_sender)
    assert res["sent"] == 1
    assert len(sent_calls) == 1
    assert sent_calls[0][0] == "attendee@example.com"

    db.refresh(row)
    assert row.status == "sent"
    assert row.sentAt is not None
    assert row.body == ""  # Body is blanked for safety!

    db.refresh(acc)
    assert acc.sentToday == 1

    # Second process_due call should process 0 rows
    res2 = process_due(db, sender=fake_sender)
    assert res2["processed"] == 0
    assert len(sent_calls) == 1


def test_transient_failure_and_retry(db, test_account):
    acc, event = test_account
    row = enqueue_email(
        db,
        event_id=event.id,
        to_email="transient@example.com",
        template_key="staff_invite",
        context={"recipient_name": "Charlie", "event_name": "E", "invite_link": "https://l", "expires_at": "x"},
    )

    def failing_sender(account, to, subject, text, html):
        return False, 421, "Service unavailable"

    now = datetime.utcnow()
    res = process_due(db, sender=failing_sender, now=now)
    assert res["retried"] == 1

    db.refresh(row)
    assert row.status == "queued"
    assert row.attempts == 1
    assert row.nextAttemptAt > now

    # Simulate 4 more transient failures
    for attempt_num in range(2, 6):
        row.nextAttemptAt = now
        db.commit()
        res = process_due(db, sender=failing_sender, now=now)
        db.refresh(row)

    assert row.status == "failed"
    assert "Max delivery attempts exceeded" in (row.error or "")


def test_permanent_failure(db, test_account):
    acc, event = test_account
    row = enqueue_email(
        db,
        event_id=event.id,
        to_email="permanent@example.com",
        template_key="staff_invite",
        context={"recipient_name": "Dave", "event_name": "E", "invite_link": "https://l", "expires_at": "x"},
    )

    def rejected_sender(account, to, subject, text, html):
        return False, 550, "User mailbox does not exist"

    res = process_due(db, sender=rejected_sender)
    assert res["failed"] == 1

    db.refresh(row)
    assert row.status == "failed"
    assert "Permanent SMTP rejection (550)" in (row.error or "")


def test_expired_email_not_sent(db, test_account):
    acc, event = test_account
    past_now = datetime.utcnow() - timedelta(hours=2)
    row = enqueue_email(
        db,
        event_id=event.id,
        to_email="expired@example.com",
        template_key="staff_invite",
        context={"recipient_name": "Eve", "event_name": "E", "invite_link": "https://l", "expires_at": "x"},
        expires_in_minutes=10,
    )
    # Force row to have expired in the past
    row.expiresAt = past_now
    row.nextAttemptAt = past_now
    db.commit()

    called = []

    def fake_sender(*args):
        called.append(args)
        return True, 250, None

    res = process_due(db, sender=fake_sender)
    assert res["expired"] == 1
    assert len(called) == 0

    db.refresh(row)
    assert row.status == "expired"

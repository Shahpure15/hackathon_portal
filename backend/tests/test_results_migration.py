from decimal import Decimal
import uuid
import pytest
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError

from app.models import (
    EvaluationRound,
    TeamRoundStatus,
    ResultRelease,
    ResultReleaseItem,
    Notification,
)
from tests.factories import make_org_event, make_team, make_user


@pytest.fixture
def results_setup(db):
    event = make_org_event(db, name="Results Test Event")
    team = make_team(db, event, name="Team Phoenix", registration_id="REG-RES-01")
    user = make_user(db, event, username="phoenix_leader", role="LEADER", team_id=team.id)

    round_row = EvaluationRound(
        eventId=event.id,
        name="Quarter Finals",
        roundNumber=1,
        submissionEnabled=True,
        evaluationEnabled=True,
    )
    db.add(round_row)
    db.commit()
    db.refresh(round_row)
    return event, team, user, round_row


def test_team_round_status_crud_and_uniqueness(db, results_setup):
    event, team, user, round_row = results_setup

    status = TeamRoundStatus(
        eventId=event.id,
        roundId=round_row.id,
        teamId=team.id,
        state="advanced",
        via="auto_top_n",
        rankSnapshot=1,
        scoreSnapshot=Decimal("94.500"),
        decidedBy=user.id,
    )
    db.add(status)
    db.commit()

    fetched = db.query(TeamRoundStatus).filter(TeamRoundStatus.id == status.id).first()
    assert fetched is not None
    assert fetched.state == "advanced"
    assert fetched.via == "auto_top_n"
    assert fetched.rankSnapshot == 1
    assert fetched.scoreSnapshot == Decimal("94.500")

    # Uniqueness constraint: (roundId, teamId)
    duplicate = TeamRoundStatus(
        eventId=event.id,
        roundId=round_row.id,
        teamId=team.id,
        state="eligible",
        via="manual",
    )
    db.add(duplicate)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_result_releases_and_items_lifecycle(db, results_setup):
    event, team, user, round_row = results_setup

    release = ResultRelease(
        eventId=event.id,
        roundId=round_row.id,
        releaseNo=1,
        config={"showScore": True, "showRank": True},
        releasedBy=user.id,
    )
    db.add(release)
    db.commit()
    db.refresh(release)

    item = ResultReleaseItem(
        releaseId=release.id,
        teamId=team.id,
        payload={"score": 94.5, "rank": 1},
    )
    db.add(item)
    db.commit()

    # Uniqueness on (roundId, releaseNo)
    duplicate_release = ResultRelease(
        eventId=event.id,
        roundId=round_row.id,
        releaseNo=1,
        config={},
        releasedBy=user.id,
    )
    db.add(duplicate_release)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    # Cascade delete on release removes items via relationship cascade
    release_id = release.id
    db.delete(release)
    db.commit()
    assert db.query(ResultReleaseItem).filter(ResultReleaseItem.releaseId == release_id).first() is None


def test_notifications_crud_and_read(db, results_setup):
    event, team, user, _ = results_setup

    notif = Notification(
        eventId=event.id,
        recipientUserId=user.id,
        type="results_released",
        title="Results are out: Quarter Finals",
        body="Your team scored 94.5",
        link="/leader?tab=rounds",
        payload={"roundId": "r1"},
    )
    db.add(notif)
    db.commit()

    fetched = db.query(Notification).filter(Notification.recipientUserId == user.id).first()
    assert fetched is not None
    assert fetched.title == "Results are out: Quarter Finals"
    assert fetched.readAt is None

    # Mark as read
    fetched.readAt = sa.func.now()
    db.commit()
    db.refresh(fetched)
    assert fetched.readAt is not None

    # Delete notification
    notif_id = fetched.id
    db.delete(fetched)
    db.commit()
    assert db.query(Notification).filter(Notification.id == notif_id).first() is None


def test_migration_indexes_exist(db):
    conn = db.connection()
    insp = sa.inspect(conn)
    
    # Check index on notifications
    notif_indexes = [idx["name"] for idx in insp.get_indexes("notifications")]
    assert "ix_notifications_recipient_read" in notif_indexes

    # Check unique constraint on team_round_status
    trs_uniques = [u.get("name") for u in insp.get_unique_constraints("team_round_status")] + [
        idx.get("name") for idx in insp.get_indexes("team_round_status") if idx.get("unique")
    ]
    assert "uq_team_round_status_round_team" in trs_uniques

    # Check unique constraint on result_releases
    rr_uniques = [u.get("name") for u in insp.get_unique_constraints("result_releases")] + [
        idx.get("name") for idx in insp.get_indexes("result_releases") if idx.get("unique")
    ]
    assert "uq_result_releases_round_release_no" in rr_uniques

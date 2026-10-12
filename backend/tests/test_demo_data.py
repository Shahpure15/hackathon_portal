import pytest
from app.models import Team, Volunteer, ProblemStatement
from tests.factories import make_org_event, make_team, make_volunteer, make_user, auth_header


def test_seed_and_clear_demo_data(client, db):
    event = make_org_event(db, name="Demo Data Isolation Test")
    admin = make_user(db, event, role="ADMIN", username="admin_demo")
    headers = auth_header(admin)

    # Pre-create real teams and real volunteers
    real_team = make_team(db, event, name="Real Team Beta", registration_id="REAL-101")
    real_judge = make_volunteer(db, event, name="Real Judge Prof", type="JUDGE")

    # 1. Seed demo data
    res_seed = client.post(
        "/admin/demo-data/seed",
        headers=headers,
        json={"teamsCount": 4, "judgesCount": 2},
    )
    assert res_seed.status_code == 200
    seed_data = res_seed.json()
    assert seed_data["teams_created"] == 4
    assert seed_data["judges_created"] == 2

    # Verify demo teams and judges exist in DB
    demo_teams_count = db.query(Team).filter(Team.eventId == event.id, Team.registrationId.like("DEMO-%")).count()
    assert demo_teams_count == 4

    demo_judges_count = db.query(Volunteer).filter(Volunteer.eventId == event.id, Volunteer.name.like("DEMO-%")).count()
    assert demo_judges_count == 2

    # Real records must still be present
    assert db.query(Team).filter(Team.id == real_team.id).first() is not None
    assert db.query(Volunteer).filter(Volunteer.id == real_judge.id).first() is not None

    # 2. Clear demo data
    res_clear = client.delete("/admin/demo-data/clear", headers=headers)
    assert res_clear.status_code == 200
    clear_data = res_clear.json()
    assert clear_data["teams_cleared"] == 4
    assert clear_data["judges_cleared"] == 2

    # Verify demo records removed
    assert db.query(Team).filter(Team.eventId == event.id, Team.registrationId.like("DEMO-%")).count() == 0
    assert db.query(Volunteer).filter(Volunteer.eventId == event.id, Volunteer.name.like("DEMO-%")).count() == 0
    assert db.query(ProblemStatement).filter(ProblemStatement.eventId == event.id, ProblemStatement.code.like("DEMO-%")).count() == 0

    # Real records MUST STILL REMAIN UNTOUCHED
    assert db.query(Team).filter(Team.id == real_team.id).first() is not None
    assert db.query(Volunteer).filter(Volunteer.id == real_judge.id).first() is not None


def test_demo_data_rbac(client, db):
    event = make_org_event(db, name="Demo RBAC Event")
    leader = make_user(db, event, role="LEADER", username="leader_demo")

    # Unauthenticated
    res_unauth = client.post("/admin/demo-data/seed", json={})
    assert res_unauth.status_code == 401

    # Leader -> 403
    res_leader = client.post("/admin/demo-data/seed", headers=auth_header(leader), json={})
    assert res_leader.status_code == 403

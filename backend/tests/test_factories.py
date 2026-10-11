from app.models import Event, EventConfig, Role, Team, User, Volunteer
from tests.factories import (
    auth_header,
    make_org_event,
    make_team,
    make_user,
    make_volunteer,
)


def test_factories_create_rows(db):
    event = make_org_event(db, name='Hackathon 2026')
    assert db.query(Event).filter(Event.id == event.id).first() is not None
    assert db.query(EventConfig).filter(EventConfig.eventId == event.id).first() is not None

    volunteer = make_volunteer(db, event, name='Volunteer 1', email='vol1@example.com')
    assert db.query(Volunteer).filter(Volunteer.id == volunteer.id).first() is not None

    user = make_user(db, event, Role.ADMIN, username='admin_test', volunteer=volunteer)
    assert db.query(User).filter(User.id == user.id).first() is not None

    team = make_team(db, event, name='Team Alpha', registration_id='REG-001')
    assert db.query(Team).filter(Team.id == team.id).first() is not None

    headers = auth_header(user)
    assert 'Authorization' in headers
    assert headers['Authorization'].startswith('Bearer ')

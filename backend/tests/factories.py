from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.auth import create_access_token, get_password_hash
from app.models import Event, EventConfig, Organization, Role, Team, Volunteer, User
from app.services.features import FeaturesConfig
from app.services.tenancy import get_default_org, DEFAULT_ORG_SLUG


def make_org_event(db: Session, name: str = 'E1', status: str = 'active') -> Event:
    org = get_default_org(db)
    if not org:
        org = Organization(name='Default Organization', slug=DEFAULT_ORG_SLUG)
        db.add(org)
        db.flush()
    now = datetime.utcnow()
    event = Event(
        name=name,
        startDate=now,
        endDate=now + timedelta(days=2),
        isActive=True,
        status=status,
        orgId=org.id,
    )
    db.add(event)
    db.flush()

    config = EventConfig(
        eventId=event.id,
        features=FeaturesConfig().model_dump(),
        allowVolunteerPsSelection=False,
    )
    db.add(config)
    db.commit()
    db.refresh(event)
    return event


def make_volunteer(
    db: Session,
    event: Event,
    name: str = 'V',
    type: str = 'VOLUNTEER',
    email: Optional[str] = None,
) -> Volunteer:
    volunteer = Volunteer(
        eventId=event.id,
        name=name,
        type=type,
        contact='1234567890',
        email=email,
    )
    db.add(volunteer)
    db.commit()
    db.refresh(volunteer)
    return volunteer


def make_user(
    db: Session,
    event: Event,
    role,
    username: str,
    password: str = 'Passw0rd!xyz',
    volunteer: Optional[Volunteer] = None,
    status: str = 'active',
    team_id: Optional[str] = None,
) -> User:
    role_val = role.value if hasattr(role, 'value') else str(role)
    user = User(
        eventId=event.id,
        username=username,
        passwordHash=get_password_hash(password),
        role=role_val,
        status=status,
        volunteerId=volunteer.id if volunteer else None,
        teamId=team_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def make_team(
    db: Session,
    event: Event,
    name: str,
    registration_id: str,
    pod=None,
) -> Team:
    team = Team(
        eventId=event.id,
        name=name,
        registrationId=registration_id,
        leaderName='Leader ' + name,
        leaderEmail=f'{registration_id}@example.com',
        leaderPhone='9876543210',
        collegeName='College Test',
        podId=pod.id if pod else None,
    )
    db.add(team)
    db.commit()
    db.refresh(team)
    return team


def auth_header(user: User) -> dict:
    role_val = user.role.value if hasattr(user.role, 'value') else str(user.role)
    token = create_access_token({
        'sub': user.id,
        'role': role_val,
        'eventId': user.eventId,
        'tv': getattr(user, 'tokenVersion', 1) or 1,
    })
    return {'Authorization': f'Bearer {token}'}

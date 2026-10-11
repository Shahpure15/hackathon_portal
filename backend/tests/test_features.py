from app.services.features import features_from_raw, get_event_features
from app.models import Event, EventConfig
from datetime import datetime


def test_features_from_raw():
    assert features_from_raw(None).pods is True
    assert features_from_raw(None).evaluation is True

    assert features_from_raw({}).pods is True
    assert features_from_raw({}).evaluation is True

    f_pods_false = features_from_raw({'pods': False})
    assert f_pods_false.pods is False
    assert f_pods_false.evaluation is True

    f_unknown = features_from_raw({'unknown_flag': 123, 'pods': True})
    assert f_unknown.pods is True
    assert f_unknown.evaluation is True

    f_invalid = features_from_raw({'pods': 'banana'})
    assert f_invalid.pods is True
    assert f_invalid.evaluation is True


def test_get_event_features_no_config(fresh_db):
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        f = get_event_features(db, "nonexistent-event-id")
        assert f.pods is True
        assert f.evaluation is True
    finally:
        db.close()


def test_get_event_features_null_features(fresh_db):
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        ev = Event(
            name="Test Event",
            startDate=datetime.utcnow(),
            endDate=datetime.utcnow(),
            isActive=True
        )
        db.add(ev)
        db.flush()

        cfg = EventConfig(eventId=ev.id, features=None)
        db.add(cfg)
        db.commit()

        f = get_event_features(db, ev.id)
        assert f.pods is True
        assert f.evaluation is True
    finally:
        db.close()

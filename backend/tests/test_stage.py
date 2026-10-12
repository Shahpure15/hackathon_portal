import pytest
from app.models import EvaluationRound, Role
from app.services.features import FeaturesConfig, features_from_raw
from tests.factories import make_org_event, make_user, auth_header


def test_features_config_stage_default():
    fc = FeaturesConfig()
    assert fc.stage == "setup"
    assert fc.pods is True
    assert fc.evaluation is True

    fc_custom = features_from_raw({"stage": "judging", "pods": False})
    assert fc_custom.stage == "judging"
    assert fc_custom.pods is False


def test_stage_api_lifecycle(client, db):
    event = make_org_event(db, name="Stage Test Event")
    admin = make_user(db, event, role="ADMIN", username="admin_stage")
    headers = auth_header(admin)

    # 1. GET features
    res = client.get("/admin/config/features", headers=headers)
    assert res.status_code == 200
    assert res.json()["stage"] == "setup"

    # 2. PUT features with valid stage
    res_update = client.put(
        "/admin/config/features",
        headers=headers,
        json={"stage": "event_day"},
    )
    assert res_update.status_code == 200
    assert res_update.json()["stage"] == "event_day"

    # Verify persisted
    res_after = client.get("/admin/config/features", headers=headers)
    assert res_after.json()["stage"] == "event_day"

    # 3. PUT features with invalid stage -> 422
    res_invalid = client.put(
        "/admin/config/features",
        headers=headers,
        json={"stage": "invalid_stage"},
    )
    assert res_invalid.status_code == 422


def test_administrative_round_creation(client, db):
    event = make_org_event(db, name="MultiCity Administrative Round Event")
    admin = make_user(db, event, role="ADMIN", username="admin_multicity")
    headers = auth_header(admin)

    # Create administrative / rubric-free round (e.g. Pune Regional)
    res_create = client.post(
        "/admin/rounds",
        headers=headers,
        json={
            "name": "Pune Regional Round",
            "number": 1,
            "submissionEnabled": True,
            "evaluationEnabled": False,
        },
    )
    assert res_create.status_code == 201
    created_round = res_create.json()
    assert created_round["name"] == "Pune Regional Round"
    assert created_round["submissionEnabled"] is True
    assert created_round["evaluationEnabled"] is False
    assert created_round["rubricSummary"]["version"] == 0

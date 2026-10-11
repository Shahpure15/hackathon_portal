import re
from datetime import datetime, timedelta
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.models import Role, RbacRole, RolePermission, UserRoleAssignment, EventConfig
from tests.factories import make_org_event, make_user, make_volunteer, auth_header

client = TestClient(app)

PUBLIC = {('POST', '/auth/login'), ('POST', '/auth/refresh'), ('POST', '/auth/logout'), ('GET', '/health')}
DOC_PATHS = {'/openapi.json', '/docs', '/docs/oauth2-redirect', '/redoc'}


def _get_target_routes():
    api_routes = []
    for r in app.routes:
        if isinstance(r, APIRoute):
            api_routes.append(r)
        elif hasattr(r, 'original_router'):
            for sub in r.original_router.routes:
                if isinstance(sub, APIRoute):
                    api_routes.append(sub)
        elif hasattr(r, 'routes'):
            for sub in r.routes:
                if isinstance(sub, APIRoute):
                    api_routes.append(sub)

    routes = []
    for r in api_routes:
        if r.path in DOC_PATHS or r.path.startswith('/__test'):
            continue
        for m in r.methods:
            if (m, r.path) in PUBLIC:
                continue
            sub_path = re.sub(r'\{[^}]+\}', '00000000-0000-0000-0000-000000000000', r.path)
            routes.append((m, r.path, sub_path))
    return routes


def test_rbac_parity_matrix(db: Session):
    event = make_org_event(db)
    config = db.query(EventConfig).filter(EventConfig.eventId == event.id).first()
    if config:
        config.psReleaseAt = datetime.utcnow() - timedelta(hours=1)
        config.allowVolunteerPsSelection = True
        db.commit()

    admin = make_user(db, event, Role.ADMIN, "matrix_admin")
    vol_rec = make_volunteer(db, event, "matrix_vol")
    vol = make_user(db, event, Role.VOLUNTEER, "matrix_vol", volunteer=vol_rec)
    leader = make_user(db, event, Role.LEADER, "matrix_leader")

    routes = _get_target_routes()
    assert len(routes) > 50

    admin_headers = auth_header(admin)
    vol_headers = auth_header(vol)
    leader_headers = auth_header(leader)

    for method, raw_path, sub_path in routes:
        # ADMIN assertions:
        # ADMIN gets no 403 on /admin/* and /auth/*, and 403 on /volunteer/* and /leader/*
        res_admin = client.request(method, sub_path, headers=admin_headers, json={})
        if raw_path.startswith('/admin') or raw_path.startswith('/auth'):
            assert res_admin.status_code != 403, f"ADMIN got unexpected 403 on {method} {raw_path} ({res_admin.status_code}: {res_admin.text})"
        elif raw_path.startswith('/volunteer') or raw_path.startswith('/leader'):
            assert res_admin.status_code == 403, f"ADMIN expected 403 on {method} {raw_path}, got {res_admin.status_code}"

        # VOLUNTEER assertions:
        # seeded VOLUNTEER gets 403 on every /leader/* route and no 403 on /volunteer/* and /auth/me
        # on /admin/*: gets 403 on routes requiring permissions outside the seeded role set
        res_vol = client.request(method, sub_path, headers=vol_headers, json={})
        if raw_path.startswith('/leader'):
            assert res_vol.status_code == 403, f"VOLUNTEER expected 403 on {method} {raw_path}, got {res_vol.status_code}"
        elif raw_path.startswith('/volunteer') or raw_path == '/auth/me':
            assert res_vol.status_code != 403, f"VOLUNTEER got unexpected 403 on {method} {raw_path} ({res_vol.status_code}: {res_vol.text})"
        elif raw_path.startswith('/admin'):
            # The volunteer holds team.view, ps.view, checkpoint.view
            vol_view_routes = (
                '/admin/teams', '/admin/teams/unresolved-leaders', '/admin/teams/{team_id}',
                '/admin/problem-statements', '/admin/problem-statements/{ps_id}/teams',
                '/admin/checkpoints'
            )
            if method == 'GET' and raw_path in vol_view_routes:
                assert res_vol.status_code != 403, f"VOLUNTEER unexpectedly denied on {method} {raw_path}"
            else:
                assert res_vol.status_code == 403, f"VOLUNTEER expected 403 on {method} {raw_path}, got {res_vol.status_code}"

        # LEADER assertions:
        # LEADER gets no 403 on /leader/* and /auth/me, and 403 on /admin/* and /volunteer/*
        res_leader = client.request(method, sub_path, headers=leader_headers, json={})
        if raw_path.startswith('/admin') or raw_path.startswith('/volunteer'):
            assert res_leader.status_code == 403, f"LEADER expected 403 on {method} {raw_path}, got {res_leader.status_code}"
        elif raw_path.startswith('/leader') or raw_path == '/auth/me':
            assert res_leader.status_code != 403, f"LEADER got unexpected 403 on {method} {raw_path} ({res_leader.status_code}: {res_leader.text})"


def test_custom_role_volunteer_partial_permissions(db: Session):
    event = make_org_event(db)
    user = make_user(db, event, Role.VOLUNTEER, "partial_vol")

    role = RbacRole(eventId=event.id, name="Team Viewer Only", isSystem=False)
    db.add(role)
    db.flush()
    db.add(RolePermission(roleId=role.id, permissionKey="team.view"))

    asgn = UserRoleAssignment(
        eventId=event.id,
        userId=user.id,
        roleId=role.id,
        scope={"teams": {"mode": "all", "ids": []}},
        createdBy="test"
    )
    db.add(asgn)
    db.commit()

    headers = auth_header(user)

    res_get_teams = client.get("/volunteer/teams", headers=headers)
    assert res_get_teams.status_code != 403, f"Expected no 403 on GET /volunteer/teams, got {res_get_teams.status_code}"

    res_post_checkin = client.post("/volunteer/checkin", headers=headers, json={})
    assert res_post_checkin.status_code == 403, f"Expected 403 on POST /volunteer/checkin, got {res_post_checkin.status_code}"

import re
from app.permissions import (
    CATALOG,
    CATALOG_LIST,
    DANGER,
    GOVERNANCE,
    SEED_ROLES,
    expand_permissions,
    is_assignable,
)


def test_implies_targets_exist():
    for key, perm in CATALOG.items():
        for imp in perm.implies:
            assert imp in CATALOG, f"Permission {key} implies non-existent {imp}"


def test_no_implication_cycles():
    # Expanding any single permission must terminate and yield a finite set
    for key in CATALOG:
        expanded = expand_permissions([key])
        assert isinstance(expanded, set)
        assert key in expanded


def test_expand_permissions_attendance_mark():
    expanded = expand_permissions(['attendance.mark'])
    assert expanded == {'attendance.mark', 'checkpoint.view', 'team.view'}


def test_expand_permissions_unknown_keys():
    expanded = expand_permissions(['unknown.perm', 'attendance.mark', 'fake_key'])
    assert expanded == {'attendance.mark', 'checkpoint.view', 'team.view'}


def test_danger_and_governance_not_assignable():
    danger_and_gov = {k for k, p in CATALOG.items() if p.tier in (DANGER, GOVERNANCE)}
    assert len(danger_and_gov) > 0

    for key in danger_and_gov:
        assert not is_assignable(key), f"{key} should not be assignable"

    for role_key, role_data in SEED_ROLES.items():
        for perm in role_data['permissions']:
            assert perm not in danger_and_gov, f"{perm} in {role_key} is in {CATALOG[perm].tier}"


def test_seed_roles_permissions_exist():
    for role_key, role_data in SEED_ROLES.items():
        for perm in role_data['permissions']:
            assert perm in CATALOG, f"Seed role {role_key} uses unknown permission {perm}"


def test_keys_unique_and_pattern_match():
    key_pattern = re.compile(r'^[a-z_]+[.][a-z_]+$')
    keys = [p.key for p in CATALOG_LIST]
    assert len(keys) == len(set(keys)), "Catalog keys must be unique"
    assert len(keys) == 46, f"Expected 46 catalog keys, found {len(keys)}"

    for k in keys:
        assert key_pattern.match(k), f"Key {k} does not match required format"

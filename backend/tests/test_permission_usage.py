import glob
import os
import re

from app.permissions import CATALOG


def test_every_used_permission_is_in_catalog_and_non_future_keys_are_used():
    routers_dir = os.path.join(os.path.dirname(__file__), "..", "app", "routers")
    pattern = re.compile(r"require_permission\(['\"]([a-z0-9._-]+)['\"]")

    used_keys = set()
    for file_path in glob.glob(os.path.join(routers_dir, "*.py")):
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
            for match in pattern.findall(content):
                used_keys.add(match)

    # 1. Assert every key used in routes exists in CATALOG
    for key in used_keys:
        assert key in CATALOG, f"Permission key '{key}' used in routes but not found in CATALOG"

    # 2. Assert every catalog key with future=False is used by at least one route
    non_future_catalog_keys = {key for key, perm in CATALOG.items() if not perm.future}
    unused = non_future_catalog_keys - used_keys
    assert not unused, f"Catalog keys with future=False not used by any route: {unused}"

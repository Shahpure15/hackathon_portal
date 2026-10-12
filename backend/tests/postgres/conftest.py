import os
import urllib.parse
import pytest

pytestmark = pytest.mark.postgres


@pytest.fixture(autouse=True, scope="package")
def require_postgres():
    url = os.environ.get("TEST_POSTGRES_URL")
    if not url:
        pytest.skip("TEST_POSTGRES_URL is not set; skipping Postgres migration tests")

    parsed = urllib.parse.urlparse(url)
    db_name = parsed.path.lstrip("/")
    assert db_name.endswith("_test"), f"TEST_POSTGRES_URL database name '{db_name}' must end with '_test'"


@pytest.fixture
def pg_url():
    url = os.environ.get("TEST_POSTGRES_URL")
    if not url:
        pytest.skip("TEST_POSTGRES_URL is not set")
    return url

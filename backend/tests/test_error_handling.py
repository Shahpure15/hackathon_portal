import pytest
from app.main import app


@pytest.fixture
def boom_route():
    def boom():
        raise RuntimeError('SECRET-INTERNAL-DETAIL')

    app.add_api_route('/__test_boom', boom)
    yield
    app.router.routes = [r for r in app.router.routes if getattr(r, 'path', None) != '/__test_boom']


def test_internal_server_error_leak(client, boom_route):
    res = client.get('/__test_boom')
    assert res.status_code == 500
    assert res.json() == {"detail": "Internal Server Error"}
    assert "SECRET-INTERNAL-DETAIL" not in res.text

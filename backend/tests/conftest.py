import os
import sys
import tempfile

_tmp = tempfile.mkdtemp(prefix='portal_test_')
os.environ['DATABASE_URL'] = 'sqlite:///' + os.path.join(_tmp, 'test.db')
os.environ['ENVIRONMENT'] = 'test'
os.environ['JWT_SECRET_KEY'] = 'test-only-secret-0123456789abcdef'
os.environ['JWT_REFRESH_SECRET_KEY'] = 'test-only-refresh-0123456789abcdef'
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.database import Base, engine, SessionLocal
from app.main import app

assert settings.DATABASE_URL.startswith('sqlite:///'), 'tests must never use a real database'


@pytest.fixture()
def fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db(fresh_db):
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(fresh_db):
    # Deliberately NOT a context manager: that would fire the startup hook
    # (Alembic upgrade) against the test database.
    return TestClient(app, raise_server_exceptions=False)

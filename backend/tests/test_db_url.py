from app.db_url import normalize_db_url


def test_postgres_url_normalization():
    assert normalize_db_url("postgres://u:p@h/db") == "postgresql+psycopg2://u:p@h/db"
    assert normalize_db_url("postgresql://u:p@h/db") == "postgresql+psycopg2://u:p@h/db"
    assert normalize_db_url("postgresql+psycopg2://u:p@h/db") == "postgresql+psycopg2://u:p@h/db"


def test_sqlite_url_unchanged():
    assert normalize_db_url("sqlite:///x.db") == "sqlite:///x.db"
    assert normalize_db_url("sqlite:///:memory:") == "sqlite:///:memory:"


def test_password_containing_postgres_not_corrupted():
    url = "postgresql://myuser:secret_postgres_pass@db.neon.tech:5432/my_postgres_db"
    expected = "postgresql+psycopg2://myuser:secret_postgres_pass@db.neon.tech:5432/my_postgres_db"
    assert normalize_db_url(url) == expected

    url_plain = "postgres://user:pass_postgres_123@neon.tech/db_postgres"
    expected_plain = "postgresql+psycopg2://user:pass_postgres_123@neon.tech/db_postgres"
    assert normalize_db_url(url_plain) == expected_plain

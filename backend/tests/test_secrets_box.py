import pytest
from cryptography.fernet import Fernet
from app.config import settings
from app.services import secrets_box


def test_secrets_box_round_trip(monkeypatch):
    valid_key = Fernet.generate_key().decode("utf-8")
    monkeypatch.setattr(settings, "SECRETS_ENCRYPTION_KEY", valid_key)

    secret = "SuperSecretPassword123!@#"
    enc = secrets_box.encrypt_secret(secret)
    assert enc != secret
    assert len(enc) > 20

    dec = secrets_box.decrypt_secret(enc)
    assert dec == secret


def test_secrets_box_missing_key(monkeypatch):
    monkeypatch.setattr(settings, "SECRETS_ENCRYPTION_KEY", "")
    assert secrets_box.is_configured() is False

    with pytest.raises(RuntimeError, match="SECRETS_ENCRYPTION_KEY is not configured"):
        secrets_box.encrypt_secret("test")

    with pytest.raises(RuntimeError, match="SECRETS_ENCRYPTION_KEY is not configured"):
        secrets_box.decrypt_secret("test")


def test_secrets_box_wrong_key(monkeypatch):
    key1 = Fernet.generate_key().decode("utf-8")
    key2 = Fernet.generate_key().decode("utf-8")

    monkeypatch.setattr(settings, "SECRETS_ENCRYPTION_KEY", key1)
    secret = "MySecret"
    enc = secrets_box.encrypt_secret(secret)

    monkeypatch.setattr(settings, "SECRETS_ENCRYPTION_KEY", key2)
    with pytest.raises(RuntimeError, match="Failed to decrypt secret"):
        secrets_box.decrypt_secret(enc)

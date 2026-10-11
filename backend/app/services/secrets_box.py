import base64
from typing import Optional
from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def is_configured() -> bool:
    key = getattr(settings, "SECRETS_ENCRYPTION_KEY", "") or ""
    return bool(key.strip())


def _get_fernet() -> Fernet:
    key = (getattr(settings, "SECRETS_ENCRYPTION_KEY", "") or "").strip()
    if not key:
        raise RuntimeError("SECRETS_ENCRYPTION_KEY is not configured")
    try:
        # Fernet expects 32 url-safe base64-encoded bytes
        return Fernet(key.encode("utf-8") if isinstance(key, str) else key)
    except Exception as e:
        raise RuntimeError(f"Invalid SECRETS_ENCRYPTION_KEY: {str(e)}")


def encrypt_secret(plaintext: str) -> str:
    if not plaintext:
        return ""
    f = _get_fernet()
    token = f.encrypt(plaintext.encode("utf-8"))
    return token.decode("utf-8")


def decrypt_secret(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    f = _get_fernet()
    try:
        decrypted = f.decrypt(ciphertext.encode("utf-8"))
        return decrypted.decode("utf-8")
    except InvalidToken:
        raise RuntimeError("Failed to decrypt secret: invalid or incorrect encryption key")

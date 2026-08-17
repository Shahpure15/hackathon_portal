"""
ARCHIVE — Argon2 Password Hashing Configuration (v9.1.0)
Saved on: 2026-08-18

Note: In v9.1.0, password hashing utilized Argon2id (m=65536, t=3, p=4).
This scheme consumes ~64MB of RAM per active hash operation.
For low-resource hosting (such as Render 512MB RAM free instances), 
Argon2id causes high CPU and OOM crashes during concurrent login bursts.
Use v10.0.0 (bcrypt scheme, ~4KB RAM per hash) for RAM-constrained deployment environments.
"""

from passlib.context import CryptContext

# Legacy v9.1 Argon2 CryptContext
pwd_context_argon2 = CryptContext(schemes=["argon2"], deprecated="auto")

DUMMY_HASH_ARGON2 = "$argon2id$v=19$m=65536,t=3,p=4$2q1gXp5eF9S16aC07V0mDw$Z7u4D1Z258Yy02+o3l/Kq8mO372h2Z1o0O392o2m0o8"

def verify_password_argon2(plain_password: str, hashed_password: str) -> bool:
    try:
        return pwd_context_argon2.verify(plain_password, hashed_password)
    except Exception:
        return False

def get_password_hash_argon2(password: str) -> str:
    return pwd_context_argon2.hash(password)

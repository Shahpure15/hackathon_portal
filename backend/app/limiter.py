from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request
from jose import JWTError, jwt
from app.config import settings

def get_real_ip(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return get_remote_address(request)

def login_key_func(request: Request) -> str:
    """
    Rate-limit key for the login endpoint specifically: combines IP with the
    submitted username, so many different people on the same shared/NAT IP
    (e.g. venue WiFi) don't share one bucket and lock each other out. A single
    account still gets throttled correctly if someone spams login attempts
    against it. Falls back to IP alone if the body can't be read for any
    reason — never let a parsing issue block login entirely.
    """
    try:
        username = getattr(request.state, "_login_username", None)
        if username:
            return f"{get_real_ip(request)}:{username.lower()}"
    except Exception:
        pass
    return get_real_ip(request)

def team_key_func(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        try:
            payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
            team_id = payload.get("teamId")
            if team_id:
                return f"team:{team_id}"
        except JWTError:
            pass
    return get_real_ip(request)

limiter = Limiter(key_func=get_real_ip)


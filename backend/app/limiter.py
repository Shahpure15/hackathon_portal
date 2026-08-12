from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request
from jose import JWTError, jwt
from app.config import settings

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
    return get_remote_address(request)

limiter = Limiter(key_func=get_remote_address)

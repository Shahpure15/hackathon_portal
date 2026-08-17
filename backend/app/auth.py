from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.config import settings
from app.database import get_db
from app.models import User, Role, RefreshToken

# Configure CryptContext: bcrypt is now the primary scheme for all new hashes.
# argon2 is kept as a fallback so existing users' stored hashes remain verifiable
# during the transition — passlib marks argon2 hashes "deprecated" and they get
# lazily upgraded to bcrypt on next successful login (see routers/auth.py login()).
pwd_context = CryptContext(schemes=["bcrypt", "argon2"], deprecated="auto")

# JWT configuration
ALGORITHM = "HS256"
security = HTTPBearer()

class CurrentUser(BaseModel):
    id: str
    eventId: str
    username: str
    role: str
    teamId: Optional[str] = None

# Password Hashing utilities
def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

# Token Creation utilities
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    import uuid
    to_encode = data.copy()
    to_encode.update({"jti": str(uuid.uuid4())})
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_REFRESH_SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# Authentication dependencies
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> CurrentUser:
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        role: str = payload.get("role")
        event_id: str = payload.get("eventId")
        team_id: Optional[str] = payload.get("teamId")
        
        if user_id is None or role is None or event_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Query DB to ensure user exists
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception

    return CurrentUser(
        id=user.id,
        eventId=user.eventId,
        username=user.username,
        role=user.role,
        teamId=user.teamId
    )

# Role Guards
def require_role(allowed_role: Role):
    def dependency(current_user: CurrentUser = Depends(get_current_user)):
        if current_user.role != allowed_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: insufficient permissions"
            )
        return current_user
    return dependency

# Rotate Refresh Token in DB
def rotate_refresh_token(
    db: Session, 
    old_token_str: str, 
    user_id: str, 
    event_id: str, 
    team_id: Optional[str] = None
) -> tuple[str, str]:
    """
    Revokes the old refresh token, generates a new pair of access and refresh tokens,
    and stores the new refresh token in the database.
    """
    # 1. Verify old token exists, is not revoked, and is not expired
    old_token = db.query(RefreshToken).filter(RefreshToken.token == old_token_str).first()
    if not old_token or old_token.revoked or old_token.expiresAt < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )
    
    # 2. Revoke old token
    old_token.revoked = True
    
    # 3. Generate new tokens
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
         raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
         
    token_payload = {
        "sub": user.id,
        "role": user.role,
        "eventId": event_id,
    }
    if team_id:
        token_payload["teamId"] = team_id
        
    new_access_token = create_access_token(data=token_payload)
    new_refresh_token_str = create_refresh_token(data={"sub": user.id})
    
    # 4. Save new refresh token in DB
    expires_at = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    new_db_token = RefreshToken(
        token=new_refresh_token_str,
        userId=user.id,
        expiresAt=expires_at
    )
    db.add(new_db_token)
    db.commit()
    
    return new_access_token, new_refresh_token_str

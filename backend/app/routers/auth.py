from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel

from app.database import get_db
from app.models import User, RefreshToken
from app.schemas import UserLogin, TokenResponse
from app.config import settings
from app.auth import (
    verify_password, get_password_hash, create_access_token, 
    create_refresh_token, rotate_refresh_token, get_current_user, CurrentUser,
    pwd_context
)
from app.limiter import limiter, login_key_func

router = APIRouter(prefix="/auth", tags=["auth"])

# A pre-computed bcrypt hash of "dummy" to run verifying check for timing-attack safety
DUMMY_HASH = "$2b$12$QeSL4DyEE6fPuAJYx2W4Ke8XFnX0X1yL3tpyufi1FPV8MeZHwESdi"

def _revoke_all_sessions(db: Session, user_id: str):
    db.query(RefreshToken).filter(
        RefreshToken.userId == user_id,
        RefreshToken.revoked == False
    ).update({"revoked": True})

@router.post("/login", response_model=TokenResponse)
@limiter.limit("300/minute", key_func=login_key_func)
def login(
    request: Request,
    login_data: UserLogin, 
    response: Response, 
    db: Session = Depends(get_db)
):
    # Make the submitted username available to login_key_func (see limiter.py) —
    # slowapi evaluates the key func before this function body runs for the
    # rate-limit check itself, but FastAPI has already parsed login_data by then,
    # so we stash it on request.state for the key func to read.
    request.state._login_username = login_data.username

    # Retrieve user case-insensitively
    user = db.query(User).filter(
        func.lower(User.username) == func.lower(login_data.username)
    ).first()

    if not user:
        # Prevent timing attack by running verify_password on DUMMY_HASH
        verify_password(login_data.password, DUMMY_HASH)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )

    # Verify password, and lazily upgrade the stored hash if it's on a
    # deprecated scheme (i.e. still argon2) — this migrates users to bcrypt
    # transparently, one login at a time, with no forced logout or reset.
    is_valid, new_hash = pwd_context.verify_and_update(login_data.password, user.passwordHash)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )
    if new_hash is not None:
        user.passwordHash = new_hash
        db.commit()

    # Generate payloads
    token_payload = {
        "sub": user.id,
        "role": user.role.value,
        "eventId": user.eventId,
    }
    if user.teamId:
        token_payload["teamId"] = user.teamId

    # Revoke any existing sessions for this user before issuing a new one (single active session)
    _revoke_all_sessions(db, user.id)

    # Create Access & Refresh Tokens
    access_token = create_access_token(data=token_payload)
    refresh_token_str = create_refresh_token(data={"sub": user.id})

    # Save Refresh Token to Database
    expires_at = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    db_refresh_token = RefreshToken(
        token=refresh_token_str,
        userId=user.id,
        expiresAt=expires_at
    )
    db.add(db_refresh_token)
    db.commit()

    # Set HTTP-only Cookie for the Refresh Token
    response.set_cookie(
        key="refresh_token",
        value=refresh_token_str,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600
    )

    return TokenResponse(
        access_token=access_token,
        role=user.role,
        eventId=user.eventId,
        teamId=user.teamId,
        username=user.username
    )

@router.post("/refresh", response_model=TokenResponse)
@limiter.exempt
def refresh(
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    refresh_token_str = request.cookies.get("refresh_token")
    if not refresh_token_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing"
        )

    # 1. Retrieve the token record to find the user ID
    token_record = db.query(RefreshToken).filter(RefreshToken.token == refresh_token_str).first()
    if not token_record or token_record.revoked or token_record.expiresAt < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )

    # 2. Get user info
    user = db.query(User).filter(User.id == token_record.userId).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    # 3. Perform rotation (revokes old token, adds new one, commits)
    new_access, new_refresh = rotate_refresh_token(
        db=db,
        old_token_str=refresh_token_str,
        user_id=user.id,
        event_id=user.eventId,
        team_id=user.teamId
    )

    # 4. Set the new refresh token cookie
    response.set_cookie(
        key="refresh_token",
        value=new_refresh,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600
    )

    return TokenResponse(
        access_token=new_access,
        role=user.role,
        eventId=user.eventId,
        teamId=user.teamId,
        username=user.username
    )

@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    refresh_token_str = request.cookies.get("refresh_token")
    if refresh_token_str:
        # Find and revoke token record
        token_record = db.query(RefreshToken).filter(RefreshToken.token == refresh_token_str).first()
        if token_record:
            token_record.revoked = True
            db.commit()

    # Clear refresh token cookie
    response.delete_cookie(
        key="refresh_token",
        httponly=True,
        secure=True,
        samesite="none"
    )
    return {"message": "Logged out successfully"}


class ChangePasswordRequest(BaseModel):
    oldPassword: str
    newPassword: str

@router.post("/change-password")
def change_password(
    data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if not verify_password(data.oldPassword, user.passwordHash):
        raise HTTPException(status_code=400, detail="Incorrect old password")
        
    if data.newPassword == data.oldPassword:
        raise HTTPException(status_code=400, detail="New password cannot be the same as your current password")
        
    user.passwordHash = get_password_hash(data.newPassword)
    
    # Revoke all refresh tokens for this user
    db.query(RefreshToken).filter(RefreshToken.userId == user.id).update({"revoked": True})
    db.commit()
    
    return {"message": "Password changed successfully"}

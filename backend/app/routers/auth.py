import hashlib
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from pydantic import BaseModel

from app.database import get_db
from app.models import User, RefreshToken, Role, Event, AuthToken, Volunteer
from app.schemas import UserLogin, TokenResponse
from app.dto.invites import AcceptInviteRequest
from app.config import settings
from app.auth import (
    verify_password, get_password_hash, create_access_token, 
    create_refresh_token, rotate_refresh_token, get_current_user, CurrentUser,
    pwd_context
)
from app.limiter import limiter, login_key_func
from app.dto.rbac import AuthMeResponse
from app.permissions import CATALOG
from app.rbac import resolve_access, compute_landing, assign_default_role
from app.services.features import get_event_features, FeaturesConfig

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

    # Event-scoped conclusion check (non-admin users)
    if user.role != Role.ADMIN and user.eventId:
        event = db.query(Event).filter(Event.id == user.eventId).first()
        if event and (event.status == "concluded" or not event.isActive):
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="This event has concluded. The portal is now read-only."
            )

    # Generate payloads
    token_payload = {
        "sub": user.id,
        "role": user.role.value,
        "eventId": user.eventId,
        "tv": getattr(user, "tokenVersion", 1) or 1,
    }
    if user.teamId:
        token_payload["teamId"] = user.teamId

    # Ensure default system role for staff users if missing
    if user.role in (Role.VOLUNTEER, Role.FACULTY, Role.JUDGE) and user.eventId:
        vol = getattr(user, 'volunteer', None)
        if not vol and user.volunteerId:
            vol = db.query(Volunteer).filter(Volunteer.id == user.volunteerId).first()
        assign_default_role(db, user, vol)

    # Allow multiple concurrent active logins for ADMIN role across devices & tabs
    if user.role != Role.ADMIN:
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

    # Ensure default system role for staff users if missing
    if user.role in (Role.VOLUNTEER, Role.FACULTY, Role.JUDGE) and user.eventId:
        vol = getattr(user, 'volunteer', None)
        if not vol and user.volunteerId:
            vol = db.query(Volunteer).filter(Volunteer.id == user.volunteerId).first()
        assign_default_role(db, user, vol)

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
    oldPassword: Optional[str] = None
    currentPassword: Optional[str] = None
    newPassword: str


class ChangeUsernameRequest(BaseModel):
    newUsername: str
    password: Optional[str] = None


@router.get("/check-username")
def check_username(
    username: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    cleaned = (username or "").strip()
    if not cleaned or len(cleaned) < 3:
        return {"available": False, "message": "Username must be at least 3 characters"}

    import re
    if not re.match(r'^[a-zA-Z0-9_.-]+$', cleaned):
        return {"available": False, "message": "Username may only contain letters, numbers, underscores, dashes, and periods"}

    # If it's already the current user's username
    if cleaned.lower() == current_user.username.lower():
        return {"available": True, "message": "This is your current username", "isCurrent": True}

    query = db.query(User).filter(User.id != current_user.id, func.lower(User.username) == cleaned.lower())
    if current_user.eventId:
        query = query.filter((User.eventId == current_user.eventId) | (User.eventId.is_(None)))
    existing = query.first()

    if existing:
        return {"available": False, "message": "Username is already taken"}

    return {"available": True, "message": "Username is available"}


@router.post("/change-username")
def change_username(
    data: ChangeUsernameRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    new_username = (data.newUsername or "").strip()
    if len(new_username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters long.")

    import re
    if not re.match(r'^[a-zA-Z0-9_.-]+$', new_username):
        raise HTTPException(status_code=400, detail="Username may only contain letters, numbers, underscores, dashes, and periods.")

    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if new_username.lower() == user.username.lower():
        raise HTTPException(status_code=400, detail="New username cannot be the same as your current username.")

    # Optional password confirmation if user has passwordHash
    if data.password:
        if not verify_password(data.password, user.passwordHash):
            raise HTTPException(status_code=400, detail="Incorrect password.")

    # Check uniqueness (scoped to event and global admins)
    query = db.query(User).filter(User.id != user.id, func.lower(User.username) == new_username.lower())
    if user.eventId:
        query = query.filter((User.eventId == user.eventId) | (User.eventId.is_(None)))
    existing = query.first()
    if existing:
        raise HTTPException(status_code=400, detail="Username is already taken.")

    old_username = user.username
    user.username = new_username
    db.commit()

    return {
        "status": "success",
        "message": "Username updated successfully.",
        "username": user.username,
        "oldUsername": old_username
    }


@router.post("/change-password")
def change_password(
    data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    new_pw = (data.newPassword or "").strip()
    if len(new_pw) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters long.")

    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_pw = data.currentPassword or data.oldPassword
    if old_pw:
        if not verify_password(old_pw, user.passwordHash):
            raise HTTPException(status_code=400, detail="Current password is incorrect.")
        if new_pw == old_pw:
            raise HTTPException(status_code=400, detail="New password cannot be the same as your current password.")
    else:
        if user.passwordHash:
            raise HTTPException(status_code=400, detail="Current password is required.")

    user.passwordHash = get_password_hash(new_pw)

    # Revoke all refresh tokens for this user
    db.query(RefreshToken).filter(RefreshToken.userId == user.id).update({"revoked": True})
    db.commit()

    return {"message": "Password changed successfully"}



@router.get("/me", response_model=AuthMeResponse)
def get_me(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    role_val = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
    is_admin = (current_user.role == Role.ADMIN) or (role_val.upper() == Role.ADMIN.value.upper())

    if is_admin:
        role_names = ['Admin']
        permissions = sorted(list(CATALOG.keys()))
        scope = {'teams': {'mode': 'all', 'ids': []}}
        landing = compute_landing(role_val, set(permissions), True)
    elif role_val.upper() in (Role.VOLUNTEER.value, Role.FACULTY.value, Role.JUDGE.value):
        access = resolve_access(db, current_user)
        role_names = list(access.role_names or [])
        permissions = sorted(list(access.permissions))
        if access.team_scope_all:
            scope = {'teams': {'mode': 'all', 'ids': []}}
        elif access.pod_ids and not access.panel_ids:
            scope = {'teams': {'mode': 'pods', 'ids': sorted(list(access.pod_ids))}}
        elif access.panel_ids and not access.pod_ids:
            scope = {'teams': {'mode': 'panels', 'ids': sorted(list(access.panel_ids))}}
        elif access.pod_ids and access.panel_ids:
            scope = {'teams': {'mode': 'mixed', 'ids': sorted(list(access.pod_ids | access.panel_ids))}}
        else:
            scope = {'teams': {'mode': 'all', 'ids': []}}
        landing = compute_landing(role_val, access.permissions, False)

        # Dynamic fallback if no explicit RBAC role name was assigned but user has permissions
        if not role_names and access.permissions:
            vol = getattr(current_user, 'volunteer', None)
            if not vol and getattr(current_user, 'volunteerId', None):
                vol = db.query(Volunteer).filter(Volunteer.id == current_user.volunteerId).first()
            if vol and getattr(vol, 'type', None):
                type_val = getattr(vol.type, 'value', str(vol.type))
                role_names = [type_val.capitalize()]
            elif landing == 'judge' or 'evaluation.score' in access.permissions:
                role_names = ['Judge']
            elif landing == 'staff':
                role_names = ['Faculty Lead']
            else:
                role_names = ['Volunteer']
    else:
        role_names = []
        permissions = []
        scope = {'teams': {'mode': 'all', 'ids': []}}
        landing = compute_landing(role_val, set(), False)

    if current_user.eventId:
        features_config = get_event_features(db, current_user.eventId)
        features_dict = features_config.model_dump()
    else:
        features_dict = FeaturesConfig().model_dump()

    return AuthMeResponse(
        username=current_user.username,
        role=role_val,
        eventId=current_user.eventId,
        teamId=current_user.teamId,
        status=getattr(current_user, 'status', 'active'),
        isAdmin=is_admin,
        roleNames=role_names,
        permissions=permissions,
        scope=scope,
        features=features_dict,
        moduleGates={},
        landing=landing
    )


@router.get("/invite-info")
@limiter.limit("10/minute")
def get_invite_info(
    request: Request,
    token: str,
    db: Session = Depends(get_db)
):
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    now = datetime.utcnow()
    tok_row = (
        db.query(AuthToken)
        .filter(
            AuthToken.tokenHash == token_hash,
            AuthToken.kind == "invite",
            AuthToken.usedAt.is_(None),
            AuthToken.expiresAt > now,
        )
        .first()
    )
    if not tok_row:
        raise HTTPException(status_code=400, detail="This invitation link is invalid or has expired.")

    user = db.query(User).filter(User.id == tok_row.userId).first()
    if not user:
        raise HTTPException(status_code=400, detail="This invitation link is invalid or has expired.")

    volunteer = db.query(Volunteer).filter(Volunteer.id == user.volunteerId).first() if user.volunteerId else None
    event = db.query(Event).filter(Event.id == user.eventId).first()

    return {
        "recipientName": volunteer.name if volunteer else user.username,
        "eventName": event.name if event else "",
        "username": user.username,
    }


@router.post("/accept-invite")
@limiter.limit("10/minute")
def accept_invite(
    request: Request,
    payload: AcceptInviteRequest,
    db: Session = Depends(get_db)
):
    GENERIC_ERR = "This invitation link is invalid or has expired."
    token_hash = hashlib.sha256(payload.token.encode()).hexdigest()
    now = datetime.utcnow()
    tok_row = (
        db.query(AuthToken)
        .filter(
            AuthToken.tokenHash == token_hash,
            AuthToken.kind == "invite",
            AuthToken.usedAt.is_(None),
            AuthToken.expiresAt > now,
        )
        .first()
    )
    if not tok_row:
        raise HTTPException(status_code=400, detail=GENERIC_ERR)

    user = db.query(User).filter(User.id == tok_row.userId).first()
    if not user:
        raise HTTPException(status_code=400, detail=GENERIC_ERR)

    pw = payload.password or ""
    if len(pw) < 8:
        raise HTTPException(status_code=400, detail=GENERIC_ERR)

    user.passwordHash = get_password_hash(pw)
    user.status = "active"
    tok_row.usedAt = now

    # Invalidate other invite tokens for this user
    db.query(AuthToken).filter(
        AuthToken.userId == user.id,
        AuthToken.kind == "invite",
        AuthToken.id != tok_row.id,
    ).update({"usedAt": now})

    db.commit()
    return {"ok": True}

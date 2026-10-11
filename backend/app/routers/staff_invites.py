from datetime import datetime, timedelta
import hashlib
import secrets
from typing import Dict, List, Optional, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_password_hash
from app.config import settings
from app.database import get_db
from app.dto.invites import (
    StaffEmailUpdateDTO,
    StaffInviteRequest,
    StaffAccessItemDTO,
)
from app.models import (
    Event,
    Volunteer,
    User,
    Role,
    RbacRole,
    UserRoleAssignment,
    AuthToken,
    SmtpAccount,
    EmailOutbox,
)
from app.rbac import Principal, require_permission
from app.routers.admin import log_audit
from app.services.email_outbox import enqueue_email

router = APIRouter(prefix="/admin/staff", tags=["staff-invites"])


@router.put("/{volunteer_id}/email")
def update_volunteer_email(
    volunteer_id: str,
    payload: StaffEmailUpdateDTO,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("staff.manage")),
):
    v = (
        db.query(Volunteer)
        .filter(Volunteer.id == volunteer_id, Volunteer.eventId == current_user.eventId)
        .first()
    )
    if not v:
        raise HTTPException(status_code=404, detail="Volunteer not found")

    email_clean = payload.email.strip()
    if not email_clean or "@" not in email_clean:
        raise HTTPException(status_code=422, detail="Invalid email address")

    old_email = v.email
    v.email = email_clean
    db.commit()

    log_audit(
        db,
        current_user.username,
        "update_volunteer_email",
        "volunteer",
        volunteer_id,
        diff={"old_email": old_email, "new_email": email_clean},
        event_id=current_user.eventId,
    )
    return {"ok": True, "volunteerId": volunteer_id, "email": email_clean}


@router.get("/access", response_model=List[StaffAccessItemDTO])
def list_staff_access(
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("staff.view")),
):
    volunteers = (
        db.query(Volunteer)
        .filter(Volunteer.eventId == current_user.eventId)
        .order_by(Volunteer.name.asc())
        .all()
    )

    vol_ids = [v.id for v in volunteers]
    users = {u.volunteerId: u for u in db.query(User).filter(User.volunteerId.in_(vol_ids)).all()}
    user_ids = [u.id for u in users.values()]

    assignments = (
        db.query(UserRoleAssignment.userId, RbacRole.name)
        .join(RbacRole, UserRoleAssignment.roleId == RbacRole.id)
        .filter(UserRoleAssignment.userId.in_(user_ids))
        .all()
    )
    roles_by_user: Dict[str, List[str]] = {}
    for uid, rname in assignments:
        roles_by_user.setdefault(uid, []).append(rname)

    # Latest invite timestamp per user
    tokens = (
        db.query(AuthToken.userId, AuthToken.createdAt)
        .filter(AuthToken.userId.in_(user_ids), AuthToken.kind == "invite")
        .order_by(AuthToken.createdAt.desc())
        .all()
    )
    invite_times: Dict[str, datetime] = {}
    for uid, created_at in tokens:
        if uid not in invite_times:
            invite_times[uid] = created_at

    out = []
    for v in volunteers:
        u = users.get(v.id)
        out.append(
            StaffAccessItemDTO(
                volunteerId=v.id,
                name=v.name,
                type=v.type,
                email=v.email,
                userId=u.id if u else None,
                username=u.username if u else None,
                status=u.status if u else None,
                inviteSentAt=invite_times.get(u.id) if u else None,
                roleNames=roles_by_user.get(u.id, []) if u else [],
            )
        )
    return out


def _send_invite_for_volunteer(
    db: Session,
    v: Volunteer,
    current_user: Principal,
    role_id: Optional[str] = None,
    scope: Optional[dict] = None,
) -> dict:
    if not v.email or not v.email.strip():
        raise HTTPException(status_code=400, detail="Staff member does not have an email address configured.")

    if not settings.FRONTEND_BASE_URL or not settings.FRONTEND_BASE_URL.strip():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is not configured (FRONTEND_BASE_URL missing)."
        )

    ev = db.query(Event).filter(Event.id == current_user.eventId).first()
    org_id = ev.orgId if ev else None
    has_account = db.query(SmtpAccount).filter(SmtpAccount.status == "active").first() is not None
    if not has_account:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is not configured (no active SMTP account)."
        )

    from app.rbac import ensure_system_roles
    ensure_system_roles(db, current_user.eventId)

    # Determine role
    role = None
    if role_id:
        role = db.query(RbacRole).filter(RbacRole.id == role_id, RbacRole.eventId == current_user.eventId).first()
        if not role:
            raise HTTPException(status_code=404, detail="Selected role not found")
    else:
        target_key = "judge" if v.type.upper() == "JUDGE" else "volunteer"
        role = (
            db.query(RbacRole)
            .filter(RbacRole.eventId == current_user.eventId, RbacRole.systemKey == target_key)
            .first()
        )
        if not role:
            role = db.query(RbacRole).filter(RbacRole.eventId == current_user.eventId).first()

    if not role:
        raise HTTPException(status_code=400, detail="No suitable role found to assign")

    user = db.query(User).filter(User.volunteerId == v.id).first()
    target_username = v.email.strip().lower()

    if user:
        if getattr(user, "status", "active") == "active":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User account is already active. Use password reset if needed."
            )
    else:
        # Check username clash in event
        clash = (
            db.query(User)
            .filter(User.eventId == current_user.eventId, User.username == target_username)
            .first()
        )
        if clash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Username '{target_username}' already exists in this event."
            )

        user = User(
            eventId=current_user.eventId,
            username=target_username,
            passwordHash=get_password_hash(secrets.token_hex(32)),
            role=Role.VOLUNTEER,
            volunteerId=v.id,
            status="invited",
        )
        db.add(user)
        db.flush()

    # Assign role
    assign = (
        db.query(UserRoleAssignment)
        .filter(UserRoleAssignment.userId == user.id, UserRoleAssignment.roleId == role.id)
        .first()
    )
    if not assign:
        assign = UserRoleAssignment(
            eventId=current_user.eventId,
            userId=user.id,
            roleId=role.id,
            scope=scope or {"teams": {"mode": "all", "ids": []}},
            createdBy=current_user.username,
        )
        db.add(assign)
        db.flush()

    now = datetime.utcnow()
    # Expire previous invite tokens
    db.query(AuthToken).filter(AuthToken.userId == user.id, AuthToken.kind == "invite").update({"usedAt": now})

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    expires_at = now + timedelta(hours=72)

    auth_token = AuthToken(
        eventId=current_user.eventId,
        userId=user.id,
        kind="invite",
        tokenHash=token_hash,
        expiresAt=expires_at,
        createdAt=now,
    )
    db.add(auth_token)
    db.flush()

    invite_link = settings.FRONTEND_BASE_URL.rstrip("/") + "/accept-invite?token=" + raw_token
    event_name = ev.name if ev else "Event"

    enqueue_email(
        db=db,
        event_id=current_user.eventId,
        to_email=v.email,
        template_key="staff_invite",
        context={
            "recipient_name": v.name,
            "event_name": event_name,
            "invite_link": invite_link,
            "expires_at": "72 hours",
        },
        category="critical",
        expires_in_minutes=4320,
        to_user_id=user.id,
        created_by=current_user.username,
    )

    db.commit()

    log_audit(
        db,
        current_user.username,
        "send_staff_invite",
        "volunteer",
        v.id,
        diff={"username": user.username, "email": v.email},
        event_id=current_user.eventId,
    )

    return {"ok": True, "username": user.username, "invited": True}


@router.post("/{volunteer_id}/invite")
def invite_staff_member(
    volunteer_id: str,
    payload: StaffInviteRequest,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("staff.invite")),
):
    v = (
        db.query(Volunteer)
        .filter(Volunteer.id == volunteer_id, Volunteer.eventId == current_user.eventId)
        .first()
    )
    if not v:
        raise HTTPException(status_code=404, detail="Volunteer not found")

    return _send_invite_for_volunteer(
        db=db,
        v=v,
        current_user=current_user,
        role_id=payload.roleId,
        scope=payload.scope,
    )


@router.post("/{volunteer_id}/invite/resend")
def resend_staff_invite(
    volunteer_id: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("staff.invite")),
):
    v = (
        db.query(Volunteer)
        .filter(Volunteer.id == volunteer_id, Volunteer.eventId == current_user.eventId)
        .first()
    )
    if not v:
        raise HTTPException(status_code=404, detail="Volunteer not found")

    user = db.query(User).filter(User.volunteerId == v.id).first()
    if not user or user.status != "invited":
        raise HTTPException(status_code=400, detail="Volunteer does not have a pending invitation")

    return _send_invite_for_volunteer(db=db, v=v, current_user=current_user)

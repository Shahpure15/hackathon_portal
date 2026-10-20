from collections import defaultdict
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dto.rbac_admin import (
    CatalogResponse,
    ModuleCatalogGroup,
    PermissionCatalogItem,
    RoleCreateRequest,
    RoleFromTemplateRequest,
    RoleMemberAddRequest,
    RoleMemberResponse,
    RoleMemberUpdateScopeRequest,
    RoleResponse,
    RoleTemplateCreateFromRoleRequest,
    RoleTemplateResponse,
    RoleUpdateRequest,
)
from app.models import (
    Event,
    Panel,
    Pod,
    RbacRole,
    RolePermission,
    RoleTemplate,
    User,
    UserRoleAssignment,
    Volunteer,
    RefreshToken,
)
from app.permissions import (
    CATALOG,
    CATALOG_LIST,
    SENSITIVE,
    expand_permissions,
    is_assignable,
)
from app.rbac import (
    Principal,
    ensure_system_roles,
    invalidate_all,
    require_permission,
)
from app.routers.admin import log_audit
from app.services.features import get_event_features
from app.services.tenancy import get_default_org

router = APIRouter(prefix="/admin/rbac", tags=["RBAC Admin"])

RESERVED_ROLE_NAMES = {"admin", "team leader"}


def _get_org_id(db: Session, event_id: str) -> str:
    event = db.query(Event).filter(Event.id == event_id).first()
    if event and event.orgId:
        return event.orgId
    default_org = get_default_org(db)
    if default_org:
        return default_org.id
    raise HTTPException(status_code=500, detail="No organization configured for this event")


def _validate_role_name(db: Session, event_id: str, name: str, exclude_role_id: Optional[str] = None) -> str:
    trimmed = name.strip()
    if not (2 <= len(trimmed) <= 100):
        raise HTTPException(status_code=422, detail="Role name must be between 2 and 100 characters")
    if any(ord(c) < 32 for c in trimmed):
        raise HTTPException(status_code=422, detail="Role name cannot contain control characters")
    if trimmed.lower() in RESERVED_ROLE_NAMES:
        raise HTTPException(status_code=422, detail=f"The name '{trimmed}' is reserved")

    query = db.query(RbacRole).filter(
        RbacRole.eventId == event_id,
        func.lower(RbacRole.name) == func.lower(trimmed),
    )
    if exclude_role_id:
        query = query.filter(RbacRole.id != exclude_role_id)
    if query.first():
        raise HTTPException(status_code=409, detail="A role with this name already exists in this event")
    return trimmed


def _validate_permissions(
    principal: Principal,
    permissions: List[str],
    confirm_sensitive: bool = False,
) -> List[str]:
    unique_keys = list(dict.fromkeys(permissions))
    for k in unique_keys:
        if k not in CATALOG:
            raise HTTPException(status_code=422, detail=f"Unknown permission: {k}")
        if not is_assignable(k):
            raise HTTPException(status_code=422, detail=f"Permission '{k}' is not assignable to custom roles")
        if not principal.has(k):
            raise HTTPException(status_code=403, detail=f"Cannot grant permission '{k}' not held by caller")

    sensitive_keys = [k for k in unique_keys if CATALOG[k].tier == SENSITIVE]
    if sensitive_keys and not confirm_sensitive:
        raise HTTPException(
            status_code=422,
            detail=f"Sensitive permissions require confirmation: {', '.join(sensitive_keys)}",
        )
    return unique_keys


def _canonicalize_scope(db: Session, event_id: str, raw_scope: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not raw_scope:
        return {"teams": {"mode": "all", "ids": []}}

    teams_scope = raw_scope.get("teams", raw_scope)
    mode = str(teams_scope.get("mode", "all")).lower()
    raw_ids = teams_scope.get("ids", [])
    if not isinstance(raw_ids, list):
        raw_ids = []

    if mode not in ("all", "pods", "panels"):
        raise HTTPException(status_code=422, detail=f"Invalid scope mode: {mode}")

    if mode == "all":
        ids: List[str] = []
    elif mode == "pods":
        features = get_event_features(db, event_id)
        if not features.pods:
            raise HTTPException(status_code=422, detail="Pods feature is disabled for this event")
        valid_pods = set(p[0] for p in db.query(Pod.id).filter(Pod.eventId == event_id).all())
        for pid in raw_ids:
            if pid not in valid_pods:
                raise HTTPException(status_code=404, detail=f"Pod {pid} not found in this event")
        ids = sorted(list(set(raw_ids)))
    elif mode == "panels":
        valid_panels = set(p[0] for p in db.query(Panel.id).filter(Panel.eventId == event_id).all())
        for pid in raw_ids:
            if pid not in valid_panels:
                raise HTTPException(status_code=404, detail=f"Panel {pid} not found in this event")
        ids = sorted(list(set(raw_ids)))
    else:
        ids = []

    return {"teams": {"mode": mode, "ids": ids}}


def _format_role_response(db: Session, role: RbacRole) -> RoleResponse:
    perms = [rp.permissionKey for rp in role.permissions]
    expanded = expand_permissions(perms)
    member_count = db.query(UserRoleAssignment).filter(UserRoleAssignment.roleId == role.id).count()
    return RoleResponse(
        id=role.id,
        name=role.name,
        description=role.description,
        isSystem=role.isSystem,
        systemKey=role.systemKey,
        sourceTemplateId=role.sourceTemplateId,
        permissions=perms,
        expandedCount=len(expanded),
        memberCount=member_count,
        createdAt=role.createdAt,
        updatedAt=role.updatedAt,
    )


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------

@router.get("/catalog", response_model=CatalogResponse)
def get_catalog(
    current_user: Principal = Depends(require_permission("role.manage")),
):
    by_module: Dict[str, List[PermissionCatalogItem]] = defaultdict(list)
    all_items: List[PermissionCatalogItem] = []

    for p in CATALOG_LIST:
        item = PermissionCatalogItem(
            key=p.key,
            label=p.label,
            module=p.module,
            tier=p.tier,
            scopable=p.scopable,
            implies=list(p.implies),
            assignable=is_assignable(p.key),
            future=p.future,
        )
        by_module[p.module].append(item)
        all_items.append(item)

    modules = [
        ModuleCatalogGroup(module=mod_name, permissions=perms)
        for mod_name, perms in by_module.items()
    ]
    return CatalogResponse(modules=modules, permissions=all_items)


# ---------------------------------------------------------------------------
# Roles CRUD
# ---------------------------------------------------------------------------

@router.get("/roles", response_model=List[RoleResponse])
def get_roles(
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("role.manage")),
):
    ensure_system_roles(db, current_user.eventId)
    roles = (
        db.query(RbacRole)
        .filter(RbacRole.eventId == current_user.eventId)
        .order_by(RbacRole.name)
        .all()
    )
    return [_format_role_response(db, r) for r in roles]


@router.post("/roles", response_model=RoleResponse, status_code=201)
def create_role(
    payload: RoleCreateRequest,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("role.manage")),
):
    clean_name = _validate_role_name(db, current_user.eventId, payload.name)
    valid_perms = _validate_permissions(current_user, payload.permissions, payload.confirmSensitive)

    role = RbacRole(
        eventId=current_user.eventId,
        name=clean_name,
        description=payload.description.strip() if payload.description else None,
        isSystem=False,
    )
    db.add(role)
    db.flush()

    for k in valid_perms:
        db.add(RolePermission(roleId=role.id, permissionKey=k))

    db.commit()
    db.refresh(role)

    invalidate_all()
    log_audit(
        db,
        current_user.id,
        "rbac.role_create",
        "RbacRole",
        role.id,
        {"name": role.name, "permissions": valid_perms},
        event_id=current_user.eventId,
    )
    return _format_role_response(db, role)


@router.put("/roles/{role_id}", response_model=RoleResponse)
def update_role(
    role_id: str,
    payload: RoleUpdateRequest,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("role.manage")),
):
    role = (
        db.query(RbacRole)
        .filter(RbacRole.id == role_id, RbacRole.eventId == current_user.eventId)
        .first()
    )
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    diff: Dict[str, Any] = {}

    if payload.name is not None:
        trimmed = payload.name.strip()
        if role.isSystem and trimmed.lower() != role.name.lower():
            raise HTTPException(status_code=409, detail="System roles cannot be renamed")
        if not role.isSystem:
            clean_name = _validate_role_name(db, current_user.eventId, trimmed, exclude_role_id=role.id)
            if clean_name != role.name:
                diff["name"] = clean_name
                role.name = clean_name

    if payload.description is not None:
        clean_desc = payload.description.strip() if payload.description else None
        if clean_desc != role.description:
            diff["description"] = clean_desc
            role.description = clean_desc

    if payload.permissions is not None:
        valid_perms = _validate_permissions(current_user, payload.permissions, payload.confirmSensitive)
        db.query(RolePermission).filter(RolePermission.roleId == role.id).delete()
        for k in valid_perms:
            db.add(RolePermission(roleId=role.id, permissionKey=k))
        diff["permissions"] = valid_perms

    db.commit()
    db.refresh(role)

    invalidate_all()
    log_audit(
        db,
        current_user.id,
        "rbac.role_update",
        "RbacRole",
        role.id,
        diff,
        event_id=current_user.eventId,
    )
    return _format_role_response(db, role)


@router.delete("/roles/{role_id}")
def delete_role(
    role_id: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("role.manage")),
):
    role = (
        db.query(RbacRole)
        .filter(RbacRole.id == role_id, RbacRole.eventId == current_user.eventId)
        .first()
    )
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    if role.isSystem:
        raise HTTPException(status_code=409, detail="System roles cannot be deleted")

    member_count = db.query(UserRoleAssignment).filter(UserRoleAssignment.roleId == role.id).count()
    if member_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete role with {member_count} active member(s)",
        )

    db.delete(role)
    db.commit()

    invalidate_all()
    log_audit(
        db,
        current_user.id,
        "rbac.role_delete",
        "RbacRole",
        role_id,
        {"name": role.name},
        event_id=current_user.eventId,
    )
    return {"message": "Role deleted successfully"}


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

@router.get("/templates", response_model=List[RoleTemplateResponse])
def get_templates(
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("role.manage")),
):
    org_id = _get_org_id(db, current_user.eventId)
    templates = (
        db.query(RoleTemplate)
        .filter(RoleTemplate.orgId == org_id)
        .order_by(RoleTemplate.name)
        .all()
    )
    return [
        RoleTemplateResponse(
            id=t.id,
            orgId=t.orgId,
            name=t.name,
            description=t.description,
            permissions=t.permissions or [],
            createdFromRoleId=t.createdFromRoleId,
            createdAt=t.createdAt,
        )
        for t in templates
    ]


@router.post("/templates/from-role", response_model=RoleTemplateResponse, status_code=201)
def create_template_from_role(
    payload: RoleTemplateCreateFromRoleRequest,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("role.manage")),
):
    role = (
        db.query(RbacRole)
        .filter(RbacRole.id == payload.roleId, RbacRole.eventId == current_user.eventId)
        .first()
    )
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    org_id = _get_org_id(db, current_user.eventId)
    name = (payload.name or role.name).strip()
    if not (2 <= len(name) <= 100):
        raise HTTPException(status_code=422, detail="Template name must be between 2 and 100 characters")

    existing = (
        db.query(RoleTemplate)
        .filter(RoleTemplate.orgId == org_id, func.lower(RoleTemplate.name) == func.lower(name))
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="A template with this name already exists in this organization")

    explicit_perms = [rp.permissionKey for rp in role.permissions]
    desc = payload.description.strip() if payload.description else role.description

    template = RoleTemplate(
        orgId=org_id,
        name=name,
        description=desc,
        permissions=explicit_perms,
        createdFromRoleId=role.id,
    )
    db.add(template)
    db.commit()
    db.refresh(template)

    log_audit(
        db,
        current_user.id,
        "rbac.template_create",
        "RoleTemplate",
        template.id,
        {"name": template.name, "permissions": explicit_perms},
        event_id=current_user.eventId,
    )

    return RoleTemplateResponse(
        id=template.id,
        orgId=template.orgId,
        name=template.name,
        description=template.description,
        permissions=template.permissions or [],
        createdFromRoleId=template.createdFromRoleId,
        createdAt=template.createdAt,
    )


@router.delete("/templates/{template_id}")
def delete_template(
    template_id: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("role.manage")),
):
    org_id = _get_org_id(db, current_user.eventId)
    template = (
        db.query(RoleTemplate)
        .filter(RoleTemplate.id == template_id, RoleTemplate.orgId == org_id)
        .first()
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    db.delete(template)
    db.commit()

    log_audit(
        db,
        current_user.id,
        "rbac.template_delete",
        "RoleTemplate",
        template_id,
        {"name": template.name},
        event_id=current_user.eventId,
    )
    return {"message": "Template deleted successfully"}


@router.post("/roles/from-template", response_model=RoleResponse, status_code=201)
def create_role_from_template(
    payload: RoleFromTemplateRequest,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("role.manage")),
):
    org_id = _get_org_id(db, current_user.eventId)
    template = (
        db.query(RoleTemplate)
        .filter(RoleTemplate.id == payload.templateId, RoleTemplate.orgId == org_id)
        .first()
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    name = (payload.name or template.name).strip()
    clean_name = _validate_role_name(db, current_user.eventId, name)

    role = RbacRole(
        eventId=current_user.eventId,
        name=clean_name,
        description=template.description,
        isSystem=False,
        sourceTemplateId=template.id,
    )
    db.add(role)
    db.flush()

    for k in (template.permissions or []):
        if k in CATALOG:
            db.add(RolePermission(roleId=role.id, permissionKey=k))

    db.commit()
    db.refresh(role)

    invalidate_all()
    log_audit(
        db,
        current_user.id,
        "rbac.role_create_from_template",
        "RbacRole",
        role.id,
        {"name": role.name, "sourceTemplateId": template.id},
        event_id=current_user.eventId,
    )
    return _format_role_response(db, role)


# ---------------------------------------------------------------------------
# Members & Scoped Assignments
# ---------------------------------------------------------------------------

@router.get("/roles/{role_id}/members", response_model=List[RoleMemberResponse])
def get_role_members(
    role_id: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("role.manage")),
):
    role = (
        db.query(RbacRole)
        .filter(RbacRole.id == role_id, RbacRole.eventId == current_user.eventId)
        .first()
    )
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    records = (
        db.query(UserRoleAssignment, User, Volunteer)
        .join(User, UserRoleAssignment.userId == User.id)
        .outerjoin(Volunteer, User.volunteerId == Volunteer.id)
        .filter(UserRoleAssignment.roleId == role.id, UserRoleAssignment.eventId == current_user.eventId)
        .all()
    )

    results: List[RoleMemberResponse] = []
    for assignment, user, volunteer in records:
        name = volunteer.name if volunteer else user.username
        v_type = volunteer.type.value if (volunteer and hasattr(volunteer.type, "value")) else (str(volunteer.type) if volunteer else "STAFF")
        user_role_count = (
            db.query(UserRoleAssignment)
            .filter(UserRoleAssignment.userId == user.id, UserRoleAssignment.eventId == current_user.eventId)
            .count()
        )
        results.append(
            RoleMemberResponse(
                userId=user.id,
                volunteerId=volunteer.id if volunteer else None,
                name=name,
                type=v_type,
                scope=assignment.scope,
                roleCount=user_role_count,
            )
        )
    return results


@router.post("/roles/{role_id}/members", response_model=RoleMemberResponse, status_code=201)
def add_role_member(
    role_id: str,
    payload: RoleMemberAddRequest,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("role.manage")),
):
    role = (
        db.query(RbacRole)
        .filter(RbacRole.id == role_id, RbacRole.eventId == current_user.eventId)
        .first()
    )
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    volunteer = (
        db.query(Volunteer)
        .filter(Volunteer.id == payload.volunteerId, Volunteer.eventId == current_user.eventId)
        .first()
    )
    if not volunteer:
        raise HTTPException(status_code=404, detail="Volunteer not found")

    if not volunteer.user:
        raise HTTPException(status_code=400, detail="Create a login for this person first")

    user_id = volunteer.user.id

    existing = (
        db.query(UserRoleAssignment)
        .filter(UserRoleAssignment.userId == user_id, UserRoleAssignment.roleId == role.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="User is already assigned to this role")

    canonical_scope = _canonicalize_scope(db, current_user.eventId, payload.scope)

    if role.systemKey:
        other_sys_roles = (
            db.query(RbacRole)
            .filter(
                RbacRole.eventId == current_user.eventId,
                RbacRole.systemKey.isnot(None),
                RbacRole.id != role.id,
            )
            .all()
        )
        other_sys_ids = {r.id for r in other_sys_roles}
        if other_sys_ids:
            conflicting_asgns = (
                db.query(UserRoleAssignment)
                .filter(
                    UserRoleAssignment.userId == user_id,
                    UserRoleAssignment.eventId == current_user.eventId,
                    UserRoleAssignment.roleId.in_(other_sys_ids),
                )
                .all()
            )
            for old_a in conflicting_asgns:
                db.delete(old_a)

        if role.systemKey == "judge":
            volunteer.type = "Judge / Evaluator"
            user.role = Role.JUDGE
        elif role.systemKey == "faculty":
            volunteer.type = "FACULTY"
            user.role = Role.FACULTY
        elif role.systemKey == "volunteer":
            volunteer.type = "Volunteer / Monitor"
            user.role = Role.VOLUNTEER

        # Invalidate any existing active sessions so user logs in with new permissions
        user.tokenVersion = (getattr(user, "tokenVersion", 1) or 1) + 1
        db.query(RefreshToken).filter(
            RefreshToken.userId == user.id,
            RefreshToken.revoked == False
        ).update({"revoked": True})

    assignment = UserRoleAssignment(
        eventId=current_user.eventId,
        userId=user_id,
        roleId=role.id,
        scope=canonical_scope,
        createdBy=current_user.username,
    )
    db.add(assignment)
    db.commit()

    invalidate_all()
    log_audit(
        db,
        current_user.id,
        "rbac.member_add",
        "UserRoleAssignment",
        assignment.id,
        {"userId": user_id, "roleId": role.id, "scope": canonical_scope},
        event_id=current_user.eventId,
    )

    v_type = volunteer.type.value if hasattr(volunteer.type, "value") else str(volunteer.type)
    return RoleMemberResponse(
        userId=user_id,
        volunteerId=volunteer.id,
        name=volunteer.name,
        type=v_type,
        scope=canonical_scope,
    )


@router.put("/roles/{role_id}/members/{user_id}", response_model=RoleMemberResponse)
def update_role_member_scope(
    role_id: str,
    user_id: str,
    payload: RoleMemberUpdateScopeRequest,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("role.manage")),
):
    assignment = (
        db.query(UserRoleAssignment)
        .filter(
            UserRoleAssignment.roleId == role_id,
            UserRoleAssignment.userId == user_id,
            UserRoleAssignment.eventId == current_user.eventId,
        )
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Member assignment not found")

    canonical_scope = _canonicalize_scope(db, current_user.eventId, payload.scope)
    assignment.scope = canonical_scope
    db.commit()

    invalidate_all()
    log_audit(
        db,
        current_user.id,
        "rbac.member_update_scope",
        "UserRoleAssignment",
        assignment.id,
        {"userId": user_id, "roleId": role_id, "scope": canonical_scope},
        event_id=current_user.eventId,
    )

    user = assignment.user
    volunteer = user.volunteer if user else None
    name = volunteer.name if volunteer else (user.username if user else user_id)
    v_type = volunteer.type.value if (volunteer and hasattr(volunteer.type, "value")) else (str(volunteer.type) if volunteer else "STAFF")

    return RoleMemberResponse(
        userId=user_id,
        volunteerId=volunteer.id if volunteer else None,
        name=name,
        type=v_type,
        scope=canonical_scope,
    )


@router.delete("/roles/{role_id}/members/{user_id}")
def remove_role_member(
    role_id: str,
    user_id: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("role.manage")),
):
    assignment = (
        db.query(UserRoleAssignment)
        .filter(
            UserRoleAssignment.roleId == role_id,
            UserRoleAssignment.userId == user_id,
            UserRoleAssignment.eventId == current_user.eventId,
        )
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Member assignment not found")

    db.delete(assignment)
    db.commit()

    invalidate_all()
    log_audit(
        db,
        current_user.id,
        "rbac.member_remove",
        "UserRoleAssignment",
        assignment.id,
        {"userId": user_id, "roleId": role_id},
        event_id=current_user.eventId,
    )
    remaining = (
        db.query(UserRoleAssignment)
        .filter(UserRoleAssignment.userId == user_id, UserRoleAssignment.eventId == current_user.eventId)
        .count()
    )
    return {"message": "Member removed from role", "remainingRoles": remaining}

from datetime import datetime
from typing import Dict, List, Optional, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dto.email import (
    SmtpAccountCreateDTO,
    SmtpAccountUpdateDTO,
    SmtpAccountResponseDTO,
    TestConnectionRequest,
    TemplateUpdateDTO,
    TemplatePreviewRequest,
)
from app.models import Event, Organization, SmtpAccount, EmailTemplate
from app.rbac import Principal, require_permission
from app.routers.admin import log_audit
from app.services.secrets_box import (
    encrypt_secret,
    decrypt_secret,
    is_configured as secrets_configured,
)
from app.services.email_sender import (
    validate_smtp_target,
    test_connection,
    send_message,
)
from app.services.email_templates import (
    TEMPLATE_REGISTRY,
    get_template,
    render_template,
    build_html_body,
)

router = APIRouter(prefix="/admin/email", tags=["email-admin"])


@router.get("/accounts", response_model=List[SmtpAccountResponseDTO])
def list_smtp_accounts(
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("email.manage")),
):
    ev = db.query(Event).filter(Event.id == current_user.eventId).first()
    org_id = ev.orgId if ev else None
    query = db.query(SmtpAccount)
    if org_id:
        query = query.filter(SmtpAccount.orgId == org_id)
    accounts = query.order_by(SmtpAccount.priority.desc(), SmtpAccount.createdAt.asc()).all()

    out = []
    for a in accounts:
        out.append(
            SmtpAccountResponseDTO(
                id=a.id,
                label=a.label,
                host=a.host,
                port=a.port,
                security=a.security,
                username=a.username,
                hasPassword=bool(a.passwordEnc),
                fromEmail=a.fromEmail,
                fromName=a.fromName,
                replyTo=a.replyTo,
                dailyLimit=a.dailyLimit,
                perMinuteLimit=a.perMinuteLimit,
                sentToday=a.sentToday or 0,
                status=a.status,
                lastError=a.lastError,
                priority=a.priority or 0,
                createdAt=a.createdAt,
            )
        )
    return out


@router.post("/accounts", response_model=SmtpAccountResponseDTO)
def create_smtp_account(
    payload: SmtpAccountCreateDTO,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("email.manage")),
):
    if not secrets_configured():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Secrets encryption key is not configured (SECRETS_ENCRYPTION_KEY missing)"
        )

    val_err = validate_smtp_target(payload.host, payload.port)
    if val_err:
        raise HTTPException(status_code=422, detail=val_err)

    ev = db.query(Event).filter(Event.id == current_user.eventId).first()
    org_id = ev.orgId if ev else None
    if not org_id:
        default_org = db.query(Organization).first()
        org_id = default_org.id if default_org else None

    if not org_id:
        raise HTTPException(status_code=400, detail="No organization associated with this event")

    enc_pw = encrypt_secret(payload.password)

    account = SmtpAccount(
        orgId=org_id,
        label=payload.label,
        host=payload.host,
        port=payload.port,
        security=payload.security,
        username=payload.username,
        passwordEnc=enc_pw,
        fromEmail=payload.fromEmail,
        fromName=payload.fromName,
        replyTo=payload.replyTo,
        dailyLimit=payload.dailyLimit,
        perMinuteLimit=payload.perMinuteLimit,
        priority=payload.priority,
        status="active",
        createdAt=datetime.utcnow(),
    )
    db.add(account)
    db.commit()
    db.refresh(account)

    log_audit(
        db,
        current_user.username,
        "create_smtp_account",
        "smtp_account",
        account.id,
        diff={"label": account.label, "host": account.host},
        event_id=current_user.eventId,
    )

    return SmtpAccountResponseDTO(
        id=account.id,
        label=account.label,
        host=account.host,
        port=account.port,
        security=account.security,
        username=account.username,
        hasPassword=True,
        fromEmail=account.fromEmail,
        fromName=account.fromName,
        replyTo=account.replyTo,
        dailyLimit=account.dailyLimit,
        perMinuteLimit=account.perMinuteLimit,
        sentToday=0,
        status=account.status,
        lastError=account.lastError,
        priority=account.priority,
        createdAt=account.createdAt,
    )


@router.put("/accounts/{aid}", response_model=SmtpAccountResponseDTO)
def update_smtp_account(
    aid: str,
    payload: SmtpAccountUpdateDTO,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("email.manage")),
):
    account = db.query(SmtpAccount).filter(SmtpAccount.id == aid).first()
    if not account:
        raise HTTPException(status_code=404, detail="SMTP account not found")

    new_host = payload.host or account.host
    new_port = payload.port if payload.port is not None else account.port
    val_err = validate_smtp_target(new_host, new_port)
    if val_err:
        raise HTTPException(status_code=422, detail=val_err)

    if payload.label is not None:
        account.label = payload.label
    account.host = new_host
    account.port = new_port
    if payload.security is not None:
        account.security = payload.security
    if payload.username is not None:
        account.username = payload.username
    if payload.password:
        if not secrets_configured():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Secrets encryption key is not configured"
            )
        account.passwordEnc = encrypt_secret(payload.password)
    if payload.fromEmail is not None:
        account.fromEmail = payload.fromEmail
    if payload.fromName is not None:
        account.fromName = payload.fromName
    if payload.replyTo is not None:
        account.replyTo = payload.replyTo
    if payload.dailyLimit is not None:
        account.dailyLimit = payload.dailyLimit
    if payload.perMinuteLimit is not None:
        account.perMinuteLimit = payload.perMinuteLimit
    if payload.priority is not None:
        account.priority = payload.priority
    if payload.status is not None:
        account.status = payload.status

    db.commit()
    db.refresh(account)

    log_audit(
        db,
        current_user.username,
        "update_smtp_account",
        "smtp_account",
        account.id,
        diff={"label": account.label},
        event_id=current_user.eventId,
    )

    return SmtpAccountResponseDTO(
        id=account.id,
        label=account.label,
        host=account.host,
        port=account.port,
        security=account.security,
        username=account.username,
        hasPassword=bool(account.passwordEnc),
        fromEmail=account.fromEmail,
        fromName=account.fromName,
        replyTo=account.replyTo,
        dailyLimit=account.dailyLimit,
        perMinuteLimit=account.perMinuteLimit,
        sentToday=account.sentToday or 0,
        status=account.status,
        lastError=account.lastError,
        priority=account.priority or 0,
        createdAt=account.createdAt,
    )


@router.delete("/accounts/{aid}")
def delete_smtp_account(
    aid: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("email.manage")),
):
    account = db.query(SmtpAccount).filter(SmtpAccount.id == aid).first()
    if not account:
        raise HTTPException(status_code=404, detail="SMTP account not found")

    db.delete(account)
    db.commit()

    log_audit(
        db,
        current_user.username,
        "delete_smtp_account",
        "smtp_account",
        aid,
        event_id=current_user.eventId,
    )
    return {"ok": True}


@router.post("/accounts/{aid}/test")
def test_smtp_account(
    aid: str,
    payload: TestConnectionRequest,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("email.manage")),
):
    account = db.query(SmtpAccount).filter(SmtpAccount.id == aid).first()
    if not account:
        raise HTTPException(status_code=404, detail="SMTP account not found")

    if payload.targetEmail:
        ok, code, err = send_message(
            account=account,
            to=payload.targetEmail,
            subject="Test Email from Event Portal",
            text="This is a test email sent from the Event Management Portal.",
            html="<p>This is a test email sent from the Event Management Portal.</p>",
        )
        if not ok:
            return {"ok": False, "error": err or "Failed to send test email"}
        return {"ok": True, "message": f"Test message sent successfully to {payload.targetEmail}"}
    else:
        ok, err = test_connection(account)
        if not ok:
            return {"ok": False, "error": err or "Failed to authenticate with SMTP server"}
        return {"ok": True, "message": "SMTP connection and authentication successful"}


@router.get("/templates")
def list_email_templates(
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("email.manage")),
):
    custom_templates = {
        t.key: t
        for t in db.query(EmailTemplate).filter(EmailTemplate.eventId == current_user.eventId).all()
    }

    out = []
    for key, spec in TEMPLATE_REGISTRY.items():
        custom = custom_templates.get(key)
        out.append({
            "key": key,
            "subject": custom.subject if custom else spec.get("default_subject", spec.get("subject")),
            "body": custom.body if custom else spec.get("default_body", spec.get("body")),
            "allowedVariables": list(spec.get("allowed_variables", spec.get("variables", []))),
            "isCustomized": custom is not None,
            "version": custom.version if custom else 1,
            "updatedAt": custom.updatedAt if custom else None,
        })
    return out


@router.put("/templates/{key}")
def update_email_template(
    key: str,
    payload: TemplateUpdateDTO,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("email.manage")),
):
    if key not in TEMPLATE_REGISTRY:
        raise HTTPException(status_code=404, detail="Unknown template key")

    # Reject subjects with CR or LF
    if "\r" in payload.subject or "\n" in payload.subject:
        raise HTTPException(status_code=422, detail="Email subject must not contain carriage return or newline characters")

    # Validate variables against whitelist
    spec = TEMPLATE_REGISTRY[key]
    allowed_vars = spec.get("allowed_variables", spec.get("variables", set()))

    import jinja2
    from jinja2 import meta
    env = jinja2.Environment()
    try:
        parsed_subject = env.parse(payload.subject)
        parsed_body = env.parse(payload.body)
        undeclared = meta.find_undeclared_variables(parsed_subject) | meta.find_undeclared_variables(parsed_body)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid template syntax: {str(e)}")

    disallowed = undeclared - set(allowed_vars)
    if disallowed:
        raise HTTPException(
            status_code=422,
            detail=f"Template contains disallowed variables: {', '.join(sorted(disallowed))}. Allowed: {', '.join(sorted(allowed_vars))}"
        )

    tmpl = (
        db.query(EmailTemplate)
        .filter(EmailTemplate.eventId == current_user.eventId, EmailTemplate.key == key)
        .first()
    )
    now = datetime.utcnow()
    if not tmpl:
        tmpl = EmailTemplate(
            eventId=current_user.eventId,
            key=key,
            subject=payload.subject,
            body=payload.body,
            version=1,
            updatedBy=current_user.username,
            updatedAt=now,
        )
        db.add(tmpl)
    else:
        tmpl.subject = payload.subject
        tmpl.body = payload.body
        tmpl.version += 1
        tmpl.updatedBy = current_user.username
        tmpl.updatedAt = now

    db.commit()

    log_audit(
        db,
        current_user.username,
        "update_email_template",
        "email_template",
        key,
        diff={"version": tmpl.version},
        event_id=current_user.eventId,
    )

    return {"ok": True, "key": key, "version": tmpl.version}


@router.delete("/templates/{key}")
def reset_email_template(
    key: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("email.manage")),
):
    tmpl = (
        db.query(EmailTemplate)
        .filter(EmailTemplate.eventId == current_user.eventId, EmailTemplate.key == key)
        .first()
    )
    if tmpl:
        db.delete(tmpl)
        db.commit()
        log_audit(
            db,
            current_user.username,
            "reset_email_template",
            "email_template",
            key,
            event_id=current_user.eventId,
        )
    return {"ok": True, "revertedToDefault": True}


@router.post("/templates/{key}/preview")
def preview_email_template(
    key: str,
    payload: TemplatePreviewRequest,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("email.manage")),
):
    subj_tmpl, body_tmpl = get_template(db, current_user.eventId, key)

    sample_context = {
        "recipient_name": "Jane Doe",
        "event_name": "Hackathon 2026",
        "invite_link": "https://hackathon.mitindia.com/accept-invite?token=sample-token-123",
        "expires_at": "72 hours",
    }
    if payload.variables:
        sample_context.update(payload.variables)

    rendered_subj, rendered_text, rendered_html = render_template(key, subj_tmpl, body_tmpl, sample_context)

    return {
        "subject": rendered_subj,
        "text": rendered_text,
        "html": rendered_html,
    }

from datetime import datetime, timedelta
import logging
from typing import Callable, Dict, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.models import EmailOutbox, EmailTemplate, SmtpAccount
from app.services.email_templates import (
    BUILTIN_TEMPLATES,
    render_template,
)
from app.services.email_sender import send_message

logger = logging.getLogger("email_outbox")

RETRY_DELAYS_MINUTES = [1, 5, 15, 30]


def enqueue_email(
    db: Session,
    event_id: str,
    to_email: str,
    template_key: str,
    context: dict,
    category: str = "critical",
    expires_in_minutes: Optional[int] = None,
    to_user_id: Optional[str] = None,
    created_by: Optional[str] = None,
    batch_id: Optional[str] = None,
) -> EmailOutbox:
    now = datetime.utcnow()

    # Determine priority
    cat_lower = (category or "normal").lower()
    if cat_lower == "critical":
        priority = 0
    elif cat_lower == "bulk":
        priority = 9
    else:
        priority = 5

    # Look up template
    tpl_row = (
        db.query(EmailTemplate)
        .filter(EmailTemplate.eventId == event_id, EmailTemplate.key == template_key)
        .first()
    )
    if tpl_row:
        subj_tpl = tpl_row.subject
        body_tpl = tpl_row.body
    elif template_key in BUILTIN_TEMPLATES:
        b = BUILTIN_TEMPLATES[template_key]
        subj_tpl = b["default_subject"]
        body_tpl = b["default_body"]
    else:
        raise ValueError(f"Unknown email template key: {template_key}")

    rendered_subject, rendered_text, _ = render_template(
        template_key, subj_tpl, body_tpl, context
    )

    expires_at = None
    if expires_in_minutes:
        expires_at = now + timedelta(minutes=expires_in_minutes)

    row = EmailOutbox(
        eventId=event_id,
        batchId=batch_id,
        toEmail=to_email.strip(),
        toUserId=to_user_id,
        templateKey=template_key,
        subject=rendered_subject,
        body=rendered_text,
        priority=priority,
        status="queued",
        attempts=0,
        nextAttemptAt=now,
        expiresAt=expires_at,
        createdAt=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def process_due(
    db: Session,
    sender: Callable = send_message,
    now: Optional[datetime] = None,
    limit: int = 10,
) -> dict:
    curr_now = now or datetime.utcnow()
    counts = {"sent": 0, "failed": 0, "expired": 0, "retried": 0, "processed": 0}

    # Find highest priority active SMTP account
    account = (
        db.query(SmtpAccount)
        .filter(SmtpAccount.status == "active")
        .order_by(SmtpAccount.priority.desc(), SmtpAccount.createdAt.asc())
        .first()
    )

    is_sqlite = db.bind and db.bind.dialect.name == "sqlite"

    query = (
        db.query(EmailOutbox)
        .filter(
            EmailOutbox.status == "queued",
            EmailOutbox.nextAttemptAt <= curr_now,
        )
        .order_by(EmailOutbox.priority.asc(), EmailOutbox.nextAttemptAt.asc())
        .limit(limit)
    )

    if not is_sqlite:
        query = query.with_for_update(skip_locked=True)

    rows = query.all()
    if not rows:
        return counts

    if not account:
        logger.warning("Email process_due: No active SMTP account configured")
        return {"error": "no_active_account", **counts}

    for row in rows:
        counts["processed"] += 1
        # Check expiry
        if row.expiresAt and row.expiresAt <= curr_now:
            row.status = "expired"
            row.error = "Expired before sending"
            db.commit()
            counts["expired"] += 1
            continue

        # Mark sending
        row.status = "sending"
        row.attempts += 1
        row.accountId = account.id
        db.commit()

        # Re-render HTML from stored plain text body
        from app.services.email_templates import build_html_body
        html_part = build_html_body(row.body)

        try:
            ok, smtp_code, short_error = sender(
                account,
                row.toEmail,
                row.subject,
                row.body,
                html_part,
            )
        except Exception as e:
            ok, smtp_code, short_error = False, None, str(e)

        if ok:
            row.status = "sent"
            row.sentAt = curr_now
            row.error = None
            row.body = ""  # blank body to avoid persisting sensitive invitation links
            account.sentToday = (account.sentToday or 0) + 1
            db.commit()
            counts["sent"] += 1
        else:
            # Classify error: permanent vs transient
            is_permanent = False
            if smtp_code and 500 <= smtp_code < 600:
                # 5xx is usually permanent except 503 sometimes
                is_permanent = True

            if is_permanent:
                row.status = "failed"
                row.error = f"Permanent SMTP rejection ({smtp_code}): {short_error}"
                db.commit()
                counts["failed"] += 1
            else:
                if row.attempts >= 5:
                    row.status = "failed"
                    row.error = f"Max delivery attempts exceeded ({smtp_code or 'err'}): {short_error}"
                    db.commit()
                    counts["failed"] += 1
                else:
                    delay_idx = min(row.attempts - 1, len(RETRY_DELAYS_MINUTES) - 1)
                    delay_mins = RETRY_DELAYS_MINUTES[delay_idx]
                    row.status = "queued"
                    row.nextAttemptAt = curr_now + timedelta(minutes=delay_mins)
                    row.error = f"Transient failure ({smtp_code or 'net'}): {short_error}"
                    db.commit()
                    counts["retried"] += 1

    return counts

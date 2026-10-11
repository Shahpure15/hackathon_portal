import pytest
import jinja2.exceptions
from app.services.email_templates import (
    validate_template,
    render_template,
    build_html_body,
    BUILTIN_TEMPLATES,
)


def test_builtin_template_render():
    context = {
        "recipient_name": "Alice Smith",
        "event_name": "MIT India Hackathon",
        "invite_link": "https://hackathon.mitindia.com/accept-invite?token=abc123xyz",
        "expires_at": "2026-10-15 12:00 UTC",
    }
    b = BUILTIN_TEMPLATES["staff_invite"]
    subj, text_body, html_body = render_template(
        "staff_invite", b["default_subject"], b["default_body"], context
    )
    assert "MIT India Hackathon" in subj
    assert "Alice Smith" in text_body
    assert "https://hackathon.mitindia.com/accept-invite?token=abc123xyz" in text_body
    assert '<a href="https://hackathon.mitindia.com/accept-invite?token=abc123xyz"' in html_body


def test_disallowed_variables_rejected():
    errors = validate_template(
        "staff_invite",
        "Hello {{recipient_name}}",
        "Bad var: {{admin_secret}} and {{user_id}}"
    )
    assert len(errors) > 0
    assert any("admin_secret" in e for e in errors)


def test_crlf_in_subject_rejected():
    errors = validate_template(
        "staff_invite",
        "Subject with \n newline",
        "Valid body {{recipient_name}}"
    )
    assert len(errors) > 0
    assert any("newline or carriage return" in e for e in errors)

    errors_cr = validate_template(
        "staff_invite",
        "Subject with \r carriage return",
        "Valid body {{recipient_name}}"
    )
    assert len(errors_cr) > 0


def test_autoescape_stops_html_injection():
    context = {
        "recipient_name": "<script>alert('xss')</script>",
        "event_name": "Hackathon",
        "invite_link": "https://example.com",
        "expires_at": "tomorrow",
    }
    subj, text_body, html_body = render_template(
        "staff_invite",
        "Hello {{recipient_name}}",
        "Welcome {{recipient_name}}",
        context
    )
    assert "<script>" not in html_body
    assert "&lt;script&gt;" in html_body


def test_sandbox_blocks_attribute_escape():
    # Attempt Python attribute traversal inside sandbox
    evil_tpl = "{{ ''.__class__.__mro__[1].__subclasses__() }}"
    # Either validate_template detects syntax or render blocks with SecurityError
    with pytest.raises((jinja2.exceptions.SecurityError, jinja2.exceptions.UndefinedError, Exception)):
        render_template(
            "staff_invite",
            "Test",
            evil_tpl,
            {}
        )

import html
import re
from typing import Dict, List, Optional, Set, Tuple
import jinja2
import jinja2.meta
import jinja2.sandbox

BUILTIN_TEMPLATES: Dict[str, dict] = {
    "staff_invite": {
        "key": "staff_invite",
        "label": "Staff Invitation",
        "allowed_variables": {"recipient_name", "event_name", "invite_link", "expires_at"},
        "default_subject": "Invitation to join {{event_name}} as staff",
        "default_body": (
            "Hello {{recipient_name}},\n\n"
            "You have been invited to join {{event_name}} as a staff member.\n"
            "Please click the link below to accept your invitation and set your password:\n"
            "{{invite_link}}\n\n"
            "This invitation link expires on {{expires_at}}.\n\n"
            "Best regards,\n"
            "{{event_name}} Organizing Team"
        ),
    }
}

_sandbox_env = jinja2.sandbox.SandboxedEnvironment(
    autoescape=True,
    undefined=jinja2.StrictUndefined,
)


def get_template_definition(key: str) -> Optional[dict]:
    return BUILTIN_TEMPLATES.get(key)


def get_allowed_variables(key: str) -> Set[str]:
    defn = BUILTIN_TEMPLATES.get(key)
    if defn:
        return set(defn["allowed_variables"])
    return set()


def validate_template(key: str, subject: str, body: str) -> List[str]:
    errors = []
    if "\r" in subject or "\n" in subject:
        errors.append("Subject must not contain newline or carriage return characters")

    allowed_vars = get_allowed_variables(key)

    for field_name, tpl_str in [("subject", subject), ("body", body)]:
        try:
            ast = _sandbox_env.parse(tpl_str)
            undeclared = jinja2.meta.find_undeclared_variables(ast)
            invalid_vars = undeclared - allowed_vars
            if invalid_vars:
                errors.append(
                    f"Template {field_name} references disallowed variables: {', '.join(sorted(invalid_vars))}. "
                    f"Allowed variables: {', '.join(sorted(allowed_vars))}"
                )
        except jinja2.TemplateSyntaxError as e:
            errors.append(f"Template {field_name} syntax error: {str(e)}")

    return errors


def build_html_body(plain_text: str) -> str:
    """Escapes HTML, converts newlines to <br>, wraps bare https:// URLs in <a> tags."""
    escaped = html.escape(plain_text)
    # Convert URLs into anchors
    url_pattern = re.compile(r"(https://[^\s<]+)")
    linked = url_pattern.sub(r'<a href="\1" target="_blank" rel="noopener noreferrer">\1</a>', escaped)
    # Convert newlines to <br />
    html_content = linked.replace("\r\n", "<br />").replace("\n", "<br />")
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1f2937;">
<div style="max-width: 600px; margin: 0 auto; padding: 20px;">
{html_content}
</div>
</body>
</html>"""


def render_template(
    key: str,
    subject_tpl: str,
    body_tpl: str,
    context: dict
) -> Tuple[str, str, str]:
    """
    Renders subject and body with sandboxed environment, passing only whitelisted context.
    Returns (rendered_subject, rendered_text_body, rendered_html_body).
    """
    allowed_vars = get_allowed_variables(key)
    filtered_context = {k: v for k, v in context.items() if k in allowed_vars}

    s_template = _sandbox_env.from_string(subject_tpl)
    b_template = _sandbox_env.from_string(body_tpl)

    rendered_subject = html.unescape(s_template.render(filtered_context).strip())
    rendered_text = html.unescape(b_template.render(filtered_context).strip())
    rendered_html = build_html_body(rendered_text)

    return rendered_subject, rendered_text, rendered_html

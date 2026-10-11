from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import ipaddress
import smtplib
import socket
import ssl
from typing import Optional, Tuple

from app.services.secrets_box import decrypt_secret

ALLOWED_SMTP_PORTS = {25, 465, 587, 2525}


def validate_smtp_target(host: str, port: int) -> None:
    """
    SSRF guard: resolves host with socket.getaddrinfo and rejects any address that is
    private, loopback, link-local, multicast, or reserved, as well as unapproved ports.
    Raises ValueError on validation failure.
    """
    if not host or not str(host).strip():
        raise ValueError("SMTP host cannot be empty")

    if port not in ALLOWED_SMTP_PORTS:
        raise ValueError(f"Port {port} is not an allowed SMTP port ({', '.join(sorted(str(p) for p in ALLOWED_SMTP_PORTS))})")

    clean_host = host.strip()

    try:
        addr_info = socket.getaddrinfo(clean_host, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as e:
        raise ValueError(f"Failed to resolve host '{clean_host}': {str(e)}")

    if not addr_info:
        raise ValueError(f"No addresses resolved for host '{clean_host}'")

    for entry in addr_info:
        sockaddr = entry[4]
        ip_str = sockaddr[0]
        try:
            ip = ipaddress.ip_address(ip_str)
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_multicast
                or ip.is_reserved
                or ip.is_unspecified
            ):
                raise ValueError(f"SMTP host '{clean_host}' resolved to restricted/private address: {ip_str}")
        except ValueError as e:
            if "restricted/private address" in str(e):
                raise
            raise ValueError(f"Invalid IP address returned for host '{clean_host}': {ip_str}")


def test_connection(account) -> Tuple[bool, Optional[int], Optional[str]]:
    """
    Connects and authenticates to SMTP server without sending email.
    Returns (ok, smtp_code, short_error).
    """
    try:
        validate_smtp_target(account.host, account.port)
    except ValueError as e:
        return False, None, str(e)

    password = decrypt_secret(account.passwordEnc)

    timeout = 20
    try:
        if account.security.lower() == "ssl":
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(account.host, account.port, timeout=timeout, context=context) as server:
                server.login(account.username, password)
        else:
            with smtplib.SMTP(account.host, account.port, timeout=timeout) as server:
                server.ehlo()
                if account.security.lower() == "starttls":
                    context = ssl.create_default_context()
                    server.starttls(context=context)
                    server.ehlo()
                server.login(account.username, password)
        return True, 250, None
    except smtplib.SMTPResponseException as e:
        return False, e.smtp_code, (e.smtp_error.decode("utf-8", "ignore") if isinstance(e.smtp_error, bytes) else str(e.smtp_error))
    except Exception as e:
        return False, None, str(e)


def send_message(
    account,
    to: str,
    subject: str,
    text: str,
    html: Optional[str] = None
) -> Tuple[bool, Optional[int], Optional[str]]:
    """
    Sends an email using account settings.
    Returns (ok, smtp_code, short_error).
    """
    try:
        validate_smtp_target(account.host, account.port)
    except ValueError as e:
        return False, None, str(e)

    password = decrypt_secret(account.passwordEnc)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    from_header = f"{account.fromName} <{account.fromEmail}>" if account.fromName else account.fromEmail
    msg["From"] = from_header
    msg["To"] = to
    if getattr(account, "replyTo", None):
        msg["Reply-To"] = account.replyTo

    part1 = MIMEText(text, "plain", "utf-8")
    msg.attach(part1)

    if html:
        part2 = MIMEText(html, "html", "utf-8")
        msg.attach(part2)

    timeout = 20
    try:
        if account.security.lower() == "ssl":
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(account.host, account.port, timeout=timeout, context=context) as server:
                server.login(account.username, password)
                server.sendmail(account.fromEmail, [to], msg.as_string())
        else:
            with smtplib.SMTP(account.host, account.port, timeout=timeout) as server:
                server.ehlo()
                if account.security.lower() == "starttls":
                    context = ssl.create_default_context()
                    server.starttls(context=context)
                    server.ehlo()
                server.login(account.username, password)
                server.sendmail(account.fromEmail, [to], msg.as_string())
        return True, 250, None
    except smtplib.SMTPResponseException as e:
        err_msg = e.smtp_error.decode("utf-8", "ignore") if isinstance(e.smtp_error, bytes) else str(e.smtp_error)
        return False, e.smtp_code, err_msg
    except Exception as e:
        return False, None, str(e)

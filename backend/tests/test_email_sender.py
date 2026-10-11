import socket
import pytest
from app.services.email_sender import validate_smtp_target, ALLOWED_SMTP_PORTS


def test_validate_smtp_target_rejects_private_ips():
    # Loopback
    with pytest.raises(ValueError, match="restricted/private address"):
        validate_smtp_target("127.0.0.1", 587)

    # Private RFC 1918
    with pytest.raises(ValueError, match="restricted/private address"):
        validate_smtp_target("10.0.0.5", 587)

    # Link-local / cloud metadata
    with pytest.raises(ValueError, match="restricted/private address"):
        validate_smtp_target("169.254.169.254", 587)

    # Localhost
    with pytest.raises(ValueError, match="restricted/private address"):
        validate_smtp_target("localhost", 587)


def test_validate_smtp_target_rejects_unallowed_ports():
    with pytest.raises(ValueError, match="not an allowed SMTP port"):
        validate_smtp_target("smtp.gmail.com", 22)

    with pytest.raises(ValueError, match="not an allowed SMTP port"):
        validate_smtp_target("smtp.gmail.com", 80)


def test_validate_smtp_target_monkeypatched_host(monkeypatch):
    # Simulate a domain that resolves to a private IP (DNS rebinding / SSRF attempt)
    def fake_getaddrinfo(host, port, proto=0):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("192.168.1.50", port))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)
    with pytest.raises(ValueError, match="restricted/private address"):
        validate_smtp_target("internal-relay.corp", 587)


def test_validate_smtp_target_accepts_valid_public_host(monkeypatch):
    # Simulate a domain resolving to a public IP
    def fake_getaddrinfo(host, port, proto=0):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("142.250.190.109", port))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)
    # Should not raise
    validate_smtp_target("smtp.gmail.com", 587)
    validate_smtp_target("smtp.gmail.com", 465)

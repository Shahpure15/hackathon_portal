import asyncio
import re
import pytest
from starlette.requests import Request

from app.cors import build_origin_regex, parse_explicit_origins
from app.main import app, cors_rate_limit_exceeded_handler


def test_build_origin_regex_production():
    reg = re.compile(build_origin_regex("production"))
    assert reg.fullmatch("https://hackathon.mitindia.com")
    assert reg.fullmatch("https://mitindia.com")
    assert reg.fullmatch("https://a.b.mitindia.com")
    assert not reg.fullmatch("https://evil.vercel.app")
    assert not reg.fullmatch("https://mitindia.com.evil.com")
    assert not reg.fullmatch("https://evilmitindia.com")
    assert not reg.fullmatch("http://localhost:5173")
    assert not reg.fullmatch("http://127.0.0.1:8000")


def test_build_origin_regex_development():
    reg = re.compile(build_origin_regex("development"))
    assert reg.fullmatch("http://localhost:5173")
    assert reg.fullmatch("http://127.0.0.1:3000")


def test_build_origin_regex_custom():
    custom = r"^https://mitindia(-[a-z0-9-]+)?-myteam[.]vercel[.]app$"
    reg = re.compile(build_origin_regex("production", custom))
    assert reg.fullmatch("https://mitindia-git-feature-myteam.vercel.app")
    assert reg.fullmatch("https://mitindia-abc123-myteam.vercel.app")
    assert not reg.fullmatch("https://mitindia-git-x-otherteam.vercel.app")


def test_dangerous_and_invalid_custom_regex():
    for dangerous in [".*", r"https://.*[.]vercel[.]app", "https://.*"]:
        reg_str = build_origin_regex("production", dangerous)
        reg = re.compile(reg_str)
        assert not reg.fullmatch("https://attacker.vercel.app")

    reg_str = build_origin_regex("production", "(")
    reg = re.compile(reg_str)
    assert not reg.fullmatch("https://attacker.vercel.app")


def test_parse_explicit_origins():
    res = parse_explicit_origins("https://a.com/, ,*,https://b.com")
    assert res == {"https://a.com", "https://b.com"}


def test_http_health_allowed_origin(client, fresh_db):
    res = client.get("/health", headers={"Origin": "https://mitindia.vercel.app"})
    assert res.headers.get("access-control-allow-origin") == "https://mitindia.vercel.app"
    assert res.headers.get("access-control-allow-credentials") == "true"


def test_http_health_evil_origin(client, fresh_db):
    res = client.get("/health", headers={"Origin": "https://evil.vercel.app"})
    assert "access-control-allow-origin" not in res.headers


def test_http_preflight_evil_origin(client, fresh_db):
    res = client.options(
        "/auth/refresh",
        headers={
            "Origin": "https://evil.vercel.app",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert res.status_code == 400
    assert "access-control-allow-origin" not in res.headers


@pytest.fixture
def boom_route():
    def boom():
        raise RuntimeError("FAIL")

    app.add_api_route("/__test_boom_cors", boom)
    yield
    app.router.routes = [r for r in app.router.routes if getattr(r, "path", None) != "/__test_boom_cors"]


def test_http_500_cors_headers(client, fresh_db, boom_route):
    res_allowed = client.get("/__test_boom_cors", headers={"Origin": "https://mitindia.vercel.app"})
    assert res_allowed.status_code == 500
    assert res_allowed.headers.get("access-control-allow-origin") == "https://mitindia.vercel.app"
    assert res_allowed.headers.get("access-control-allow-credentials") == "true"
    assert "Origin" in res_allowed.headers.get("vary", "")

    res_evil = client.get("/__test_boom_cors", headers={"Origin": "https://evil.vercel.app"})
    assert res_evil.status_code == 500
    assert "access-control-allow-origin" not in res_evil.headers


def test_cors_rate_limit_exceeded_handler_direct():
    evil_req = Request({
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [(b"origin", b"https://evil.vercel.app")],
    })
    evil_resp = asyncio.run(cors_rate_limit_exceeded_handler(evil_req, None))
    assert "access-control-allow-origin" not in evil_resp.headers

    allowed_req = Request({
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [(b"origin", b"https://mitindia.vercel.app")],
    })
    allowed_resp = asyncio.run(cors_rate_limit_exceeded_handler(allowed_req, None))
    assert allowed_resp.headers.get("access-control-allow-origin") == "https://mitindia.vercel.app"
    assert allowed_resp.headers.get("access-control-allow-credentials") == "true"
    assert allowed_resp.headers.get("vary") == "Origin"

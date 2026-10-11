import re
from typing import Optional

from app.config import settings
from app.logger import logger

OWN_DOMAIN_PATTERN = r'https?://([a-z0-9-]+[.])*mitindia[.]com'
LOCAL_PATTERN = r'https?://(localhost|127[.]0[.]0[.]1)(:[0-9]+)?'
PROBE_ORIGINS = ('https://attacker.example.com', 'https://attacker.vercel.app')


def parse_explicit_origins(raw: str) -> set:
    origins = set()
    for item in raw.split(','):
        item = item.strip().rstrip('/')
        if not item:
            continue
        if item == '*':
            logger.warning('CORS: wildcard origin ignored (invalid together with credentials)')
            continue
        origins.add(item)
    return origins


def build_origin_regex(environment: str, custom_regex: str = '') -> str:
    parts = [OWN_DOMAIN_PATTERN]
    if (environment or '').lower() != 'production':
        parts.append(LOCAL_PATTERN)
    custom = (custom_regex or '').strip()
    if custom:
        body = custom[1:] if custom.startswith('^') else custom
        body = body[:-1] if body.endswith('$') else body
        try:
            compiled = re.compile('^(' + body + ')$')
        except re.error:
            logger.error('CORS: CORS_ALLOWED_ORIGIN_REGEX is not a valid regex; ignored')
        else:
            if any(compiled.fullmatch(p) for p in PROBE_ORIGINS):
                logger.error('CORS: CORS_ALLOWED_ORIGIN_REGEX is too broad; ignored')
            else:
                parts.append(body)
    return '^(' + '|'.join('(' + p + ')' for p in parts) + ')$'


EXPLICIT_ORIGINS = parse_explicit_origins(settings.CORS_ALLOWED_ORIGINS)
ORIGIN_REGEX = build_origin_regex(settings.ENVIRONMENT, settings.CORS_ALLOWED_ORIGIN_REGEX)
_COMPILED = re.compile(ORIGIN_REGEX)


def is_origin_allowed(origin: Optional[str]) -> bool:
    if not origin:
        return False
    origin = origin.rstrip('/')
    return origin in EXPLICIT_ORIGINS or _COMPILED.fullmatch(origin) is not None

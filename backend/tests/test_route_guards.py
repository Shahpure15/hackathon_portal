from fastapi.routing import APIRoute

from app.main import app

PUBLIC = {('POST', '/auth/login'), ('POST', '/auth/refresh'), ('POST', '/auth/logout'), ('GET', '/health')}
DOC_PATHS = {'/openapi.json', '/docs', '/docs/oauth2-redirect', '/redoc'}


def _get_all_api_routes(app_instance):
    api_routes = []
    for r in app_instance.routes:
        if isinstance(r, APIRoute):
            api_routes.append(r)
        elif hasattr(r, 'original_router'):
            for sub in r.original_router.routes:
                if isinstance(sub, APIRoute):
                    api_routes.append(sub)
        elif hasattr(r, 'routes'):
            for sub in r.routes:
                if isinstance(sub, APIRoute):
                    api_routes.append(sub)
    return api_routes


def _dependency_names(dependant, acc=None):
    acc = [] if acc is None else acc
    for dep in dependant.dependencies:
        acc.append(getattr(dep.call, '__qualname__', ''))
        _dependency_names(dep, acc)
    return acc


def test_every_http_route_has_an_auth_guard():
    unguarded = []
    for route in _get_all_api_routes(app):
        if route.path in DOC_PATHS:
            continue
        names = _dependency_names(route.dependant)
        guarded = any(
            n.startswith('require_role')
            or n.startswith('require_permission')
            or n.startswith('require_principal')
            or n == 'get_current_user'
            for n in names
        )
        for method in route.methods:
            if not guarded and (method, route.path) not in PUBLIC:
                unguarded.append((method, route.path))
    assert not unguarded, 'Routes without an auth guard: ' + repr(sorted(unguarded))

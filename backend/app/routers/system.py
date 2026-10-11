import os

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import CurrentUser, require_role
from app.config import settings
from app.database import get_db
from app.models import Role

router = APIRouter(prefix='/admin/system', tags=['system'])


@router.get('/info')
def system_info(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN)),
):
    try:
        schema_revision = db.execute(text('SELECT version_num FROM alembic_version')).scalar()
    except Exception:
        schema_revision = None
    return {
        'appVersion': settings.BACKEND_VERSION,
        'schemaRevision': schema_revision,
        'commit': (os.environ.get('RENDER_GIT_COMMIT') or '')[:7] or None,
        'environment': settings.ENVIRONMENT,
    }

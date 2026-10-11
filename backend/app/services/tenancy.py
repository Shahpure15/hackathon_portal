from typing import Optional

from sqlalchemy.orm import Session

from app.models import Organization

DEFAULT_ORG_SLUG = 'default'


def get_default_org(db: Session) -> Optional[Organization]:
    return db.query(Organization).filter(Organization.slug == DEFAULT_ORG_SLUG).first()

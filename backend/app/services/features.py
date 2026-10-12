from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, ValidationError
from sqlalchemy.orm import Session

from app.models import EventConfig


class FeaturesConfig(BaseModel):
    model_config = ConfigDict(extra='ignore')
    pods: bool = True
    evaluation: bool = True
    stage: Literal['setup', 'event_day', 'judging', 'results', 'closed'] = 'setup'
    staff_admin_portal: bool = True
    volunteer_portal: bool = True
    leader_portal: bool = True


def features_from_raw(raw: Optional[dict]) -> FeaturesConfig:
    try:
        return FeaturesConfig(**(raw or {}))
    except (ValidationError, TypeError):
        return FeaturesConfig()


def get_event_features(db: Session, event_id: str) -> FeaturesConfig:
    config = db.query(EventConfig).filter(EventConfig.eventId == event_id).first()
    return features_from_raw(config.features if config else None)

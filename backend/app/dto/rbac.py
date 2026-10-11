from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict


class AuthMeResponse(BaseModel):
    model_config = ConfigDict(extra='ignore')

    username: str
    role: str
    eventId: Optional[str] = None
    teamId: Optional[str] = None
    status: str
    isAdmin: bool
    roleNames: List[str] = []
    permissions: List[str] = []
    scope: Dict[str, Any]
    features: Dict[str, Any]
    moduleGates: Dict[str, Any] = {}

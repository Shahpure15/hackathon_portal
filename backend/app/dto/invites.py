from datetime import datetime
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, ConfigDict


class StaffEmailUpdateDTO(BaseModel):
    model_config = ConfigDict(extra="ignore")
    email: str


class StaffInviteRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    roleId: Optional[str] = None
    scope: Optional[dict] = None
    force: bool = False


class StaffAccessItemDTO(BaseModel):
    model_config = ConfigDict(extra="ignore")
    volunteerId: str
    name: str
    type: str
    email: Optional[str] = None
    userId: Optional[str] = None
    username: Optional[str] = None
    status: Optional[str] = None
    inviteSentAt: Optional[datetime] = None
    roleNames: List[str] = []


class AcceptInviteRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    token: str
    password: str

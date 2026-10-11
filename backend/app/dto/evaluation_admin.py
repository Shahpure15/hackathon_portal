from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional, Tuple, Any
from pydantic import BaseModel, ConfigDict


class AssignableTeamDTO(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    registrationId: str
    podId: Optional[str] = None
    podName: Optional[str] = None
    psId: Optional[str] = None
    psTitle: Optional[str] = None
    status: str
    collegeName: str
    activeJudgeCount: int = 0


class AssignmentPreviewRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    teamIds: List[str]
    judgeVolunteerIds: List[str]
    mode: str = "split"
    judgesPerTeam: int = 1
    groupMap: Optional[Dict[str, List[str]]] = None
    conflictField: Optional[str] = None


class AssignmentCommitRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    pairs: List[Tuple[str, str]]
    token: str
    replaceWizard: bool = False
    overrideConflicts: bool = False


class AssignmentManualRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    teamIds: List[str]
    judgeVolunteerIds: List[str]


class AssignmentItemDTO(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    roundId: str
    teamId: str
    teamName: str
    teamRegistrationId: str
    judgeVolunteerId: str
    judgeName: str
    source: str
    status: str
    createdAt: datetime
    hasEvaluation: bool = False


class UnlockRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    reason: str


class ReviseRubricRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    mode: str
    confirmText: Optional[str] = None

from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, ConfigDict


class JudgeRoundItemDTO(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: Optional[str] = None
    assigned: int
    drafts: int
    submitted: int
    closesAt: Optional[datetime] = None


class JudgeTeamItemDTO(BaseModel):
    model_config = ConfigDict(extra="ignore")
    teamId: str
    name: str
    registrationId: str
    psCode: Optional[str] = None
    psTitle: Optional[str] = None
    psDescription: Optional[str] = None
    status: str  # not_started | draft | submitted
    myTotalPct: Optional[Decimal] = None
    updatedAt: Optional[datetime] = None


class JudgeRubricFieldDTO(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    type: str
    label: str
    description: Optional[str] = None
    maxMarks: Optional[Decimal] = None
    weight: Optional[Decimal] = None
    anchors: Optional[Any] = None
    isRequired: bool = False
    maxLength: Optional[int] = None
    sortOrder: int = 0
    audience: str = "participants"  # participants | staff
    section: Optional[str] = None  # "A" | "B"
    problemStatementId: Optional[str] = None


class JudgeRubricSectionDTO(BaseModel):
    model_config = ConfigDict(extra="ignore")
    key: str  # "A" | "B"
    title: str
    maxMarks: Optional[Decimal] = None
    weight: Optional[Decimal] = None
    fieldIds: List[str] = []


class JudgeRubricSummaryDTO(BaseModel):
    model_config = ConfigDict(extra="ignore")
    version: int
    fields: List[JudgeRubricFieldDTO]
    sections: Optional[List[JudgeRubricSectionDTO]] = None


class JudgeTeamSubmissionDTO(BaseModel):
    model_config = ConfigDict(extra="ignore")
    driveLink: Optional[str] = None
    githubLink: Optional[str] = None
    answers: Optional[Dict[str, Any]] = None


class JudgeMineDTO(BaseModel):
    model_config = ConfigDict(extra="ignore")
    status: str
    token: Optional[str] = None
    scores: Dict[str, Optional[Decimal]] = {}
    texts: Dict[str, Optional[str]] = {}
    totalPct: Optional[Decimal] = None
    submittedAt: Optional[datetime] = None


class JudgeTeamDetailDTO(BaseModel):
    model_config = ConfigDict(extra="ignore")
    teamId: str
    name: str
    registrationId: str
    psCode: Optional[str] = None
    psTitle: Optional[str] = None
    psDescription: Optional[str] = None
    decisiveTest: Optional[str] = None
    guidanceNotes: Optional[str] = None
    submission: Optional[JudgeTeamSubmissionDTO] = None
    rubric: JudgeRubricSummaryDTO
    mine: JudgeMineDTO


class JudgeDraftRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    scores: Dict[str, Any] = {}
    texts: Dict[str, Any] = {}
    token: Optional[str] = None


class JudgeDraftResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    token: str
    savedAt: datetime


class JudgeSubmitRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    token: Optional[str] = None


class JudgeSubmitResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    status: str
    totalPct: Decimal
    submittedAt: datetime

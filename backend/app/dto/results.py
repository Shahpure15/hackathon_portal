from decimal import Decimal
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class ResultsConfigDTO(BaseModel):
    showScore: bool = False
    showCriterionScores: bool = False
    showRank: bool = False
    showAdvancement: bool = False
    textFields: Dict[str, bool] = Field(default_factory=dict)
    scale: str = "percent"  # "scaled" | "percent"
    holdTeamIds: List[str] = Field(default_factory=list)


class ResultsStatusDTO(BaseModel):
    releaseNo: int
    releasedAt: Optional[str] = None
    retracted: bool
    pendingChanges: int


class ResultsUpdateCommitRequest(BaseModel):
    expectedReleaseNo: int


class AdvancePreviewRequest(BaseModel):
    mode: str = "top_n"  # "top_n" | "threshold" | "manual"
    n: Optional[int] = None
    minScore: Optional[Decimal] = None
    teamIds: Optional[List[str]] = None
    manualTeamIds: Optional[List[str]] = None
    includeProvisional: bool = False
    tieDecision: Optional[str] = None


class AdvanceCommitRequest(BaseModel):
    mode: str = "top_n"
    teamIds: List[str]
    token: str
    targetRoundId: Optional[str] = None
    tieDecision: Optional[str] = None
    customRanks: Optional[Dict[str, int]] = None


class ProgressionItemDTO(BaseModel):
    id: str
    teamId: str
    name: str
    registrationId: str
    state: str
    via: str
    rankSnapshot: Optional[int] = None
    scoreSnapshot: Optional[Decimal] = None
    decidedBy: Optional[str] = None
    decidedAt: Optional[str] = None

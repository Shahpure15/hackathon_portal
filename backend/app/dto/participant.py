from typing import Dict, List, Optional, Any
from pydantic import BaseModel


class CriterionScoreItemDTO(BaseModel):
    label: str
    avgMarks: float
    maxMarks: float


class CommentGroupDTO(BaseModel):
    label: str
    items: List[str]


class ParticipantResultDTO(BaseModel):
    score: Optional[float] = None
    totalScale: Optional[int] = None
    scale: Optional[str] = None
    rank: Optional[int] = None
    advancement: Optional[str] = None
    criteria: Optional[List[CriterionScoreItemDTO]] = None
    comments: Optional[List[CommentGroupDTO]] = None
    releaseNo: Optional[int] = None
    releasedAt: Optional[str] = None


class ParticipantNotificationDTO(BaseModel):
    id: str
    type: str
    title: str
    body: str
    link: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None
    readAt: Optional[str] = None
    createdAt: str

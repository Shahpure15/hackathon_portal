from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class RubricFieldItemDTO(BaseModel):
    id: Optional[str] = None
    fieldKey: Optional[str] = None
    type: str = "numeric"  # numeric | text
    label: str
    description: Optional[str] = None
    sortOrder: int = 0
    isRequired: bool = True
    maxMarks: Optional[Decimal] = None
    weight: Optional[Decimal] = None
    anchors: Optional[List[Dict[str, Any]]] = None
    visibility: Optional[str] = None  # staff | participant
    maxLength: Optional[int] = None

    class Config:
        from_attributes = True


class RubricSummaryDTO(BaseModel):
    version: int = 0
    fieldCount: int = 0
    published: bool = False
    locked: bool = False


class RoundListItemDTO(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    number: int
    status: str
    submissionEnabled: bool
    evaluationEnabled: bool
    isSubmissionOpen: bool
    opensAt: Optional[datetime] = None
    closesAt: Optional[datetime] = None
    submissionCount: int = 0
    rubricSummary: RubricSummaryDTO


class RoundDetailDTO(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    number: int
    status: str
    submissionEnabled: bool
    evaluationEnabled: bool
    isSubmissionOpen: bool
    opensAt: Optional[datetime] = None
    closesAt: Optional[datetime] = None
    aggregation: str = "mean"
    trimCount: int = 1
    totalScale: int = 100
    tieBreakOrder: Optional[List[str]] = None
    eligibility: Optional[Dict[str, Any]] = None
    coiRule: Optional[Dict[str, Any]] = None
    resultsConfig: Optional[Dict[str, Any]] = None
    submissionFields: Optional[List[Dict[str, Any]]] = None
    submissionCount: int = 0
    rubricSummary: RubricSummaryDTO
    rubricFields: List[RubricFieldItemDTO] = []


class RoundCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    number: Optional[int] = None
    status: Optional[str] = "live"
    submissionEnabled: bool = True
    evaluationEnabled: bool = False
    isSubmissionOpen: bool = False
    opensAt: Optional[datetime] = None
    closesAt: Optional[datetime] = None
    aggregation: Optional[str] = "mean"
    trimCount: Optional[int] = 1
    totalScale: Optional[int] = 100
    tieBreakOrder: Optional[List[str]] = None
    eligibility: Optional[Dict[str, Any]] = None
    coiRule: Optional[Dict[str, Any]] = None
    resultsConfig: Optional[Dict[str, Any]] = None
    submissionFields: Optional[List[Dict[str, Any]]] = None


class RoundUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    number: Optional[int] = None
    status: Optional[str] = None
    submissionEnabled: Optional[bool] = None
    evaluationEnabled: Optional[bool] = None
    isSubmissionOpen: Optional[bool] = None
    opensAt: Optional[datetime] = None
    closesAt: Optional[datetime] = None
    aggregation: Optional[str] = None
    trimCount: Optional[int] = None
    totalScale: Optional[int] = None
    tieBreakOrder: Optional[List[str]] = None
    eligibility: Optional[Dict[str, Any]] = None
    coiRule: Optional[Dict[str, Any]] = None
    resultsConfig: Optional[Dict[str, Any]] = None
    submissionFields: Optional[List[Dict[str, Any]]] = None


class RubricSaveRequest(BaseModel):
    rubricFields: List[RubricFieldItemDTO]


class RubricResponse(BaseModel):
    rubricFields: List[RubricFieldItemDTO]
    errors: List[str] = []
    warnings: List[str] = []
    version: int = 0
    published: bool = False
    locked: bool = False

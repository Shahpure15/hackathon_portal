from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, EmailStr, Field
from app.models import Role, TeamStatus, VolunteerType, Discipline

# Auth Schemas
class UserLogin(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: Role
    eventId: str
    teamId: Optional[str] = None
    username: str

# Event Schemas
class EventResponse(BaseModel):
    id: str
    name: str
    startDate: datetime
    endDate: datetime
    isActive: bool

    class Config:
        from_attributes = True

# Team Member Schemas
class TeamMemberBase(BaseModel):
    name: str
    email: str
    phone: str

class TeamMemberCreate(TeamMemberBase):
    pass

class TeamMemberResponse(TeamMemberBase):
    id: str
    teamId: str
    idVerified: bool
    isTeamLeader: bool = False

    class Config:
        from_attributes = True

# Team Schemas
class TeamBase(BaseModel):
    name: str
    leaderName: str
    leaderEmail: str
    leaderPhone: str
    collegeName: str

class TeamResponse(TeamBase):
    id: str
    eventId: str
    registrationId: str
    status: TeamStatus
    category: Discipline = Discipline.ENGINEERING
    deskNumber: Optional[str] = None
    podId: Optional[str] = None
    createdAt: datetime
    members: List[TeamMemberResponse] = []

    class Config:
        from_attributes = True

class TeamDetailResponse(TeamResponse):
    podName: Optional[str] = None
    selectedPsCode: Optional[str] = None
    psId: Optional[str] = None

# Pod Schemas
class PodBase(BaseModel):
    name: str
    capacity: Optional[int] = None

class PodCreate(PodBase):
    pass

class PodResponse(PodBase):
    id: str
    eventId: str
    teamCount: int = 0
    volunteerCount: int = 0

    class Config:
        from_attributes = True

class PodDetailResponse(PodResponse):
    teams: List[TeamBase] = []
    volunteers: List[Any] = [] # Will map to VolunteerResponse

# Panel Schemas
class PanelBase(BaseModel):
    name: str
    facultyMemberName: Optional[str] = None
    memberNames: List[str] = []
    problemStatementId: Optional[str] = None

class PanelCreate(PanelBase):
    pass

class PanelUpdate(BaseModel):
    name: Optional[str] = None
    facultyMemberName: Optional[str] = None
    memberNames: Optional[List[str]] = None
    problemStatementId: Optional[str] = None

class PanelResponse(PanelBase):
    id: str
    eventId: str
    problemStatementCode: Optional[str] = None

    class Config:
        from_attributes = True

# Evaluation Round Schemas
class EvaluationRoundField(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = ""
    fieldType: str = "text"
    required: bool = True

class EvaluationRoundBase(BaseModel):
    name: str
    roundNumber: int
    description: Optional[str] = None
    fields: Optional[List[Dict[str, Any]]] = []

class EvaluationRoundCreate(EvaluationRoundBase):
    pass

class EvaluationRoundUpdate(BaseModel):
    name: Optional[str] = None
    roundNumber: Optional[int] = None
    description: Optional[str] = None
    fields: Optional[List[Dict[str, Any]]] = None
    isSubmissionOpen: Optional[bool] = None

class EvaluationRoundResponse(EvaluationRoundBase):
    id: str
    eventId: str
    description: Optional[str] = None
    fields: Optional[List[Dict[str, Any]]] = []
    isSubmissionOpen: bool = False
    submissionCount: int = 0
    createdAt: datetime

    class Config:
        from_attributes = True

# Submission Schemas
class SubmissionCreate(BaseModel):
    driveLink: Optional[str] = None
    githubLink: Optional[str] = None
    answers: Optional[Dict[str, Any]] = None

class SubmissionResponse(BaseModel):
    id: str
    teamId: str
    roundId: str
    driveLink: Optional[str] = None
    githubLink: Optional[str] = None
    answers: Optional[Dict[str, Any]] = None
    submittedAt: datetime
    updatedAt: datetime

    class Config:
        from_attributes = True

# Volunteer Schemas
class VolunteerBase(BaseModel):
    name: str
    type: VolunteerType
    contact: str
    podId: Optional[str] = None

class VolunteerCreate(VolunteerBase):
    pass

class VolunteerResponse(VolunteerBase):
    id: str
    eventId: str
    podName: Optional[str] = None
    username: Optional[str] = None
    hasLogin: bool = False
    generatedPassword: Optional[str] = None

    class Config:
        from_attributes = True

# Checkpoint Schemas
class CheckpointTypeCreate(BaseModel):
    name: str
    description: Optional[str] = None

class CheckpointTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class CheckpointTypeResponse(CheckpointTypeCreate):
    id: str
    eventId: str

    class Config:
        from_attributes = True

class AttendanceRecordCreate(BaseModel):
    teamMemberId: str
    checkpointTypeId: str

class AttendanceRecordResponse(BaseModel):
    id: str
    teamMemberId: str
    checkpointTypeId: str
    markedBy: str
    timestamp: datetime

    class Config:
        from_attributes = True

# Problem Statement Schemas
class ProblemStatementCreate(BaseModel):
    code: str
    title: str
    description: str
    capacity: int
    requirements: Optional[str] = None
    discipline: Optional[Discipline] = None

class ProblemStatementUpdate(BaseModel):
    code: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    capacity: Optional[int] = None
    requirements: Optional[str] = None
    discipline: Optional[Discipline] = None

class ProblemStatementResponse(BaseModel):
    id: str
    eventId: str
    code: str
    title: str
    description: str
    capacity: int
    selectedCount: int
    remainingCapacity: int = 0
    requirements: Optional[str] = None
    discipline: Optional[Discipline] = None

    class Config:
        from_attributes = True

# Audit Log Schema
class AuditLogResponse(BaseModel):
    id: str
    actorId: str
    action: str
    entityType: str
    entityId: str
    diff: Optional[dict] = None
    timestamp: datetime

    class Config:
        from_attributes = True

# EventConfig Schemas
class EventConfigResponse(BaseModel):
    id: str
    eventId: str
    psReleaseAt: Optional[datetime] = None
    psGateCheckpointTypeId: Optional[str] = None

    class Config:
        from_attributes = True

class EventConfigUpdate(BaseModel):
    psReleaseAt: Optional[datetime] = None
    psGateCheckpointTypeId: Optional[str] = None

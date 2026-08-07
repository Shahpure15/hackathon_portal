import enum
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Boolean, DateTime, ForeignKey, 
    Enum, JSON, Index, UniqueConstraint, func, Text
)
from sqlalchemy.orm import relationship
from app.database import Base

def generate_uuid():
    return str(uuid.uuid4())

# Enums
class Role(str, enum.Enum):
    ADMIN = "ADMIN"
    VOLUNTEER = "VOLUNTEER"
    LEADER = "LEADER"

class TeamStatus(str, enum.Enum):
    REGISTERED = "REGISTERED"
    SHORTLISTED = "SHORTLISTED"
    WAITLISTED = "WAITLISTED"
    DISQUALIFIED = "DISQUALIFIED"

class VolunteerType(str, enum.Enum):
    FACULTY = "FACULTY"
    STUDENT = "STUDENT"

# Models
class Event(Base):
    __tablename__ = "events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    startDate = Column(DateTime, nullable=False)
    endDate = Column(DateTime, nullable=False)
    isActive = Column(Boolean, default=True, nullable=False)
    createdAt = Column(DateTime, default=func.now(), nullable=False)

    # Relationships
    config = relationship("EventConfig", back_populates="event", uselist=False, cascade="all, delete-orphan")
    users = relationship("User", back_populates="event", cascade="all, delete-orphan")
    teams = relationship("Team", back_populates="event", cascade="all, delete-orphan")
    pods = relationship("Pod", back_populates="event", cascade="all, delete-orphan")
    volunteers = relationship("Volunteer", back_populates="event", cascade="all, delete-orphan")
    checkpointTypes = relationship("CheckpointType", back_populates="event", cascade="all, delete-orphan")
    problemStatements = relationship("ProblemStatement", back_populates="event", cascade="all, delete-orphan")

class EventConfig(Base):
    __tablename__ = "event_configs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    eventId = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), unique=True, nullable=False)
    psReleaseAt = Column(DateTime, nullable=True)

    # Relationships
    event = relationship("Event", back_populates="config")

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    eventId = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    username = Column(String(100), nullable=False)
    passwordHash = Column(String(255), nullable=False)
    role = Column(Enum(Role, native_enum=False), nullable=False)
    teamId = Column(String(36), ForeignKey("teams.id", ondelete="SET NULL"), unique=True, nullable=True)
    volunteerId = Column(String(36), ForeignKey("volunteers.id", ondelete="SET NULL"), unique=True, nullable=True)
    createdAt = Column(DateTime, default=func.now(), nullable=False)

    # Relationships
    event = relationship("Event", back_populates="users")
    team = relationship("Team", back_populates="user")
    volunteer = relationship("Volunteer", back_populates="user")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("eventId", "username", name="uq_user_event_username"),
    )

class Team(Base):
    __tablename__ = "teams"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    eventId = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    registrationId = Column(String(100), unique=True, nullable=False) # External key from CSV
    name = Column(String(255), nullable=False)
    leaderName = Column(String(255), nullable=False)
    leaderEmail = Column(String(255), nullable=False)
    leaderPhone = Column(String(50), nullable=False)
    collegeName = Column(String(255), nullable=False)
    status = Column(Enum(TeamStatus, native_enum=False), default=TeamStatus.REGISTERED, nullable=False)
    podId = Column(String(36), ForeignKey("pods.id", ondelete="SET NULL"), nullable=True)
    rawCsvExtra = Column(JSON, nullable=True)
    createdAt = Column(DateTime, default=func.now(), nullable=False)

    # Relationships
    event = relationship("Event", back_populates="teams")
    pod = relationship("Pod", back_populates="teams")
    members = relationship("TeamMember", back_populates="team", cascade="all, delete-orphan")
    user = relationship("User", back_populates="team", uselist=False)
    psSelection = relationship("PSSelection", back_populates="team", uselist=False, cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_team_event_status", "eventId", "status"),
    )

class TeamMember(Base):
    __tablename__ = "team_members"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    teamId = Column(String(36), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False)
    phone = Column(String(50), nullable=False)
    idVerified = Column(Boolean, default=False, nullable=False)

    # Relationships
    team = relationship("Team", back_populates="members")
    attendance = relationship("AttendanceRecord", back_populates="teamMember", cascade="all, delete-orphan")

class Pod(Base):
    __tablename__ = "pods"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    eventId = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    capacity = Column(Integer, nullable=True)

    # Relationships
    event = relationship("Event", back_populates="pods")
    teams = relationship("Team", back_populates="pod")
    volunteers = relationship("Volunteer", back_populates="pod")

    __table_args__ = (
        UniqueConstraint("eventId", "name", name="uq_pod_event_name"),
    )

class Volunteer(Base):
    __tablename__ = "volunteers"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    eventId = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    type = Column(Enum(VolunteerType, native_enum=False), nullable=False)
    contact = Column(String(100), nullable=False)
    podId = Column(String(36), ForeignKey("pods.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    event = relationship("Event", back_populates="volunteers")
    pod = relationship("Pod", back_populates="volunteers")
    user = relationship("User", back_populates="volunteer", uselist=False, cascade="all, delete-orphan")

class CheckpointType(Base):
    __tablename__ = "checkpoint_types"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    eventId = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)

    # Relationships
    event = relationship("Event", back_populates="checkpointTypes")
    records = relationship("AttendanceRecord", back_populates="checkpointType", cascade="all, delete-orphan")

class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    teamMemberId = Column(String(36), ForeignKey("team_members.id", ondelete="CASCADE"), nullable=False)
    checkpointTypeId = Column(String(36), ForeignKey("checkpoint_types.id", ondelete="CASCADE"), nullable=False)
    markedBy = Column(String(100), nullable=False) # Username of the volunteer
    timestamp = Column(DateTime, default=func.now(), nullable=False)

    # Relationships
    teamMember = relationship("TeamMember", back_populates="attendance")
    checkpointType = relationship("CheckpointType", back_populates="records")

    __table_args__ = (
        UniqueConstraint("teamMemberId", "checkpointTypeId", name="uq_member_checkpoint"),
    )

class ProblemStatement(Base):
    __tablename__ = "problem_statements"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    eventId = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    code = Column(String(100), nullable=False) # e.g. PS01
    title = Column(String(255), nullable=False)
    description = Column(String(1000), nullable=False)
    capacity = Column(Integer, nullable=False)
    selectedCount = Column(Integer, default=0, nullable=False)
    requirements = Column(Text, nullable=True)

    # Relationships
    event = relationship("Event", back_populates="problemStatements")
    selections = relationship("PSSelection", back_populates="ps", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("eventId", "code", name="uq_ps_event_code"),
    )

class PSSelection(Base):
    __tablename__ = "ps_selections"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    teamId = Column(String(36), ForeignKey("teams.id", ondelete="CASCADE"), unique=True, nullable=False)
    psId = Column(String(36), ForeignKey("problem_statements.id", ondelete="CASCADE"), nullable=False)
    selectedAt = Column(DateTime, default=func.now(), nullable=False)

    # Relationships
    team = relationship("Team", back_populates="psSelection")
    ps = relationship("ProblemStatement", back_populates="selections")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    actorId = Column(String(100), nullable=False) # User ID or "SYSTEM"
    action = Column(String(100), nullable=False)  # e.g., "team.pod_changed"
    entityType = Column(String(100), nullable=False) # e.g., "Team"
    entityId = Column(String(100), nullable=False)
    diff = Column(JSON, nullable=True)
    timestamp = Column(DateTime, default=func.now(), nullable=False)

class PendingImport(Base):
    __tablename__ = "pending_imports"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    eventId = Column(String(36), nullable=False)
    type = Column(String(50), nullable=False)  # "team" | "volunteer" | "problem_statement"
    payload = Column(JSON, nullable=False)
    createdAt = Column(DateTime, default=func.now(), nullable=False)

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    token = Column(String(255), unique=True, nullable=False)
    userId = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    revoked = Column(Boolean, default=False, nullable=False)
    expiresAt = Column(DateTime, nullable=False)
    createdAt = Column(DateTime, default=func.now(), nullable=False)

    # Relationships
    user = relationship("User", back_populates="refresh_tokens")

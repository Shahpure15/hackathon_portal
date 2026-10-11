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
    JUDGE = "JUDGE"
    VOLUNTEER = "VOLUNTEER"

class Discipline(str, enum.Enum):
    ENGINEERING = "ENGINEERING"
    DESIGN = "DESIGN"

# Models
class Organization(Base):
    __tablename__ = "organizations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False)
    createdAt = Column(DateTime, default=func.now(), nullable=False)

    events = relationship("Event", back_populates="organization")

class Event(Base):
    __tablename__ = "events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    startDate = Column(DateTime, nullable=False)
    endDate = Column(DateTime, nullable=False)
    isActive = Column(Boolean, default=True, nullable=False)
    status = Column(String(20), default="active", nullable=False) # 'upcoming', 'active', 'concluded'
    orgId = Column(String(36), ForeignKey("organizations.id", name="fk_events_orgId_organizations"), nullable=True, index=True)
    createdAt = Column(DateTime, default=func.now(), nullable=False)

    # Relationships
    config = relationship("EventConfig", back_populates="event", uselist=False, cascade="all, delete-orphan")
    organization = relationship("Organization", back_populates="events")
    users = relationship("User", back_populates="event", cascade="all, delete-orphan")
    teams = relationship("Team", back_populates="event", cascade="all, delete-orphan")
    pods = relationship("Pod", back_populates="event", cascade="all, delete-orphan")
    volunteers = relationship("Volunteer", back_populates="event", cascade="all, delete-orphan")
    checkpointTypes = relationship("CheckpointType", back_populates="event", cascade="all, delete-orphan")
    problemStatements = relationship("ProblemStatement", back_populates="event", cascade="all, delete-orphan")
    panels = relationship("Panel", back_populates="event", cascade="all, delete-orphan")
    evaluationRounds = relationship("EvaluationRound", back_populates="event", cascade="all, delete-orphan")
    roles = relationship("RbacRole", back_populates="event", cascade="all, delete-orphan")

class EventConfig(Base):
    __tablename__ = "event_configs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    eventId = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), unique=True, nullable=False)
    psReleaseAt = Column(DateTime, nullable=True)
    psGateCheckpointTypeId = Column(String(36), ForeignKey("checkpoint_types.id", ondelete="SET NULL"), nullable=True)
    peopleRoles = Column(JSON, default=list, nullable=True)
    allowVolunteerPsSelection = Column(Boolean, default=False, nullable=False)
    features = Column(JSON, nullable=True)

    # Relationships
    event = relationship("Event", back_populates="config")
    psGateCheckpointType = relationship("CheckpointType")


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    eventId = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    username = Column(String(100), nullable=False)
    passwordHash = Column(String(255), nullable=False)
    role = Column(Enum(Role, native_enum=False), nullable=False)
    teamId = Column(String(36), ForeignKey("teams.id", ondelete="SET NULL"), unique=True, nullable=True)
    volunteerId = Column(String(36), ForeignKey("volunteers.id", ondelete="SET NULL"), unique=True, nullable=True)
    status = Column(String(20), default="active", server_default="active", nullable=False) # 'active', 'invited', 'disabled'
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
    category = Column(Enum(Discipline, native_enum=False), default=Discipline.ENGINEERING, nullable=False)
    deskNumber = Column(String(20), nullable=True)
    podId = Column(String(36), ForeignKey("pods.id", ondelete="SET NULL"), nullable=True)
    rawCsvExtra = Column(JSON, nullable=True)
    createdAt = Column(DateTime, default=func.now(), nullable=False)

    # Relationships
    event = relationship("Event", back_populates="teams")
    pod = relationship("Pod", back_populates="teams")
    members = relationship("TeamMember", back_populates="team", cascade="all, delete-orphan")
    user = relationship("User", back_populates="team", uselist=False)
    psSelection = relationship("PSSelection", back_populates="team", uselist=False, cascade="all, delete-orphan")
    submissions = relationship("Submission", back_populates="team", cascade="all, delete-orphan")

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
    isTeamLeader = Column(Boolean, default=False, nullable=False)

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
    type = Column(String(100), default="VOLUNTEER", nullable=False)
    contact = Column(String(100), nullable=False)
    email = Column(String(255), nullable=True)
    remarks = Column(Text, nullable=True)
    podId = Column(String(36), ForeignKey("pods.id", ondelete="SET NULL"), nullable=True)
    panelId = Column(String(36), ForeignKey("panels.id", ondelete="SET NULL"), nullable=True)
    problemStatementId = Column(String(36), ForeignKey("problem_statements.id", ondelete="SET NULL"), nullable=True)
    teamId = Column(String(36), ForeignKey("teams.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    event = relationship("Event", back_populates="volunteers")
    pod = relationship("Pod", back_populates="volunteers")
    panel = relationship("Panel", back_populates="volunteers")
    problemStatement = relationship("ProblemStatement")
    team = relationship("Team")
    user = relationship("User", back_populates="volunteer", uselist=False, cascade="all, delete-orphan")
    attendanceRecords = relationship("VolunteerAttendanceRecord", back_populates="volunteer", cascade="all, delete-orphan")

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

class VolunteerAttendanceRecord(Base):
    __tablename__ = "volunteer_attendance_records"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    volunteerId = Column(String(36), ForeignKey("volunteers.id", ondelete="CASCADE"), nullable=False)
    checkpointTypeId = Column(String(36), ForeignKey("checkpoint_types.id", ondelete="CASCADE"), nullable=False)
    markedBy = Column(String(100), nullable=False)
    timestamp = Column(DateTime, default=func.now(), nullable=False)

    # Relationships
    volunteer = relationship("Volunteer", back_populates="attendanceRecords")
    checkpointType = relationship("CheckpointType")

    __table_args__ = (
        UniqueConstraint("volunteerId", "checkpointTypeId", name="uq_volunteer_checkpoint"),
    )

class ProblemStatement(Base):
    __tablename__ = "problem_statements"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    eventId = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    code = Column(String(100), nullable=False) # e.g. PS01
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    capacity = Column(Integer, nullable=False)
    selectedCount = Column(Integer, default=0, nullable=False)
    requirements = Column(Text, nullable=True)
    discipline = Column(Enum(Discipline, native_enum=False), nullable=True)

    # Relationships
    event = relationship("Event", back_populates="problemStatements")
    selections = relationship("PSSelection", back_populates="ps", cascade="all, delete-orphan")
    panel = relationship("Panel", back_populates="problemStatement", uselist=False)

    __table_args__ = (
        UniqueConstraint("eventId", "code", name="uq_ps_event_code"),
    )

class Panel(Base):
    __tablename__ = "panels"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    eventId = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    facultyMemberName = Column(String(255), nullable=True)
    memberNames = Column(JSON, nullable=False, default=list)
    problemStatementId = Column(String(36), ForeignKey("problem_statements.id", ondelete="SET NULL"), nullable=True, unique=True)

    event = relationship("Event", back_populates="panels")
    problemStatement = relationship("ProblemStatement", back_populates="panel", uselist=False)
    volunteers = relationship("Volunteer", back_populates="panel")

    __table_args__ = (
        UniqueConstraint("eventId", "name", name="uq_panel_event_name"),
    )

class EvaluationRound(Base):
    __tablename__ = "evaluation_rounds"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    eventId = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    roundNumber = Column(Integer, nullable=False)
    description = Column(Text, nullable=True)
    fields = Column(JSON, nullable=True, default=list)
    isSubmissionOpen = Column(Boolean, default=False, nullable=False)
    createdAt = Column(DateTime, default=func.now(), nullable=False)

    event = relationship("Event", back_populates="evaluationRounds")
    submissions = relationship("Submission", back_populates="round", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("eventId", "roundNumber", name="uq_round_event_number"),
    )

class Submission(Base):
    __tablename__ = "submissions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    teamId = Column(String(36), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    roundId = Column(String(36), ForeignKey("evaluation_rounds.id", ondelete="CASCADE"), nullable=False)
    driveLink = Column(String(500), nullable=True)
    githubLink = Column(String(500), nullable=True)
    answers = Column(JSON, nullable=True, default=dict)
    submittedAt = Column(DateTime, default=func.now(), nullable=False)
    updatedAt = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    team = relationship("Team", back_populates="submissions")
    round = relationship("EvaluationRound", back_populates="submissions")

    __table_args__ = (
        UniqueConstraint("teamId", "roundId", name="uq_submission_team_round"),
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
    eventId = Column(String(36), nullable=True, index=True)
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


class RbacRole(Base):
    __tablename__ = "roles"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    eventId = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(500), nullable=True)
    isSystem = Column(Boolean, default=False, nullable=False)
    systemKey = Column(String(30), nullable=True)
    sourceTemplateId = Column(String(36), nullable=True)
    createdAt = Column(DateTime, default=func.now(), nullable=False)
    updatedAt = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    event = relationship("Event", back_populates="roles")
    permissions = relationship("RolePermission", back_populates="role", cascade="all, delete-orphan")
    assignments = relationship("UserRoleAssignment", back_populates="role", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("eventId", "name", name="uq_roles_event_name"),
    )


class RolePermission(Base):
    __tablename__ = "role_permissions"

    roleId = Column(String(36), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    permissionKey = Column(String(100), primary_key=True)

    # Relationships
    role = relationship("RbacRole", back_populates="permissions")


class RoleTemplate(Base):
    __tablename__ = "role_templates"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    orgId = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(String(500), nullable=True)
    permissions = Column(JSON, nullable=False, default=list)
    createdFromRoleId = Column(String(36), nullable=True)
    createdAt = Column(DateTime, default=func.now(), nullable=False)

    # Relationships
    organization = relationship("Organization")

    __table_args__ = (
        UniqueConstraint("orgId", "name", name="uq_role_templates_org_name"),
    )


class UserRoleAssignment(Base):
    __tablename__ = "user_role_assignments"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    eventId = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    userId = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    roleId = Column(String(36), ForeignKey("roles.id", ondelete="CASCADE"), nullable=False)
    scope = Column(JSON, nullable=True)
    createdBy = Column(String(100), nullable=True)
    createdAt = Column(DateTime, default=func.now(), nullable=False)

    # Relationships
    role = relationship("RbacRole", back_populates="assignments")
    user = relationship("User")
    event = relationship("Event")

    __table_args__ = (
        UniqueConstraint("userId", "roleId", name="uq_user_role_assignments_user_role"),
    )


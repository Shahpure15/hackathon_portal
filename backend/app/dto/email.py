from datetime import datetime
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, ConfigDict


class SmtpAccountCreateDTO(BaseModel):
    model_config = ConfigDict(extra="ignore")
    label: str
    host: str
    port: int
    security: str = "starttls"  # starttls | ssl
    username: str
    password: str
    fromEmail: str
    fromName: Optional[str] = None
    replyTo: Optional[str] = None
    dailyLimit: Optional[int] = None
    perMinuteLimit: Optional[int] = None
    priority: int = 0


class SmtpAccountUpdateDTO(BaseModel):
    model_config = ConfigDict(extra="ignore")
    label: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    security: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    fromEmail: Optional[str] = None
    fromName: Optional[str] = None
    replyTo: Optional[str] = None
    dailyLimit: Optional[int] = None
    perMinuteLimit: Optional[int] = None
    priority: Optional[int] = None
    status: Optional[str] = None


class SmtpAccountResponseDTO(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    label: str
    host: str
    port: int
    security: str
    username: str
    hasPassword: bool = True
    fromEmail: str
    fromName: Optional[str] = None
    replyTo: Optional[str] = None
    dailyLimit: Optional[int] = None
    perMinuteLimit: Optional[int] = None
    sentToday: int = 0
    status: str
    lastError: Optional[str] = None
    priority: int = 0
    createdAt: datetime


class TestConnectionRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    targetEmail: Optional[str] = None


class TemplateUpdateDTO(BaseModel):
    model_config = ConfigDict(extra="ignore")
    subject: str
    body: str


class TemplatePreviewRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    variables: Optional[Dict[str, Any]] = None

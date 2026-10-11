from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class PermissionCatalogItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    key: str
    label: str
    module: str
    tier: str
    scopable: bool
    implies: List[str]
    assignable: bool
    future: bool


class ModuleCatalogGroup(BaseModel):
    module: str
    permissions: List[PermissionCatalogItem]


class CatalogResponse(BaseModel):
    modules: List[ModuleCatalogGroup]
    permissions: List[PermissionCatalogItem]


class RoleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    description: Optional[str] = None
    isSystem: bool = False
    systemKey: Optional[str] = None
    sourceTemplateId: Optional[str] = None
    permissions: List[str] = Field(default_factory=list)
    expandedCount: int = 0
    memberCount: int = 0
    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None


class RoleCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    permissions: List[str] = Field(default_factory=list)
    confirmSensitive: bool = False


class RoleUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[List[str]] = None
    confirmSensitive: bool = False


class RoleTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    orgId: str
    name: str
    description: Optional[str] = None
    permissions: List[str] = Field(default_factory=list)
    createdFromRoleId: Optional[str] = None
    createdAt: Optional[datetime] = None


class RoleTemplateCreateFromRoleRequest(BaseModel):
    roleId: str
    name: Optional[str] = None
    description: Optional[str] = None


class RoleFromTemplateRequest(BaseModel):
    templateId: str
    name: Optional[str] = None


class RoleMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    userId: str
    volunteerId: Optional[str] = None
    name: str
    type: Optional[str] = None
    scope: Optional[Dict[str, Any]] = None


class RoleMemberAddRequest(BaseModel):
    volunteerId: str
    scope: Optional[Dict[str, Any]] = None


class RoleMemberUpdateScopeRequest(BaseModel):
    scope: Optional[Dict[str, Any]] = None


class FeaturesUpdateRequest(BaseModel):
    pods: Optional[bool] = None
    evaluation: Optional[bool] = None

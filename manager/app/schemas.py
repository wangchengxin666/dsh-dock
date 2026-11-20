from __future__ import annotations

import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from .config import DEFAULT_AUTO_INSTALL_PLUGINS

_MEMORY_RE = re.compile(r"^[1-9][0-9]*(\.[0-9]+)?[kmg]$", re.IGNORECASE)


def _normalize_memory(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip().lower()
    if not _MEMORY_RE.fullmatch(value):
        raise ValueError("memory_limit must look like 512m, 4g, or 16g")
    return value


def _normalize_password(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if len(cleaned) < 6 or len(cleaned) > 128:
        raise ValueError("password length must be between 6 and 128 characters")
    return cleaned


class UserCreate(BaseModel):
    email: EmailStr
    display_name: str | None = None
    role: Literal["user", "admin"] = "user"
    password: str | None = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str | None) -> str | None:
        return _normalize_password(value)


class UserUpdate(BaseModel):
    display_name: str | None = None
    status: Literal["active", "disabled"] | None = None
    password: str | None = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str | None) -> str | None:
        return _normalize_password(value)


class UserPasswordChange(BaseModel):
    current_password: str | None = None
    new_password: str = Field(min_length=6, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    display_name: str | None
    role: str
    status: str
    has_password: bool = False
    sandbox_count: int = 0
    created_at: datetime | None = None


class AdminCreate(BaseModel):
    email: EmailStr
    display_name: str | None = None


class AdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    email: str
    display_name: str | None
    active: bool
    created_at: datetime


class TemplateCreate(BaseModel):
    key: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{1,62}$")
    name: str = Field(min_length=1, max_length=128)
    description: str | None = None
    image_repo: str = "dsh-sandbox"
    image_tag: str = "latest"
    default_cpu_limit: float = Field(default=2.0, gt=0, le=64)
    default_memory_limit: str = "4g"
    auto_install_plugins: str | None = DEFAULT_AUTO_INSTALL_PLUGINS
    init_script: str | None = None
    default_env_json: str | None = "{}"

    @field_validator("default_memory_limit")
    @classmethod
    def validate_memory(cls, value: str) -> str:
        return _normalize_memory(value) or "4g"


class TemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    image_repo: str | None = None
    image_tag: str | None = None
    default_cpu_limit: float | None = Field(default=None, gt=0, le=64)
    default_memory_limit: str | None = None
    auto_install_plugins: str | None = None
    init_script: str | None = None
    default_env_json: str | None = None

    @field_validator("default_memory_limit")
    @classmethod
    def validate_memory(cls, value: str | None) -> str | None:
        return _normalize_memory(value)


class TemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    key: str
    name: str
    description: str | None
    image_repo: str
    image_tag: str
    default_cpu_limit: float
    default_memory_limit: str
    auto_install_plugins: str | None
    init_script: str | None
    default_env_json: str | None
    is_builtin: bool
    created_at: datetime
    updated_at: datetime


class SandboxCreate(BaseModel):
    email: EmailStr
    slug: str | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9-]{1,62}$")
    display_name: str | None = None
    initial_password: str | None = None
    image_repo: str | None = None
    image_tag: str | None = None
    template: str = "agent-os"
    init_repo_url: str | None = None
    init_script: str | None = None
    auto_install_plugins: str | None = None
    llm_profile_id: str | None = None
    cpu_limit: float | None = Field(default=None, gt=0, le=64)
    memory_limit: str | None = None
    auto_sleep_exempt: bool = False

    @field_validator("initial_password")
    @classmethod
    def validate_initial_password(cls, value: str | None) -> str | None:
        return _normalize_password(value)

    @field_validator("memory_limit")
    @classmethod
    def validate_memory(cls, value: str | None) -> str | None:
        return _normalize_memory(value)


class SandboxPatch(BaseModel):
    image_repo: str | None = None
    image_tag: str | None = None
    llm_profile_id: str | None = None
    cpu_limit: float | None = Field(default=None, gt=0, le=64)
    memory_limit: str | None = None
    auto_sleep_exempt: bool | None = None

    @field_validator("memory_limit")
    @classmethod
    def validate_memory(cls, value: str | None) -> str | None:
        return _normalize_memory(value)


class SandboxOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    display_name: str | None = None
    slug: str
    container_id: str | None
    volume_name: str
    image_repo: str | None = "dsh-sandbox"
    image_tag: str
    template: str | None = "agent-os"
    init_repo_url: str | None = None
    auto_install_plugins: str | None = None
    llm_profile_id: str | None = None
    llm_profile_name: str | None = None
    cpu_limit: float | None
    memory_limit: str | None
    auto_sleep_exempt: bool = False
    disk_usage_mb: float | None = None
    disk_updated_at: datetime | None = None
    status: str
    url: str
    created_at: datetime
    last_seen_at: datetime | None
    deleted_at: datetime | None


class PluginSyncRequest(BaseModel):
    mode: Literal["market_only", "reinstall_builtin", "reinstall_selected"] = "market_only"
    plugins: list[str] = Field(default_factory=list)
    sandbox_ids: list[str] | None = None


class IdleSleepPolicyOut(BaseModel):
    enabled: bool = False
    idle_minutes: int = Field(default=240, ge=5, le=43200)


class IdleSleepPolicyUpdate(BaseModel):
    enabled: bool
    idle_minutes: int = Field(default=240, ge=5, le=43200)


class SandboxList(BaseModel):
    items: list[SandboxOut]


class HealthOut(BaseModel):
    status: str
    database: str
    docker: str


LLM_API_PROTOCOLS = Literal[
    "openai-completions",
    "openai-responses",
    "anthropic-messages",
    "google-generative-ai",
]
LLM_REASONING_EFFORTS = Literal[
    "",
    "off",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
]
LLM_THINKING_FORMATS = Literal[
    "",
    "openai",
    "deepseek",
    "openrouter",
    "together",
    "baseten",
    "zai",
    "qwen",
    "chat-template",
    "qwen-chat-template",
    "string-thinking",
    "ant-ling",
]


class LlmProfileCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    base_url: str = Field(min_length=1, max_length=512)
    model: str = Field(min_length=1, max_length=128)
    api_key: str = ""
    api_protocol: LLM_API_PROTOCOLS = "openai-completions"
    context_window: int | None = Field(default=None, ge=1024, le=10_000_000)
    max_tokens: int | None = Field(default=None, ge=128, le=1_000_000)
    supports_image: bool = False
    reasoning_effort: LLM_REASONING_EFFORTS | None = None
    thinking_format: LLM_THINKING_FORMATS | None = None


class LlmProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    base_url: str | None = Field(default=None, min_length=1, max_length=512)
    model: str | None = Field(default=None, min_length=1, max_length=128)
    api_key: str | None = None
    clear_api_key: bool = False
    api_protocol: LLM_API_PROTOCOLS | None = None
    context_window: int | None = Field(default=None, ge=1024, le=10_000_000)
    max_tokens: int | None = Field(default=None, ge=128, le=1_000_000)
    supports_image: bool | None = None
    reasoning_effort: LLM_REASONING_EFFORTS | None = None
    thinking_format: LLM_THINKING_FORMATS | None = None


class LlmProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    base_url: str
    model: str
    api_protocol: str = "openai-completions"
    context_window: int | None = None
    max_tokens: int | None = None
    supports_image: bool = False
    reasoning_effort: str | None = None
    thinking_format: str | None = None
    has_api_key: bool = False
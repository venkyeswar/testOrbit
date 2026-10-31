from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Provider = Literal["openai", "anthropic", "google", "azure_openai", "ollama", "openai_compatible"]
Category = Literal["happy_path", "negative", "boundary", "auth", "workflow"]


def _http_url(value: str | None) -> str | None:
    if value in (None, ""):
        return None
    value = value.strip().rstrip("/")
    if not value.startswith(("http://", "https://")):
        raise ValueError("must start with http:// or https://")
    return value


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(default="", max_length=120)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class ModelConfigPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    provider: Provider | None = None
    model: str | None = Field(default=None, min_length=1, max_length=200)
    api_key: str | None = Field(default=None, max_length=4000)
    base_url: str | None = Field(default=None, max_length=500)
    api_version: str | None = Field(default=None, max_length=40)
    deployment: str | None = Field(default=None, max_length=200)
    temperature: float | None = Field(default=None, ge=0, le=2)
    is_default: bool | None = None

    model_config = ConfigDict(protected_namespaces=())

    @field_validator("base_url")
    @classmethod
    def _check_url(cls, v):
        return _http_url(v)


class ModelConfigIn(ModelConfigPatch):
    name: str = Field(min_length=1, max_length=120)
    provider: Provider
    model: str = Field(min_length=1, max_length=200)
    temperature: float = Field(default=0, ge=0, le=2)
    is_default: bool = False


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    base_url: str = Field(max_length=500)
    spec_url: str | None = Field(default=None, max_length=1000)
    spec: dict[str, Any] | None = None
    model_config_id: str | None = None

    model_config = ConfigDict(protected_namespaces=())

    @field_validator("base_url", "spec_url")
    @classmethod
    def _check_urls(cls, v):
        return _http_url(v)


class ProjectPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    base_url: str | None = Field(default=None, max_length=500)
    model_config_id: str | None = None

    model_config = ConfigDict(protected_namespaces=())

    @field_validator("base_url")
    @classmethod
    def _check_url(cls, v):
        return _http_url(v)


class GenerateIn(BaseModel):
    endpoint_ids: list[str] = []
    categories: list[Category] = ["happy_path", "negative"]
    max_tests: int = Field(default=15, ge=1, le=50)


class ApproveIn(BaseModel):
    test_ids: list[str]
    approved: bool = True


class RunIn(BaseModel):
    test_ids: list[str] | None = None


TEST_EDITABLE_FIELDS = {"name", "description", "category", "method", "path", "headers", "query", "body",
                        "expected_status", "assertions", "extract", "requires_auth", "order", "approved"}

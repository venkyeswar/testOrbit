"""ORM models. Timestamps are ISO-8601 UTC strings; flexible documents live in JSON columns."""
from typing import Any

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base, new_id, now


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("u"))
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[str] = mapped_column(String(40), default=now)

    models: Mapped[list["ModelConfig"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    projects: Mapped[list["Project"]] = relationship(back_populates="user", cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        return {"id": self.id, "email": self.email, "name": self.name, "created_at": self.created_at}


class ModelConfig(Base):
    __tablename__ = "model_configs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("m"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    provider: Mapped[str] = mapped_column(String(40))
    model: Mapped[str] = mapped_column(String(200))
    base_url: Mapped[str | None] = mapped_column(String(500))
    api_version: Mapped[str | None] = mapped_column(String(40))
    deployment: Mapped[str | None] = mapped_column(String(200))
    temperature: Mapped[float] = mapped_column(Float, default=0.0)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    api_key_enc: Mapped[str | None] = mapped_column(Text)  # Fernet-encrypted, never returned
    api_key_hint: Mapped[str | None] = mapped_column(String(40))
    created_at: Mapped[str] = mapped_column(String(40), default=now)

    user: Mapped[User] = relationship(back_populates="models")

    def to_dict(self) -> dict:
        return {
            "id": self.id, "name": self.name, "provider": self.provider, "model": self.model,
            "base_url": self.base_url, "api_version": self.api_version, "deployment": self.deployment,
            "temperature": self.temperature, "is_default": self.is_default,
            "has_api_key": bool(self.api_key_enc), "api_key_hint": self.api_key_hint, "created_at": self.created_at,
        }


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("p"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    model_config_id: Mapped[str | None] = mapped_column(ForeignKey("model_configs.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(200))
    base_url: Mapped[str] = mapped_column(String(500))
    spec_url: Mapped[str | None] = mapped_column(String(1000))
    spec: Mapped[dict[str, Any]] = mapped_column(JSON)
    endpoints: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    auth: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[str] = mapped_column(String(40), default=now)

    user: Mapped[User] = relationship(back_populates="projects")
    model_config: Mapped[ModelConfig | None] = relationship()
    tests: Mapped[list["TestCase"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    runs: Mapped[list["Run"]] = relationship(back_populates="project", cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        return {
            "id": self.id, "name": self.name, "base_url": self.base_url, "spec_url": self.spec_url,
            "model_config_id": self.model_config_id, "auth": self.auth,
            "endpoint_count": len(self.endpoints or []), "created_at": self.created_at,
        }


class TestCase(Base):
    __tablename__ = "test_cases"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("t"))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    order: Mapped[int] = mapped_column(Integer, default=0)
    approved: Mapped[bool] = mapped_column(Boolean, default=False)
    data: Mapped[dict[str, Any]] = mapped_column(JSON)  # name, method, path, body, assertions, ...
    created_at: Mapped[str] = mapped_column(String(40), default=now)

    project: Mapped[Project] = relationship(back_populates="tests")

    def to_dict(self) -> dict:
        return {**self.data, "id": self.id, "project_id": self.project_id, "order": self.order,
                "approved": self.approved, "created_at": self.created_at}


class Run(Base):
    __tablename__ = "runs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("r"))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="queued")
    started_at: Mapped[str] = mapped_column(String(40), default=now)
    finished_at: Mapped[str | None] = mapped_column(String(40))
    test_ids: Mapped[list[str] | None] = mapped_column(JSON)
    progress: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    summary: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    auth: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    results: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    error: Mapped[str | None] = mapped_column(Text)

    project: Mapped[Project] = relationship(back_populates="runs")

    def to_dict(self) -> dict:
        return {"id": self.id, "project_id": self.project_id, "status": self.status, "started_at": self.started_at,
                "finished_at": self.finished_at, "summary": self.summary, "auth": self.auth,
                "progress": self.progress or {"done": 0, "total": len(self.test_ids or []), "stage": "queued"},
                "results": self.results, "error": self.error}

"""Shared lookups that enforce ownership: another user's ids always look like 404s."""
from fastapi import HTTPException
from langchain_core.language_models import BaseChatModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import llm
from .models import ModelConfig, Project, User
from .security import decrypt_secret


def owned_project(db: Session, user: User, project_id: str) -> Project:
    project = db.get(Project, project_id)
    if not project or project.user_id != user.id:
        raise HTTPException(404, "Project not found")
    return project


def owned_model(db: Session, user: User, model_id: str) -> ModelConfig:
    mc = db.get(ModelConfig, model_id)
    if not mc or mc.user_id != user.id:
        raise HTTPException(404, "Model not found")
    return mc


def model_settings(mc: ModelConfig) -> dict:
    return {"provider": mc.provider, "model": mc.model, "api_key": decrypt_secret(mc.api_key_enc),
            "base_url": mc.base_url, "api_version": mc.api_version, "deployment": mc.deployment,
            "temperature": mc.temperature}


def default_model(db: Session, user: User) -> ModelConfig | None:
    return db.scalars(select(ModelConfig).where(ModelConfig.user_id == user.id)
                      .order_by(ModelConfig.is_default.desc(), ModelConfig.created_at)).first()


def project_llm(db: Session, user: User, project: Project | None) -> BaseChatModel | None:
    """The project's model, else the user's default model, else None."""
    mc = (project.model_config if project else None) or default_model(db, user)
    if mc is None:
        return None
    settings = model_settings(mc)
    if mc.provider in ("openai", "anthropic", "google", "azure_openai") and not settings["api_key"]:
        raise HTTPException(400, f"The API key for model '{mc.name}' can't be read. Re-enter it under Models.")
    return llm.build_chat_model(settings)

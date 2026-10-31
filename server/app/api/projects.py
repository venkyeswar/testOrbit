from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import auth, openapi
from ..db import get_db
from ..deps import owned_model, owned_project, project_llm
from ..models import Project, User
from ..schemas import ProjectIn, ProjectPatch
from ..security import current_user

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _detect(db: Session, user: User, project: Project | None, spec: dict, endpoints: list) -> dict:
    try:
        model = project_llm(db, user, project)
    except HTTPException:
        model = None  # unreadable key: heuristics only
    return auth.detect(spec, endpoints, model)


@router.get("")
def list_projects(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Project).where(Project.user_id == user.id).order_by(Project.created_at.desc()))
    return [p.to_dict() for p in rows]


@router.post("", status_code=201)
def create_project(body: ProjectIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.model_config_id:
        owned_model(db, user, body.model_config_id)
    try:
        spec = openapi.load_spec(body.spec_url, body.spec)
        endpoints = openapi.parse_endpoints(spec)
    except Exception as exc:
        raise HTTPException(400, f"Invalid OpenAPI spec: {exc}")
    project = Project(user_id=user.id, name=body.name, base_url=body.base_url, spec_url=body.spec_url,
                      spec=spec, endpoints=endpoints, model_config_id=body.model_config_id)
    db.add(project)
    db.flush()
    project.auth = _detect(db, user, project, spec, endpoints)
    db.commit()
    return project.to_dict()


@router.get("/{pid}")
def get_project(pid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return owned_project(db, user, pid).to_dict()


@router.patch("/{pid}")
def update_project(pid: str, body: ProjectPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    project = owned_project(db, user, pid)
    changes = body.model_dump(exclude_unset=True)
    if changes.get("model_config_id"):
        owned_model(db, user, changes["model_config_id"])
    for field, value in changes.items():
        if value is not None or field == "model_config_id":  # explicit null = use default model
            setattr(project, field, value)
    db.commit()
    return project.to_dict()


@router.delete("/{pid}")
def delete_project(pid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(owned_project(db, user, pid))
    db.commit()
    return {"ok": True}


@router.get("/{pid}/endpoints")
def list_endpoints(pid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return owned_project(db, user, pid).endpoints


@router.post("/{pid}/auth/detect")
def redetect_auth(pid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    project = owned_project(db, user, pid)
    if project.spec_url:  # pick up contract changes
        try:
            project.spec = openapi.load_spec(project.spec_url, None)
            project.endpoints = openapi.parse_endpoints(project.spec)
        except Exception as exc:
            raise HTTPException(400, f"Could not reload the OpenAPI spec: {exc}")
    project.auth = _detect(db, user, project, project.spec, project.endpoints)
    db.commit()
    return project.to_dict()


@router.post("/{pid}/auth/verify")
def verify_auth(pid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    project = owned_project(db, user, pid)
    _, check, _ = auth.perform(project.auth or {}, project.base_url, "verify")
    return check or {"ok": True, "steps": [], "token_preview": None, "error": None}

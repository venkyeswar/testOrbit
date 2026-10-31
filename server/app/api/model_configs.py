from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .. import llm
from ..db import get_db
from ..deps import model_settings, owned_model
from ..models import ModelConfig, User
from ..schemas import ModelConfigIn, ModelConfigPatch
from ..security import current_user, encrypt_secret, key_hint

router = APIRouter(prefix="/api/models", tags=["models"])


def _validate(cfg: dict) -> None:
    missing = llm.missing_fields(cfg)
    if missing:
        raise HTTPException(422, f"Missing required field(s) for {cfg['provider']}: {', '.join(missing)}")


def _make_default(db: Session, user: User, mc: ModelConfig) -> None:
    db.execute(update(ModelConfig).where(ModelConfig.user_id == user.id, ModelConfig.id != mc.id).values(is_default=False))
    mc.is_default = True


@router.get("/providers")
def providers():
    return llm.PROVIDERS


@router.get("")
def list_models(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(ModelConfig).where(ModelConfig.user_id == user.id).order_by(ModelConfig.created_at))
    return [m.to_dict() for m in rows]


@router.post("", status_code=201)
def create_model(body: ModelConfigIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _validate(body.model_dump())
    mc = ModelConfig(user_id=user.id, **body.model_dump(exclude={"api_key", "is_default"}))
    if body.api_key:
        mc.api_key_enc, mc.api_key_hint = encrypt_secret(body.api_key), key_hint(body.api_key)
    db.add(mc)
    db.flush()
    has_other = db.scalar(select(ModelConfig.id).where(ModelConfig.user_id == user.id, ModelConfig.id != mc.id))
    if body.is_default or not has_other:
        _make_default(db, user, mc)
    db.commit()
    return mc.to_dict()


@router.patch("/{model_id}")
def update_model(model_id: str, body: ModelConfigPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    mc = owned_model(db, user, model_id)
    changes = body.model_dump(exclude_unset=True)
    api_key = changes.pop("api_key", None)
    make_default = changes.pop("is_default", None)
    nulled = [f for f in ("name", "provider", "model", "temperature") if f in changes and changes[f] is None]
    if nulled:
        raise HTTPException(422, f"{', '.join(nulled)} cannot be null")
    for field, value in changes.items():
        setattr(mc, field, value)
    if api_key:  # empty / omitted keeps the stored key
        mc.api_key_enc, mc.api_key_hint = encrypt_secret(api_key), key_hint(api_key)
    _validate({**mc.to_dict(), "api_key": mc.api_key_enc})
    if make_default:
        _make_default(db, user, mc)
    db.commit()
    return mc.to_dict()


@router.delete("/{model_id}")
def delete_model(model_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    mc = owned_model(db, user, model_id)
    was_default = mc.is_default
    db.delete(mc)
    db.flush()
    if was_default:  # promote the oldest remaining model
        nxt = db.scalars(select(ModelConfig).where(ModelConfig.user_id == user.id).order_by(ModelConfig.created_at)).first()
        if nxt:
            nxt.is_default = True
    db.commit()
    return {"ok": True}


@router.post("/test")
def test_draft(body: ModelConfigIn, user: User = Depends(current_user)):
    cfg = body.model_dump()
    _validate(cfg)
    return llm.test_connection(cfg)


@router.post("/{model_id}/test")
def test_saved(model_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return llm.test_connection(model_settings(owned_model(db, user, model_id)))

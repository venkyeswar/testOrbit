from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import User
from ..ratelimit import client_ip, login_limiter, signup_limiter
from ..schemas import LoginIn, SignupIn
from ..security import create_access_token, current_user, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["accounts"])


def _session(user: User) -> dict:
    return {"access_token": create_access_token(user.id), "token_type": "bearer", "user": user.to_dict()}


@router.post("/signup", status_code=201)
def signup(body: SignupIn, request: Request, db: Session = Depends(get_db)):
    signup_limiter.check(client_ip(request))
    email = body.email.lower()
    if db.scalar(select(User).where(func.lower(User.email) == email)):
        raise HTTPException(409, "An account with this email already exists")
    user = User(email=email, name=body.name.strip() or email.split("@")[0], password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    return _session(user)


@router.post("/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    login_limiter.check(f"{client_ip(request)}|{body.email.lower()}")
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    if not verify_password(body.password, user.password_hash if user else None):
        raise HTTPException(401, "Invalid email or password")
    return _session(user)


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user.to_dict()

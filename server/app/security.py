"""Password hashing, JWT sessions, and encryption of users' model API keys."""
from datetime import datetime, timedelta, timezone

import jwt
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from .config import ACCESS_TOKEN_DAYS, SECRET_KEY
from .db import get_db
from .models import User

_hasher = PasswordHash.recommended()  # argon2id
_DUMMY_HASH = _hasher.hash("timing-equaliser")
_bearer = HTTPBearer(auto_error=False)
_ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    # Always run a verify so unknown emails take as long as wrong passwords.
    return _hasher.verify(password, password_hash or _DUMMY_HASH) and password_hash is not None


def create_access_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "iat": now, "exp": now + timedelta(days=ACCESS_TOKEN_DAYS), "type": "access"}
    return jwt.encode(payload, SECRET_KEY, algorithm=_ALGORITHM)


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer), db: Session = Depends(get_db)) -> User:
    unauthorized = HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    if not creds:
        raise unauthorized
    try:
        payload = jwt.decode(creds.credentials, SECRET_KEY, algorithms=[_ALGORITHM])
    except jwt.PyJWTError:
        raise unauthorized
    user = db.get(User, payload.get("sub"))
    if not user:
        raise unauthorized
    return user


# ---------------------------------------------------------------- API key encryption

_fernet = Fernet(__import__("base64").urlsafe_b64encode(
    HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"testorbit-model-api-keys").derive(SECRET_KEY.encode())
))


def encrypt_secret(value: str) -> str:
    return _fernet.encrypt(value.encode()).decode()


def decrypt_secret(token: str | None) -> str | None:
    if not token:
        return None
    try:
        return _fernet.decrypt(token.encode()).decode()
    except InvalidToken:
        return None  # SECRET_KEY changed; the user must re-enter the key


def key_hint(value: str) -> str:
    return f"{value[:3]}…{value[-4:]}" if len(value) > 10 else "…" + value[-2:]

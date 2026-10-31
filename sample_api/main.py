"""Small in-memory demo API used as a target for API-testing tools.

Run from this directory:  uvicorn main:app --port 9000
"""

import itertools
import uuid
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

app = FastAPI(title="Sample Items API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# auto_error=False so a missing header yields our own 401 (not FastAPI's 403).
bearer_scheme = HTTPBearer(auto_error=False)

# ---------------------------------------------------------------------------
# In-memory storage
# ---------------------------------------------------------------------------
users: dict[str, dict] = {}          # username -> {"id", "username", "password"}
tokens: dict[str, str] = {}          # access_token -> username
items: dict[int, dict] = {}          # item_id -> item dict
_user_ids = itertools.count(1)
_item_ids = itertools.count(1)


def _create_user(username: str, password: str) -> dict:
    user = {"id": next(_user_ids), "username": username, "password": password}
    users[username] = user
    return user


_create_user("demo", "demo123")  # pre-seeded demo user


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class Credentials(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=6, max_length=100)


class SigninRequest(BaseModel):
    # No min length here: bad credentials must yield 401, not 422.
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=100)


class SignupResponse(BaseModel):
    id: int
    username: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    price: float = Field(ge=0)
    quantity: int = Field(default=0, ge=0)


class Item(BaseModel):
    id: int
    name: str
    price: float
    quantity: int


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------
def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> str:
    if credentials is None or credentials.credentials not in tokens:
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return tokens[credentials.credentials]


AUTH_401 = {401: {"description": "Missing or invalid bearer token"}}
NOT_FOUND_404 = {404: {"description": "Item not found"}}


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@app.post(
    "/auth/signup",
    response_model=SignupResponse,
    status_code=201,
    responses={409: {"description": "Username already exists"}},
    tags=["auth"],
)
def signup(body: Credentials):
    if body.username in users:
        raise HTTPException(status_code=409, detail="Username already exists")
    user = _create_user(body.username, body.password)
    return SignupResponse(id=user["id"], username=user["username"])


@app.post(
    "/auth/signin",
    response_model=TokenResponse,
    status_code=200,
    responses={401: {"description": "Bad username or password"}},
    tags=["auth"],
)
def signin(body: SigninRequest):
    user = users.get(body.username)
    if user is None or user["password"] != body.password:
        raise HTTPException(status_code=401, detail="Bad username or password")
    token = str(uuid.uuid4())
    tokens[token] = user["username"]
    return TokenResponse(access_token=token, token_type="bearer")


# ---------------------------------------------------------------------------
# Items routes (all require Bearer auth)
# ---------------------------------------------------------------------------
@app.get(
    "/items",
    response_model=list[Item],
    responses=AUTH_401,
    tags=["items"],
)
def list_items(_user: str = Depends(get_current_user)):
    return [Item(**item) for item in items.values()]


@app.post(
    "/items",
    response_model=Item,
    status_code=201,
    responses=AUTH_401,
    tags=["items"],
)
def create_item(body: ItemIn, _user: str = Depends(get_current_user)):
    item_id = next(_item_ids)
    item = {"id": item_id, **body.model_dump()}
    items[item_id] = item
    return Item(**item)


@app.get(
    "/items/{item_id}",
    response_model=Item,
    responses={**AUTH_401, **NOT_FOUND_404},
    tags=["items"],
)
def get_item(item_id: int, _user: str = Depends(get_current_user)):
    item = items.get(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return Item(**item)


@app.put(
    "/items/{item_id}",
    response_model=Item,
    responses={**AUTH_401, **NOT_FOUND_404},
    tags=["items"],
)
def update_item(item_id: int, body: ItemIn, _user: str = Depends(get_current_user)):
    item = items.get(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    item["name"] = body.name
    # DEMO BUG: the `price` from the request body is intentionally ignored here;
    # the old price is kept. A test asserting the updated price will fail.
    # Fix would be: item["price"] = body.price
    item["quantity"] = body.quantity
    return Item(**item)


@app.delete(
    "/items/{item_id}",
    status_code=204,
    response_class=Response,
    responses={**AUTH_401, **NOT_FOUND_404},
    tags=["items"],
)
def delete_item(item_id: int, _user: str = Depends(get_current_user)):
    if items.pop(item_id, None) is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}

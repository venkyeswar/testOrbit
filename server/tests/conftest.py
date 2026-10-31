"""Shared test setup. Env vars must be set BEFORE the app is imported (config and DB engine read them at import)."""
import os
import tempfile
import uuid

_TMP_DIR = tempfile.mkdtemp(prefix="testorbit-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(_TMP_DIR, 'test.db')}"
os.environ["SECRET_KEY"] = "test-secret"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

PASSWORD = "correct-horse-battery-1"


@pytest.fixture
def client():
    # Context manager runs the lifespan, which creates the tables.
    with TestClient(app) as c:
        yield c


def _signup(client: TestClient, prefix: str) -> dict:
    email = f"{prefix}-{uuid.uuid4().hex[:10]}@example.com"
    resp = client.post("/api/auth/signup", json={"email": email, "password": PASSWORD, "name": prefix})
    assert resp.status_code == 201, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
def auth_headers(client):
    return _signup(client, "alice")


@pytest.fixture
def other_headers(client):
    return _signup(client, "bob")


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    # Every test signs up from the same "IP"; keep tests independent of each other.
    from app.ratelimit import login_limiter, signup_limiter

    login_limiter.reset()
    signup_limiter.reset()
    yield

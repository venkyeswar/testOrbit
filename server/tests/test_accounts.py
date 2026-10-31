import jwt


def test_signup_returns_session_and_lowercases_email(client):
    resp = client.post("/api/auth/signup", json={"email": "New.User@Example.com", "password": "longenough1", "name": "New"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["token_type"] == "bearer" and body["access_token"]
    assert body["user"]["email"] == "new.user@example.com"
    assert body["user"]["name"] == "New"
    assert "password" not in resp.text


def test_signup_rejects_short_password(client):
    resp = client.post("/api/auth/signup", json={"email": "short@example.com", "password": "short7!"})
    assert resp.status_code == 422


def test_signup_duplicate_email_is_case_insensitive(client):
    payload = {"email": "dup@example.com", "password": "longenough1"}
    assert client.post("/api/auth/signup", json=payload).status_code == 201
    resp = client.post("/api/auth/signup", json={**payload, "email": "DUP@example.COM"})
    assert resp.status_code == 409


def test_login_ok_and_failures_look_identical(client):
    client.post("/api/auth/signup", json={"email": "login@example.com", "password": "longenough1"})

    ok = client.post("/api/auth/login", json={"email": "LOGIN@example.com", "password": "longenough1"})
    assert ok.status_code == 200 and ok.json()["access_token"]

    wrong = client.post("/api/auth/login", json={"email": "login@example.com", "password": "not-the-password"})
    unknown = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "whatever123"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_me_returns_current_user(client, auth_headers):
    resp = client.get("/api/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["email"].endswith("@example.com")


def test_me_without_token_is_401(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401
    assert resp.headers.get("WWW-Authenticate") == "Bearer"


def test_garbage_and_forged_tokens_are_401(client):
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer not.a.jwt"}).status_code == 401

    forged = jwt.encode({"sub": "u_whatever", "type": "access"}, "wrong-secret", algorithm="HS256")
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_protected_route_without_token_is_401(client):
    assert client.get("/api/projects").status_code == 401


def test_health_is_public(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200 and resp.json() == {"ok": True}

from app.db import SessionLocal
from app.models import TestCase as TestCaseRow

JSON_BODY = {"application/json": {"schema": {"type": "object", "required": ["email", "password"], "properties": {
    "email": {"type": "string", "format": "email"}, "password": {"type": "string"}}}}}
TOKEN_RESP = {"200": {"description": "ok", "content": {"application/json": {"schema": {
    "type": "object", "properties": {"access_token": {"type": "string"}}}}}}}

SPEC = {
    "openapi": "3.0.3",
    "info": {"title": "Items", "version": "1.0.0"},
    "paths": {
        "/auth/signup": {"post": {"summary": "Create account", "requestBody": {"content": JSON_BODY},
                                  "responses": {"201": {"description": "created"}}}},
        "/auth/signin": {"post": {"summary": "Log in", "requestBody": {"content": JSON_BODY}, "responses": TOKEN_RESP}},
        "/items": {"get": {"summary": "List items", "security": [{"bearerAuth": []}],
                           "responses": {"200": {"description": "ok"}}}},
    },
    "components": {"securitySchemes": {"bearerAuth": {"type": "http", "scheme": "bearer"}}},
}

OPENAI = {"name": "Main", "provider": "openai", "model": "gpt-4o-mini", "api_key": "sk-test-1234567890abcdef"}


def _project(client, headers, **overrides):
    body = {"name": "Items API", "base_url": "http://localhost:9000", "spec": SPEC, **overrides}
    resp = client.post("/api/projects", json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _model(client, headers):
    resp = client.post("/api/models", json=OPENAI, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _fake_tests(*_, **__):
    return {"tests": [
        {"name": "list items", "category": "happy_path", "endpoint_id": "GET /items", "method": "GET", "path": "/items",
         "expected_status": [200], "assertions": [{"type": "field_type", "path": "$", "value": "array"}],
         "requires_auth": True},
        {"name": "no token", "category": "auth", "endpoint_id": "GET /items", "method": "GET", "path": "/items",
         "expected_status": [401], "requires_auth": False},
    ]}


def _generate(client, headers, monkeypatch):
    monkeypatch.setattr("app.graphs.llm.invoke_json", _fake_tests)
    monkeypatch.setattr("app.api.testing.project_llm", lambda *a, **k: object())
    return client.post(f"/api/projects/{_project(client, headers)['id']}/tests/generate",
                       json={"endpoint_ids": [], "categories": ["happy_path", "auth"]}, headers=headers)


def test_create_project_detects_signup_and_signin_heuristically(client, auth_headers):
    project = _project(client, auth_headers)
    auth = project["auth"]
    assert auth["type"] == "auto" and auth["detected"] is True and auth["source"] == "heuristic"
    assert auth["signup"]["endpoint_id"] == "POST /auth/signup"
    assert auth["signin"]["endpoint_id"] == "POST /auth/signin"
    assert auth["token_path"] == "$.access_token"
    assert auth["scheme"]["header"] == "Authorization" and auth["scheme"]["prefix"] == "Bearer "


def test_swagger_2_spec_is_400(client, auth_headers):
    resp = client.post("/api/projects", headers=auth_headers,
                       json={"name": "Old", "base_url": "http://localhost:9000",
                             "spec": {"swagger": "2.0", "paths": {"/x": {"get": {}}}}})
    assert resp.status_code == 400


def test_base_url_without_scheme_is_422(client, auth_headers):
    resp = client.post("/api/projects", headers=auth_headers, json={"name": "Bad", "base_url": "localhost:9000", "spec": SPEC})
    assert resp.status_code == 422


def test_patch_model_config_id_own_other_and_null(client, auth_headers, other_headers):
    project = _project(client, auth_headers)
    mine = _model(client, auth_headers)
    theirs = _model(client, other_headers)
    url = f"/api/projects/{project['id']}"

    ok = client.patch(url, json={"model_config_id": mine}, headers=auth_headers)
    assert ok.status_code == 200 and ok.json()["model_config_id"] == mine

    assert client.patch(url, json={"model_config_id": theirs}, headers=auth_headers).status_code == 404

    cleared = client.patch(url, json={"model_config_id": None}, headers=auth_headers)
    assert cleared.status_code == 200 and cleared.json()["model_config_id"] is None


def test_other_user_cannot_see_patch_or_delete_project(client, auth_headers, other_headers):
    pid = _project(client, auth_headers)["id"]
    assert client.get(f"/api/projects/{pid}", headers=other_headers).status_code == 404
    assert client.patch(f"/api/projects/{pid}", json={"name": "x"}, headers=other_headers).status_code == 404
    assert client.delete(f"/api/projects/{pid}", headers=other_headers).status_code == 404
    assert client.get(f"/api/projects/{pid}/tests", headers=other_headers).status_code == 404
    assert client.get("/api/projects", headers=other_headers).json() == []


def test_generate_without_any_model_is_400(client, auth_headers):
    pid = _project(client, auth_headers)["id"]
    resp = client.post(f"/api/projects/{pid}/tests/generate", json={}, headers=auth_headers)
    assert resp.status_code == 400
    assert resp.json()["detail"] == "No model configured. Add one under Models."


def test_generate_creates_unapproved_sequential_tests(client, auth_headers, monkeypatch):
    resp = _generate(client, auth_headers, monkeypatch)
    assert resp.status_code == 200, resp.text
    tests = resp.json()
    assert [t["order"] for t in tests] == [1, 2]
    assert all(t["approved"] is False for t in tests)
    listed = client.get(f"/api/projects/{tests[0]['project_id']}/tests", headers=auth_headers).json()
    assert [t["name"] for t in listed] == ["list items", "no token"]


def test_approve_endpoint_sets_flag(client, auth_headers, monkeypatch):
    tests = _generate(client, auth_headers, monkeypatch).json()
    pid, ids = tests[0]["project_id"], [t["id"] for t in tests]
    approved = client.post(f"/api/projects/{pid}/tests/approve", json={"test_ids": ids, "approved": True}, headers=auth_headers)
    assert approved.status_code == 200
    assert all(t["approved"] for t in approved.json())
    client.post(f"/api/projects/{pid}/tests/approve", json={"test_ids": ids[:1], "approved": False}, headers=auth_headers)
    listed = client.get(f"/api/projects/{pid}/tests", headers=auth_headers).json()
    assert [t["approved"] for t in listed] == [False, True]


def test_patch_test_ignores_non_editable_fields(client, auth_headers, monkeypatch):
    test = _generate(client, auth_headers, monkeypatch).json()[0]
    resp = client.patch(f"/api/tests/{test['id']}", headers=auth_headers,
                        json={"name": "Renamed", "project_id": "p_someone_else", "id": "t_fake", "order": 9})
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Renamed" and body["order"] == 9
    assert body["project_id"] == test["project_id"] and body["id"] == test["id"]


def test_deleting_project_deletes_its_tests(client, auth_headers, monkeypatch):
    tests = _generate(client, auth_headers, monkeypatch).json()
    pid = tests[0]["project_id"]
    assert client.delete(f"/api/projects/{pid}", headers=auth_headers).json() == {"ok": True}
    with SessionLocal() as db:
        assert db.query(TestCaseRow).filter(TestCaseRow.project_id == pid).count() == 0

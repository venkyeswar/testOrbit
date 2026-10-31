"""Background runs, interrupted-run recovery, rate limits and migrations."""
import time

from app import worker
from app.db import SessionLocal, engine
from app.models import Run, TestCase
from sqlalchemy import inspect, text

SPEC = {
    "openapi": "3.0.0",
    "info": {"title": "t", "version": "1"},
    "paths": {"/health": {"get": {"responses": {"200": {"description": "ok"}}}}},
}


def _project_with_tests(client, headers, n=3):
    # Port 9 (discard) is closed locally, so requests fail fast without real network access.
    p = client.post("/api/projects", headers=headers,
                    json={"name": "runs", "base_url": "http://127.0.0.1:9", "spec": SPEC}).json()
    with SessionLocal() as db:
        db.add_all([TestCase(project_id=p["id"], order=i, approved=True,
                             data={"name": f"t{i}", "category": "happy_path", "method": "GET", "path": "/health",
                                   "expected_status": [200], "assertions": [], "extract": {}, "headers": {},
                                   "query": {}, "body": None, "requires_auth": False, "endpoint_id": "GET /health",
                                   "description": ""}) for i in range(1, n + 1)])
        db.commit()
    return p["id"]


def _wait(client, headers, run_id, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        run = client.get(f"/api/runs/{run_id}", headers=headers).json()
        if run["status"] not in ("queued", "running"):
            return run
        time.sleep(0.1)
    raise AssertionError("run did not finish")


def test_run_is_queued_then_completes_in_background(client, auth_headers):
    pid = _project_with_tests(client, auth_headers)
    resp = client.post(f"/api/projects/{pid}/runs", headers=auth_headers, json={})
    assert resp.status_code == 202
    queued = resp.json()
    assert queued["status"] == "queued"
    assert queued["progress"]["total"] == 3

    run = _wait(client, auth_headers, queued["id"])
    assert run["status"] == "completed"
    assert run["progress"] == {"done": 3, "total": 3, "stage": "done"}
    assert run["summary"]["total"] == 3 and run["summary"]["error"] == 3  # target unreachable
    assert all(r["error"] for r in run["results"])


def test_run_without_approved_tests_is_rejected(client, auth_headers):
    p = client.post("/api/projects", headers=auth_headers,
                    json={"name": "empty", "base_url": "http://127.0.0.1:9", "spec": SPEC}).json()
    assert client.post(f"/api/projects/{p['id']}/runs", headers=auth_headers, json={}).status_code == 400


def test_other_user_cannot_start_or_read_runs(client, auth_headers, other_headers):
    pid = _project_with_tests(client, auth_headers, n=1)
    assert client.post(f"/api/projects/{pid}/runs", headers=other_headers, json={}).status_code == 404
    run = client.post(f"/api/projects/{pid}/runs", headers=auth_headers, json={}).json()
    assert client.get(f"/api/runs/{run['id']}", headers=other_headers).status_code == 404
    _wait(client, auth_headers, run["id"])


def test_unfinished_runs_are_marked_interrupted_on_startup(client, auth_headers):
    pid = _project_with_tests(client, auth_headers, n=1)
    with SessionLocal() as db:
        stuck = Run(project_id=pid, status="running", test_ids=[])
        db.add(stuck)
        db.commit()
        stuck_id = stuck.id
    assert worker.mark_interrupted() >= 1
    run = client.get(f"/api/runs/{stuck_id}", headers=auth_headers).json()
    assert run["status"] == "interrupted"
    assert "restarted" in run["error"]


def test_login_is_rate_limited(client, auth_headers):
    body = {"email": "nobody@example.com", "password": "wrong-password"}
    codes = [client.post("/api/auth/login", json=body).status_code for _ in range(11)]
    assert codes[:10] == [401] * 10
    assert codes[10] == 429


def test_signup_is_rate_limited(client):
    codes = [client.post("/api/auth/signup", json={"email": f"rl{i}@example.com", "password": "long-enough-1"}).status_code
             for i in range(6)]
    assert codes[:5] == [201] * 5
    resp = client.post("/api/auth/signup", json={"email": "rl-extra@example.com", "password": "long-enough-1"})
    assert resp.status_code == 429 and int(resp.headers["Retry-After"]) > 0


def test_schema_is_managed_by_alembic(client):
    assert "alembic_version" in inspect(engine).get_table_names()
    with engine.connect() as conn:
        assert conn.execute(text("select version_num from alembic_version")).scalar() == "0002"
    columns = {c["name"] for c in inspect(engine).get_columns("runs")}
    assert {"test_ids", "progress"} <= columns


def test_ai_diagnosis_is_persisted_for_background_runs(client, auth_headers, monkeypatch):
    """Regression: progress snapshots shared dicts with the graph, so diagnoses added later were never saved."""
    def fake_invoke_json(model, system, user):
        import json
        ids = [e["test_id"] for e in json.loads(user)]
        return {"diagnoses": [{"test_id": i, "category": "environment", "explanation": "target down",
                               "suggested_fix": "start it"} for i in ids]}

    monkeypatch.setattr("app.worker.project_llm", lambda db, user, project: object())
    monkeypatch.setattr("app.graphs.llm.invoke_json", fake_invoke_json)
    pid = _project_with_tests(client, auth_headers, n=2)
    run = _wait(client, auth_headers, client.post(f"/api/projects/{pid}/runs", headers=auth_headers, json={}).json()["id"])
    assert [r["diagnosis"]["category"] for r in run["results"]] == ["environment", "environment"]

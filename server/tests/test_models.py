import pytest

from app.db import SessionLocal
from app.models import ModelConfig

RAW_KEY = "sk-test-SUPER-SECRET-KEY-1234"
OPENAI = {"name": "Main", "provider": "openai", "model": "gpt-4o-mini", "api_key": RAW_KEY}


def _create(client, headers, **overrides):
    resp = client.post("/api/models", json={**OPENAI, **overrides}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _models(client, headers):
    return {m["id"]: m for m in client.get("/api/models", headers=headers).json()}


def test_providers_are_public_and_list_six(client):
    resp = client.get("/api/models/providers")
    assert resp.status_code == 200
    assert {p["id"] for p in resp.json()} == {"openai", "anthropic", "google", "azure_openai", "ollama", "openai_compatible"}


def test_create_model_encrypts_key_and_never_returns_it(client, auth_headers):
    created = _create(client, auth_headers)
    assert created["has_api_key"] is True
    assert created["api_key_hint"].startswith("sk-") and created["api_key_hint"].endswith("1234")
    assert RAW_KEY not in client.get("/api/models", headers=auth_headers).text
    assert RAW_KEY not in client.post("/api/models", json={**OPENAI, "name": "x"}, headers=auth_headers).text

    with SessionLocal() as db:
        row = db.get(ModelConfig, created["id"])
        assert row.api_key_enc and RAW_KEY not in row.api_key_enc


def test_first_model_becomes_default(client, auth_headers):
    first = _create(client, auth_headers)
    assert first["is_default"] is True


def test_new_default_flips_previous_default(client, auth_headers):
    first = _create(client, auth_headers)
    second = _create(client, auth_headers, name="Second", is_default=True)
    models = _models(client, auth_headers)
    assert second["is_default"] is True
    assert models[first["id"]]["is_default"] is False


def test_patch_with_empty_api_key_keeps_stored_key(client, auth_headers):
    created = _create(client, auth_headers)
    resp = client.patch(f"/api/models/{created['id']}", json={"api_key": "", "temperature": 0.5}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["has_api_key"] is True
    assert resp.json()["api_key_hint"] == created["api_key_hint"]
    assert resp.json()["temperature"] == 0.5


def test_azure_missing_required_fields_is_422(client, auth_headers):
    resp = client.post("/api/models", headers=auth_headers,
                       json={"name": "Az", "provider": "azure_openai", "model": "gpt-4o", "api_key": "k" * 20})
    assert resp.status_code == 422
    assert "base_url" in resp.json()["detail"]


def test_deleting_default_promotes_oldest_remaining(client, auth_headers):
    a = _create(client, auth_headers, name="A")
    b = _create(client, auth_headers, name="B")
    _create(client, auth_headers, name="C")
    assert client.delete(f"/api/models/{a['id']}", headers=auth_headers).status_code == 200
    models = _models(client, auth_headers)
    assert models[b["id"]]["is_default"] is True
    assert sum(m["is_default"] for m in models.values()) == 1


def test_other_user_gets_404_for_my_model(client, auth_headers, other_headers):
    mine = _create(client, auth_headers)
    assert client.patch(f"/api/models/{mine['id']}", json={"name": "hijack"}, headers=other_headers).status_code == 404
    assert client.delete(f"/api/models/{mine['id']}", headers=other_headers).status_code == 404
    assert client.post(f"/api/models/{mine['id']}/test", headers=other_headers).status_code == 404
    assert _models(client, other_headers) == {}


def test_connection_test_uses_llm_and_is_patched(client, auth_headers, monkeypatch):
    seen = {}

    def fake(cfg):
        seen["cfg"] = cfg
        return {"ok": True, "latency_ms": 5, "reply": "OK", "error": None}

    monkeypatch.setattr("app.api.model_configs.llm.test_connection", fake)
    resp = client.post("/api/models/test", json=OPENAI, headers=auth_headers)
    assert resp.json() == {"ok": True, "latency_ms": 5, "reply": "OK", "error": None}
    assert seen["cfg"]["api_key"] == RAW_KEY  # the draft key is passed to the gateway, never stored from here


def test_patch_null_name_is_rejected(client, auth_headers):
    """name/provider/model are NOT NULL columns, so explicit null must be a 4xx, not a 500."""
    created = _create(client, auth_headers)
    resp = client.patch(f"/api/models/{created['id']}", json={"name": None}, headers=auth_headers)
    assert resp.status_code in (400, 422)

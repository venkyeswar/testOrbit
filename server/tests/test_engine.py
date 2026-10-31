"""Pure unit tests for executor, auth detection and token helpers (no HTTP, no LLM)."""
from app import auth, executor, openapi


# ---------------------------------------------------------------- executor

def test_substitute_whole_placeholder_keeps_type_and_partial_interpolates():
    variables = {"n": 5, "name": "ada"}
    assert executor.substitute("{{n}}", variables) == 5
    assert executor.substitute("id-{{n}}", variables) == "id-5"
    assert executor.substitute({"a": ["{{name}}", {"b": "x {{name}}"}]}, variables) == {"a": ["ada", {"b": "x ada"}]}
    assert executor.substitute("{{missing}}", variables) == "{{missing}}"  # unknown placeholders are left alone


def test_check_assertion_types():
    body = {"id": 7, "ok": True, "tags": ["a"], "name": "x"}
    assert executor.check_assertion({"type": "field_exists", "path": "$.id"}, body, 1)[0]
    assert not executor.check_assertion({"type": "field_exists", "path": "$.nope"}, body, 1)[0]
    assert executor.check_assertion({"type": "field_equals", "path": "$.name", "value": "x"}, body, 1)[0]
    assert not executor.check_assertion({"type": "field_equals", "path": "$.name", "value": "y"}, body, 1)[0]
    assert executor.check_assertion({"type": "field_type", "path": "$.id", "value": "integer"}, body, 1)[0]
    assert not executor.check_assertion({"type": "field_type", "path": "$.ok", "value": "number"}, body, 1)[0]  # bool is not a number
    assert executor.check_assertion({"type": "field_type", "path": "$.tags", "value": "array"}, body, 1)[0]
    assert executor.check_assertion({"type": "body_contains", "value": "tags"}, body, 1)[0]
    assert executor.check_assertion({"type": "body_contains", "value": "hello"}, "say hello", 1)[0]
    assert executor.check_assertion({"type": "max_latency_ms", "value": 100}, body, 99)[0]
    assert not executor.check_assertion({"type": "max_latency_ms", "value": 100}, body, 101)[0]


def test_redact_masks_credential_headers_case_insensitively():
    headers = {"authorization": "Bearer abc", "X-API-Key": "k", "Cookie": "s=1", "Accept": "application/json"}
    assert executor.redact(headers) == {"authorization": "****", "X-API-Key": "****", "Cookie": "****",
                                        "Accept": "application/json"}


# ---------------------------------------------------------------- auth helpers

def test_build_body_fills_placeholders_and_required_fields():
    schema = {"type": "object", "required": ["email", "password", "title", "age"], "properties": {
        "email": {"type": "string", "format": "email"}, "password": {"type": "string"},
        "title": {"type": "string"}, "age": {"type": "integer"}, "nickname": {"type": "string"},
        "username": {"type": "string"}}}
    body = auth.build_body(schema)
    assert body["email"] == "{{email}}" and body["password"] == "{{password}}" and body["username"] == "{{username}}"
    assert body["title"] == "test" and body["age"] == 1
    assert "nickname" not in body  # optional non-credential fields are skipped

    creds_only = auth.build_body(schema, credentials_only=True)
    assert set(creds_only) == {"email", "password", "username"}


def test_find_token_uses_path_then_falls_back_to_known_keys():
    assert auth.find_token({"access_token": "abc"}, "$.access_token") == "abc"
    assert auth.find_token({"access_token": "abc"}, None) == "abc"
    assert auth.find_token({"data": {"token": "nested-1"}}, None) == "nested-1"
    assert auth.find_token({"result": {"jwt": "j1"}}, "$.nope") == "j1"
    assert auth.find_token({"nothing": "here"}, None) is None


def test_heuristic_maps_email_only_register_with_oauth2_form_login():
    spec = {
        "openapi": "3.0.3", "info": {"title": "t", "version": "1"},
        "paths": {
            "/register": {"post": {"summary": "Register", "requestBody": {"content": {"application/json": {"schema": {
                "type": "object", "required": ["email", "password"], "properties": {
                    "email": {"type": "string", "format": "email"}, "password": {"type": "string"}}}}}},
                "responses": {"201": {"description": "ok"}}}},
            "/token": {"post": {"summary": "Token", "requestBody": {"content": {"application/x-www-form-urlencoded": {"schema": {
                "type": "object", "required": ["username", "password"], "properties": {
                    "username": {"type": "string"}, "password": {"type": "string"}}}}}},
                "responses": {"200": {"description": "ok", "content": {"application/json": {"schema": {
                    "type": "object", "properties": {"access_token": {"type": "string"}}}}}}}}},
            "/items": {"get": {"summary": "Items", "security": [{"oauth2": []}], "responses": {"200": {"description": "ok"}}}},
        },
        "components": {"securitySchemes": {"oauth2": {"type": "oauth2", "flows": {"password": {"tokenUrl": "/token", "scopes": {}}}}}},
    }
    endpoints = openapi.parse_endpoints(spec)
    plan = auth.detect(spec, endpoints, model=None)

    assert plan["detected"] is True and plan["source"] == "heuristic"
    assert plan["signup"]["endpoint_id"] == "POST /register"
    assert plan["signin"]["endpoint_id"] == "POST /token"
    assert plan["signin"]["content_type"] == "form"
    assert plan["signin"]["body"] == {"username": "{{email}}", "password": "{{password}}"}
    assert plan["token_path"] == "$.access_token"


def test_apikey_header_scheme_has_empty_prefix():
    spec = {
        "openapi": "3.0.3", "info": {"title": "t", "version": "1"},
        "paths": {"/items": {"get": {"summary": "Items", "security": [{"k": []}], "responses": {"200": {"description": "ok"}}}}},
        "components": {"securitySchemes": {"k": {"type": "apiKey", "in": "header", "name": "X-Api-Key"}}},
    }
    plan = auth.detect(spec, openapi.parse_endpoints(spec), model=None)
    assert plan["scheme"] == {"type": "api_key", "header": "X-Api-Key", "prefix": ""}
    assert plan["detected"] is False  # protected endpoints but no signin flow

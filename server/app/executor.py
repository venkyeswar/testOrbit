"""Deterministic execution: build requests, call the target API, check assertions.

The LLM never decides pass/fail here — only plain code does.
"""
import re
import time
from urllib.parse import urlparse

import httpx
from jsonpath_ng import parse as jp_parse

from .config import REQUEST_TIMEOUT

VAR = re.compile(r"\{\{\s*(\w+)\s*\}\}")
TYPES = {"string": str, "number": (int, float), "integer": int, "boolean": bool,
         "object": dict, "array": list, "null": type(None)}


def substitute(value, variables: dict):
    """Replace {{var}} placeholders. A string that is exactly one placeholder keeps the var's type."""
    if isinstance(value, str):
        whole = VAR.fullmatch(value.strip())
        if whole and whole.group(1) in variables:
            return variables[whole.group(1)]
        return VAR.sub(lambda m: str(variables.get(m.group(1), m.group(0))), value)
    if isinstance(value, dict):
        return {k: substitute(v, variables) for k, v in value.items()}
    if isinstance(value, list):
        return [substitute(v, variables) for v in value]
    return value


def jsonpath_values(body, path: str) -> list:
    try:
        return [m.value for m in jp_parse(path).find(body)]
    except Exception:
        return []


def redact(headers: dict) -> dict:
    return {k: ("****" if k.lower() in ("authorization", "cookie", "x-api-key") else v) for k, v in headers.items()}


def check_assertion(a: dict, body, latency_ms: float) -> tuple[bool, str]:
    kind = a.get("type")
    if kind == "max_latency_ms":
        return latency_ms <= a["value"], f"latency {latency_ms:.0f}ms (max {a['value']}ms)"
    if kind == "body_contains":
        text = body if isinstance(body, str) else str(body)
        ok = str(a["value"]) in text
        return ok, f"body {'contains' if ok else 'does not contain'} {a['value']!r}"
    values = jsonpath_values(body, a.get("path", "$"))
    if kind == "field_exists":
        return bool(values), f"{a['path']} {'exists' if values else 'missing'}"
    if not values:
        return False, f"{a['path']} missing"
    actual = values[0]
    if kind == "field_equals":
        return actual == a["value"], f"{a['path']} = {actual!r} (expected {a['value']!r})"
    if kind == "field_type":
        expected = TYPES.get(a["value"], object)
        ok = isinstance(actual, expected) and not (a["value"] in ("number", "integer") and isinstance(actual, bool))
        return ok, f"{a['path']} is {type(actual).__name__} (expected {a['value']})"
    return False, f"unknown assertion type {kind!r}"


def run_test(test: dict, base_url: str, auth_header: tuple[str, str] | None, variables: dict, client: httpx.Client) -> dict:
    result = {
        "test_id": test["id"], "test_name": test["name"], "category": test["category"],
        "method": test["method"], "url": "", "status": "error", "status_code": None, "latency_ms": None,
        "request": {"headers": {}, "body": None}, "response": None,
        "assertion_results": [], "error": None, "diagnosis": None,
    }
    path = substitute(test["path"], variables)
    missing = VAR.findall(path) + re.findall(r"\{(\w+)\}", path)
    if missing:
        result.update(status="skipped", error=f"Unresolved path variables: {', '.join(missing)}")
        return result
    if not path.startswith("/"):
        result["error"] = "Test path must be relative to the project base URL"
        return result

    url = base_url.rstrip("/") + path
    headers = {k: str(v) for k, v in substitute(test.get("headers") or {}, variables).items()}
    if test.get("requires_auth") and auth_header and not any(k.lower() == auth_header[0].lower() for k in headers):
        headers[auth_header[0]] = auth_header[1]
    body = substitute(test.get("body"), variables)
    result["url"] = url
    result["request"] = {"headers": redact(headers), "body": body}

    try:
        start = time.perf_counter()
        resp = client.request(test["method"], url, headers=headers, params=substitute(test.get("query") or {}, variables),
                              json=body if body is not None else None)
        latency = (time.perf_counter() - start) * 1000
    except httpx.HTTPError as exc:
        result["error"] = f"{type(exc).__name__}: {exc}"
        return result

    try:
        resp_body = resp.json()
    except ValueError:
        resp_body = resp.text[:5000]
    result.update(status_code=resp.status_code, latency_ms=round(latency, 1),
                  response={"headers": dict(resp.headers), "body": resp_body})

    expected = test.get("expected_status") or [200]
    checks = [{"assertion": {"type": "status", "value": expected}, "passed": resp.status_code in expected,
               "message": f"status {resp.status_code} (expected {expected})"}]
    for a in substitute(test.get("assertions") or [], variables):
        ok, msg = check_assertion(a, resp_body, latency)
        checks.append({"assertion": a, "passed": ok, "message": msg})
    result["assertion_results"] = checks
    result["status"] = "passed" if all(c["passed"] for c in checks) else "failed"

    # Extract variables for later steps (only from successful responses).
    if 200 <= resp.status_code < 300:
        for name, jpath in (test.get("extract") or {}).items():
            values = jsonpath_values(resp_body, jpath)
            if values:
                variables[name] = values[0]
    return result


def same_host(base_url: str, url: str) -> bool:
    return urlparse(base_url).netloc == urlparse(url).netloc

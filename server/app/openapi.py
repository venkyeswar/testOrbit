"""Load an OpenAPI 3.x document and flatten it into a list of endpoints."""
import httpx
import yaml

METHODS = ("get", "post", "put", "patch", "delete")


def load_spec(spec_url: str | None, spec: dict | None) -> dict:
    if spec is None:
        if not spec_url:
            raise ValueError("Provide an OpenAPI spec URL or JSON")
        resp = httpx.get(spec_url, timeout=15, follow_redirects=False)
        resp.raise_for_status()
        spec = yaml.safe_load(resp.text)  # YAML is a superset of JSON
    if not isinstance(spec, dict) or not str(spec.get("openapi", "")).startswith("3"):
        raise ValueError("Only OpenAPI 3.x documents are supported")
    if not spec.get("paths"):
        raise ValueError("Spec has no paths")
    return spec


def _resolve(node, spec: dict, depth: int = 0):
    if depth > 8:
        return {}
    if isinstance(node, dict):
        if "$ref" in node:
            target = spec
            for part in node["$ref"].lstrip("#/").split("/"):
                target = target.get(part, {})
            return _resolve(target, spec, depth + 1)
        return {k: _resolve(v, spec, depth) for k, v in node.items()}
    if isinstance(node, list):
        return [_resolve(v, spec, depth) for v in node]
    return node


def parse_endpoints(spec: dict) -> list[dict]:
    global_security = spec.get("security") or []
    endpoints = []
    for path, item in spec["paths"].items():
        shared_params = item.get("parameters", [])
        for method in METHODS:
            op = item.get(method)
            if not op:
                continue
            body_schema, content_type = None, None
            content = (_resolve(op.get("requestBody", {}), spec).get("content") or {})
            if content:
                content_type, media = next(iter(content.items()))
                body_schema = media.get("schema")
            responses = {}
            for code, resp in (op.get("responses") or {}).items():
                resp = _resolve(resp, spec)
                rc = resp.get("content") or {}
                responses[code] = next(iter(rc.values())).get("schema", {}) if rc else {}
            endpoints.append({
                "id": f"{method.upper()} {path}",
                "method": method.upper(),
                "path": path,
                "summary": op.get("summary") or op.get("operationId") or "",
                "operation_id": op.get("operationId") or "",
                "tags": op.get("tags") or ["default"],
                "requires_auth": bool(op.get("security", global_security)),
                "parameters": _resolve(shared_params + op.get("parameters", []), spec),
                "request_schema": _resolve(body_schema, spec) if body_schema else None,
                "request_content_type": content_type,
                "responses": responses,
            })
    return endpoints

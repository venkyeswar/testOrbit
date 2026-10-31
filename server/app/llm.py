"""Model gateway: builds a LangChain chat model from a user's model config, for any supported provider.

Every LLM call in the app goes through `build_chat_model` + `invoke_json`, so graph nodes never know
which provider they are talking to.
"""
import json
import re
import time

from langchain_core.language_models import BaseChatModel

OPENAI_COMPATIBLE_PRESETS = [
    {"label": "Groq", "base_url": "https://api.groq.com/openai/v1"},
    {"label": "OpenRouter", "base_url": "https://openrouter.ai/api/v1"},
    {"label": "Together AI", "base_url": "https://api.together.xyz/v1"},
    {"label": "DeepSeek", "base_url": "https://api.deepseek.com/v1"},
    {"label": "Mistral", "base_url": "https://api.mistral.ai/v1"},
    {"label": "xAI", "base_url": "https://api.x.ai/v1"},
    {"label": "Fireworks", "base_url": "https://api.fireworks.ai/inference/v1"},
    {"label": "LM Studio (local)", "base_url": "http://localhost:1234/v1"},
    {"label": "vLLM (local)", "base_url": "http://localhost:8000/v1"},
]

PROVIDERS = [
    {"id": "openai", "label": "OpenAI", "fields": ["api_key", "base_url"], "required": ["api_key"],
     "default_base_url": None, "model_placeholder": "gpt-4o-mini", "presets": []},
    {"id": "anthropic", "label": "Anthropic", "fields": ["api_key"], "required": ["api_key"],
     "default_base_url": None, "model_placeholder": "claude-sonnet-5-5", "presets": []},
    {"id": "google", "label": "Google Gemini", "fields": ["api_key"], "required": ["api_key"],
     "default_base_url": None, "model_placeholder": "gemini-2.5-flash", "presets": []},
    {"id": "azure_openai", "label": "Azure OpenAI", "fields": ["api_key", "base_url", "api_version", "deployment"],
     "required": ["api_key", "base_url", "api_version", "deployment"], "default_base_url": None,
     "model_placeholder": "gpt-4o", "presets": []},
    {"id": "ollama", "label": "Ollama (local)", "fields": ["base_url"], "required": ["base_url"],
     "default_base_url": "http://localhost:11434", "model_placeholder": "llama3.1", "presets": []},
    {"id": "openai_compatible", "label": "OpenAI-compatible", "fields": ["api_key", "base_url"], "required": ["base_url"],
     "default_base_url": None, "model_placeholder": "llama-3.3-70b-versatile", "presets": OPENAI_COMPATIBLE_PRESETS},
]
PROVIDER_IDS = {p["id"] for p in PROVIDERS}
PROVIDER_BY_ID = {p["id"]: p for p in PROVIDERS}


def missing_fields(cfg: dict) -> list[str]:
    info = PROVIDER_BY_ID[cfg["provider"]]
    return [f for f in info["required"] if not cfg.get(f)]


def build_chat_model(cfg: dict) -> BaseChatModel:
    """cfg: provider, model, api_key (decrypted), base_url, api_version, deployment, temperature."""
    provider, model, temp = cfg["provider"], cfg["model"], cfg.get("temperature", 0)
    key, base_url = cfg.get("api_key"), cfg.get("base_url") or None
    common = {"temperature": temp}
    if provider in ("openai", "openai_compatible"):
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model=model, api_key=key or "not-needed", base_url=base_url, timeout=120, max_retries=2, **common)
    if provider == "azure_openai":
        from langchain_openai import AzureChatOpenAI
        return AzureChatOpenAI(azure_endpoint=base_url, api_key=key, api_version=cfg.get("api_version"),
                               azure_deployment=cfg.get("deployment"), model=model, timeout=120, max_retries=2, **common)
    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(model=model, api_key=key, max_tokens=8192, timeout=120, max_retries=2, **common)
    if provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(model=model, google_api_key=key, max_retries=2, **common)
    if provider == "ollama":
        from langchain_ollama import ChatOllama
        return ChatOllama(model=model, base_url=base_url, **common)
    raise ValueError(f"Unsupported provider {provider!r}")


def _text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):  # e.g. Anthropic / Gemini content blocks
        return "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in content)
    return str(content)


def invoke_json(model: BaseChatModel, system: str, user: str) -> dict:
    """Prompt-based JSON generation — works across providers without relying on native structured output."""
    text = _text(model.invoke([("system", system), ("user", user)]).content).strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.M).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.S)
        if not match:
            raise ValueError(f"Model did not return JSON: {text[:300]}")
        return json.loads(match.group(0))


def test_connection(cfg: dict) -> dict:
    start = time.perf_counter()
    try:
        reply = _text(build_chat_model(cfg).invoke([("user", "Reply with exactly: OK")]).content).strip()
        return {"ok": True, "latency_ms": round((time.perf_counter() - start) * 1000), "reply": reply[:200], "error": None}
    except Exception as exc:
        return {"ok": False, "latency_ms": None, "reply": None, "error": f"{type(exc).__name__}: {str(exc)[:500]}"}

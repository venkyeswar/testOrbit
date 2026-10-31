import logging
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

SERVER_DIR = Path(__file__).resolve().parents[1]
load_dotenv(SERVER_DIR / ".env")

# No third-party tracing: users' prompts, specs and responses stay on this server.
for _var in ("LANGSMITH_TRACING", "LANGCHAIN_TRACING_V2", "LANGCHAIN_TRACING"):
    os.environ[_var] = "false"

log = logging.getLogger("testorbit")


def _secret_key() -> str:
    key = os.getenv("SECRET_KEY", "").strip()
    if key:
        return key
    # Dev convenience: persist a generated key so sessions and encrypted API keys survive restarts.
    path = Path(os.getenv("SECRET_KEY_FILE", SERVER_DIR / ".secret_key"))
    if not path.exists():
        path.write_text(secrets.token_urlsafe(48))
        path.chmod(0o600)
    log.warning("SECRET_KEY not set; using generated key in %s (set SECRET_KEY in production)", path)
    return path.read_text().strip()


SECRET_KEY = _secret_key()
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{SERVER_DIR / 'testorbit.db'}")
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
ACCESS_TOKEN_DAYS = int(os.getenv("ACCESS_TOKEN_DAYS", "7"))
REQUEST_TIMEOUT = float(os.getenv("REQUEST_TIMEOUT", "15"))

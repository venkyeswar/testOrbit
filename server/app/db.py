import secrets
from collections.abc import Iterator
from datetime import datetime, timezone

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import DATABASE_URL

_sqlite = DATABASE_URL.startswith("sqlite")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if _sqlite else {})

if _sqlite:
    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(conn, _):
        cur = conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.close()

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Bring the schema to the latest Alembic revision."""
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import inspect

    from .config import SERVER_DIR

    cfg = Config(str(SERVER_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(SERVER_DIR / "migrations"))
    tables = inspect(engine).get_table_names()
    if "users" in tables and "alembic_version" not in tables:
        command.stamp(cfg, "0001")  # database created before migrations existed
    command.upgrade(cfg, "head")


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(6)}"


def now() -> str:
    return datetime.now(timezone.utc).isoformat()

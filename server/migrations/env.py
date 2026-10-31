from alembic import context

from app.config import DATABASE_URL
from app.db import Base, engine
from app import models  # noqa: F401  (register tables for autogenerate)

config = context.config
config.set_main_option("sqlalchemy.url", DATABASE_URL)


def run_migrations_offline() -> None:
    context.configure(url=DATABASE_URL, target_metadata=Base.metadata, literal_binds=True, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with engine.connect() as connection:
        # render_as_batch lets ALTER TABLE work on SQLite (copy-and-move strategy).
        context.configure(connection=connection, target_metadata=Base.metadata, render_as_batch=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

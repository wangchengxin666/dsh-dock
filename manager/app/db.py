from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
_url = make_url(settings.database_url)

if _url.get_backend_name() == "sqlite":
    database = _url.database or ""
    if database and database != ":memory:":
        Path(database).parent.mkdir(parents=True, exist_ok=True)
    connect_args = {"check_same_thread": False}
else:
    connect_args = {}

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    pool_pre_ping=True,
)


if _url.get_backend_name() == "sqlite":

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db() -> None:
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)

    # MVP migration for SQLite DBs created before per-sandbox limits existed.
    if _url.get_backend_name() == "sqlite":
        with engine.begin() as connection:
            columns = {
                row[1]
                for row in connection.exec_driver_sql("PRAGMA table_info(sandboxes)")
            }
            if "cpu_limit" not in columns:
                connection.exec_driver_sql(
                    "ALTER TABLE sandboxes ADD COLUMN cpu_limit FLOAT"
                )
            if "memory_limit" not in columns:
                connection.exec_driver_sql(
                    "ALTER TABLE sandboxes ADD COLUMN memory_limit VARCHAR(32)"
                )
            if "template" not in columns:
                connection.exec_driver_sql(
                    "ALTER TABLE sandboxes ADD COLUMN template VARCHAR(64) DEFAULT 'agent-os'"
                )
            if "init_repo_url" not in columns:
                connection.exec_driver_sql(
                    "ALTER TABLE sandboxes ADD COLUMN init_repo_url VARCHAR(512)"
                )
            if "image_repo" not in columns:
                connection.exec_driver_sql(
                    "ALTER TABLE sandboxes ADD COLUMN image_repo VARCHAR(255) DEFAULT 'dsh-sandbox'"
                )
            if "init_script" not in columns:
                connection.exec_driver_sql(
                    "ALTER TABLE sandboxes ADD COLUMN init_script TEXT"
                )
            if "extra_env_json" not in columns:
                connection.exec_driver_sql(
                    "ALTER TABLE sandboxes ADD COLUMN extra_env_json TEXT"
                )
            if "auto_install_plugins" not in columns:
                connection.exec_driver_sql(
                    "ALTER TABLE sandboxes ADD COLUMN auto_install_plugins VARCHAR(512)"
                )
            if "auto_sleep_exempt" not in columns:
                connection.exec_driver_sql(
                    "ALTER TABLE sandboxes ADD COLUMN auto_sleep_exempt BOOLEAN NOT NULL DEFAULT 0"
                )
            if "disk_usage_mb" not in columns:
                connection.exec_driver_sql(
                    "ALTER TABLE sandboxes ADD COLUMN disk_usage_mb FLOAT"
                )
            if "disk_updated_at" not in columns:
                connection.exec_driver_sql(
                    "ALTER TABLE sandboxes ADD COLUMN disk_updated_at DATETIME"
                )
            if "port" in columns:
                connection.exec_driver_sql("DROP INDEX IF EXISTS ix_sandboxes_port")
                connection.exec_driver_sql("ALTER TABLE sandboxes DROP COLUMN port")
            user_columns = {
                row[1]
                for row in connection.exec_driver_sql("PRAGMA table_info(users)")
            }
            if "password_hash" not in user_columns:
                connection.exec_driver_sql(
                    "ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)"
                )


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
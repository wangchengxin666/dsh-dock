from __future__ import annotations

import sqlite3
from pathlib import Path

from sqlalchemy import create_engine, inspect, text

from app import db as db_mod
from app.config import Settings
from app.models import Sandbox, User
from app.scheduler import BackgroundWorker


def test_init_db_fresh_and_legacy_port_migration(tmp_path: Path, monkeypatch):
    legacy_path = tmp_path / "legacy.db"
    conn = sqlite3.connect(legacy_path)
    # Simulate an old schema before port removal and template/password columns.
    conn.executescript(
        """
        CREATE TABLE users (
            id VARCHAR(36) PRIMARY KEY,
            email VARCHAR(255) NOT NULL UNIQUE,
            display_name VARCHAR(255),
            role VARCHAR(32) NOT NULL DEFAULT 'user',
            status VARCHAR(32) NOT NULL DEFAULT 'active',
            created_at DATETIME NOT NULL
        );
        CREATE TABLE sandboxes (
            id VARCHAR(36) PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL,
            slug VARCHAR(64) NOT NULL UNIQUE,
            container_id VARCHAR(128),
            volume_name VARCHAR(128) NOT NULL UNIQUE,
            port INTEGER NOT NULL DEFAULT 18080,
            image_tag VARCHAR(64) NOT NULL DEFAULT 'latest',
            llm_profile_id VARCHAR(36),
            status VARCHAR(32) NOT NULL DEFAULT 'creating',
            created_at DATETIME NOT NULL,
            last_seen_at DATETIME,
            deleted_at DATETIME
        );
        INSERT INTO sandboxes (id, user_id, slug, volume_name, port, created_at)
        VALUES ('s1', 'u1', 'alice', 'dsh-alice-home', 18080, '2026-01-01T00:00:00');
        """
    )
    conn.commit()
    conn.close()

    test_engine = create_engine(
        f"sqlite:///{legacy_path.as_posix()}",
        future=True,
        connect_args={"check_same_thread": False},
    )
    monkeypatch.setattr(db_mod, "engine", test_engine)
    db_mod.init_db()

    inspector = inspect(test_engine)
    user_cols = {c["name"] for c in inspector.get_columns("users")}
    sbx_cols = {c["name"] for c in inspector.get_columns("sandboxes")}
    assert "password_hash" in user_cols
    assert "port" not in sbx_cols
    assert {
        "cpu_limit",
        "memory_limit",
        "template",
        "init_repo_url",
        "image_repo",
        "init_script",
        "extra_env_json",
        "auto_install_plugins",
        "auto_sleep_exempt",
        "disk_usage_mb",
        "disk_updated_at",
    }.issubset(sbx_cols)
    assert inspector.has_table("platform_settings")

    with test_engine.begin() as c:
        row = c.execute(text("SELECT slug, image_repo, cpu_limit FROM sandboxes WHERE id = 's1'")).fetchone()
        assert row == ("alice", "dsh-sandbox", None)
    test_engine.dispose()


def test_background_worker_tick_reconciles_statuses(db_session, fake_docker, monkeypatch):
    monkeypatch.setattr("app.scheduler.SessionLocal", db_mod.SessionLocal)
    user = User(email="alice@example.com", display_name="Alice")
    db_session.add(user)
    db_session.flush()

    s1 = Sandbox(
        user_id=user.id,
        slug="alice",
        volume_name="dsh-alice-home",
        image_tag="latest",
        status="creating",
    )
    s2 = Sandbox(
        user_id=user.id,
        slug="bob",
        volume_name="dsh-bob-home",
        image_tag="latest",
        status="running",
    )
    db_session.add_all([s1, s2])
    db_session.commit()

    fake_docker.containers["alice"] = {"id": "cid-alice", "status": "running"}
    # bob is absent from fake_docker.containers -> should reconcile to "missing"

    worker = BackgroundWorker(Settings(_env_file=None, background_tasks=True), fake_docker)  # type: ignore[arg-type]
    worker.tick()

    db_session.expire_all()
    assert db_session.get(Sandbox, s1.id).status == "running"
    assert db_session.get(Sandbox, s2.id).status == "missing"


def test_background_worker_idle_sleep_respects_policy_exempt_and_active_work(
    db_session, fake_docker, monkeypatch
):
    from datetime import datetime, timedelta, timezone
    from app.services import set_idle_sleep_policy

    monkeypatch.setattr("app.scheduler.SessionLocal", db_mod.SessionLocal)
    user = User(email="sleepy@example.com", display_name="Sleepy")
    db_session.add(user)
    db_session.flush()

    stale_at = (datetime.now(timezone.utc) - timedelta(hours=3)).replace(tzinfo=None)
    s_idle = Sandbox(
        user_id=user.id,
        slug="idle-one",
        volume_name="dsh-idle-one-home",
        image_tag="latest",
        status="running",
        auto_sleep_exempt=False,
        last_seen_at=stale_at,
    )
    s_exempt = Sandbox(
        user_id=user.id,
        slug="keep-alive",
        volume_name="dsh-keep-alive-home",
        image_tag="latest",
        status="running",
        auto_sleep_exempt=True,
        last_seen_at=stale_at,
    )
    s_busy = Sandbox(
        user_id=user.id,
        slug="busy-one",
        volume_name="dsh-busy-one-home",
        image_tag="latest",
        status="running",
        auto_sleep_exempt=False,
        last_seen_at=stale_at,
    )
    db_session.add_all([s_idle, s_exempt, s_busy])
    db_session.commit()

    fake_docker.containers["idle-one"] = {"id": "c1", "status": "running"}
    fake_docker.containers["keep-alive"] = {"id": "c2", "status": "running"}
    fake_docker.containers["busy-one"] = {"id": "c3", "status": "running"}

    orig_has_active = fake_docker.has_active_work
    fake_docker.has_active_work = lambda sbx: (
        (True, "user-services") if sbx.slug == "busy-one" else orig_has_active(sbx)
    )

    worker = BackgroundWorker(Settings(_env_file=None, background_tasks=True), fake_docker)  # type: ignore[arg-type]

    # 1. Default OFF: nothing stopped even when idle > 3h
    worker.tick()
    db_session.expire_all()
    assert db_session.get(Sandbox, s_idle.id).status == "running"
    assert db_session.get(Sandbox, s_idle.id).disk_usage_mb == 128.0

    # 2. Enable 60-minute idle sleep: only idle-one stops
    set_idle_sleep_policy(db_session, enabled=True, idle_minutes=60, actor="admin@example.com")
    worker.tick()
    db_session.expire_all()
    assert db_session.get(Sandbox, s_idle.id).status == "stopped"
    assert db_session.get(Sandbox, s_exempt.id).status == "running"
    assert db_session.get(Sandbox, s_busy.id).status == "running"

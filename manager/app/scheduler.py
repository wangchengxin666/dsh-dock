from __future__ import annotations

import asyncio
import logging
from datetime import timedelta

from sqlalchemy import select

from .config import Settings
from .db import SessionLocal
from .docker_service import DockerService, SandboxRuntimeError
from .models import Sandbox
from .services import audit, get_idle_sleep_policy, utcnow

logger = logging.getLogger("dsh-manager.scheduler")


class BackgroundWorker:
    """Reconcile container status, periodic disk usage, and optional idle auto-sleep."""

    def __init__(self, settings: Settings, docker: DockerService):
        self.settings = settings
        self.docker = docker
        self._tick_count = 0

    async def run(self) -> None:
        while True:
            try:
                await asyncio.to_thread(self.tick)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("background reconcile failed")
            await asyncio.sleep(self.settings.reconcile_interval_seconds)

    def tick(self) -> None:
        self._tick_count += 1
        refresh_disk_this_tick = (self._tick_count % 5) == 1
        now = utcnow()
        with SessionLocal() as db:
            idle_enabled, idle_minutes = get_idle_sleep_policy(db, self.settings)
            sandboxes = list(
                db.scalars(
                    select(Sandbox).where(Sandbox.deleted_at.is_(None))
                ).all()
            )
            for sandbox in sandboxes:
                try:
                    container = self.docker.get(sandbox)
                    container.reload()
                except SandboxRuntimeError:
                    sandbox.status = "missing"
                    continue
                sandbox.status = container.status

                if sandbox.status == "running" and (
                    refresh_disk_this_tick or sandbox.disk_usage_mb is None
                ):
                    try:
                        disk = self.docker.workspace_disk_usage(sandbox)
                        if disk.get("disk_usage_mb") is not None:
                            sandbox.disk_usage_mb = float(disk["disk_usage_mb"])
                            sandbox.disk_updated_at = now
                    except Exception:
                        pass

                if (
                    idle_enabled
                    and sandbox.status == "running"
                    and not sandbox.auto_sleep_exempt
                ):
                    last_active = sandbox.last_seen_at or sandbox.created_at
                    if last_active and (now - last_active) >= timedelta(minutes=idle_minutes):
                        try:
                            busy, _reason = self.docker.has_active_work(sandbox)
                            if not busy:
                                stopped_status = self.docker.stop(sandbox)
                                sandbox.status = stopped_status
                                audit(
                                    db,
                                    "sandbox.auto_sleep",
                                    target=sandbox.id,
                                    detail=f"slug={sandbox.slug},idle>={idle_minutes}m",
                                )
                        except Exception:
                            logger.warning("idle sleep check/stop failed for %s", sandbox.slug)
            db.commit()

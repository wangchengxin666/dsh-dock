from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select

from .config import Settings
from .db import SessionLocal
from .docker_service import DockerService, SandboxRuntimeError
from .models import Sandbox

logger = logging.getLogger("dsh-manager.scheduler")


class BackgroundWorker:
    """Keep DB status in sync with Docker. Never stops a sandbox."""

    def __init__(self, settings: Settings, docker: DockerService):
        self.settings = settings
        self.docker = docker

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
        with SessionLocal() as db:
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
            db.commit()

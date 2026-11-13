from __future__ import annotations

import socket
import threading

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings
from .models import Sandbox


class PortExhausted(RuntimeError):
    pass


_lock = threading.Lock()


def _port_is_free(port: int) -> bool:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("0.0.0.0", port))
        return True
    except OSError:
        return False
    finally:
        sock.close()


def allocate_port(
    db: Session, settings: Settings, occupied: set[int] | None = None
) -> int:
    """Pick a port not referenced by any sandbox and not currently bound."""
    with _lock:
        used = set(db.scalars(select(Sandbox.port)).all())
        used.update(occupied or set())
        for port in range(settings.port_min, settings.port_max + 1):
            if port in used:
                continue
            if _port_is_free(port):
                return port
    raise PortExhausted(
        f"no free port in {settings.port_min}-{settings.port_max}"
    )
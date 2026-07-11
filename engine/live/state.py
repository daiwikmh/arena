from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

from fastapi import WebSocket


@dataclass
class LiveProjectState:
    project_id: str
    connections: dict[str, WebSocket] = field(default_factory=dict)
    roles: dict[str, str] = field(default_factory=dict)
    latest_camera_frame: bytes | None = None
    latest_result_frame: bytes | None = None
    latest_result_mime_type: str = "image/png"
    result_frames: dict[str, tuple[bytes, str]] = field(default_factory=dict)
    session: object | None = None
    session_task: asyncio.Task | None = None
    send_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    ready: asyncio.Event = field(default_factory=asyncio.Event)


_PROJECTS: dict[str, LiveProjectState] = {}


def get_or_create(project_id: str) -> LiveProjectState:
    return _PROJECTS.setdefault(project_id, LiveProjectState(project_id=project_id))


def get(project_id: str) -> LiveProjectState | None:
    return _PROJECTS.get(project_id)


def drop(project_id: str) -> None:
    _PROJECTS.pop(project_id, None)


async def broadcast(state: LiveProjectState, event: dict) -> None:
    dead: list[str] = []
    for conn_id, ws in state.connections.items():
        try:
            await ws.send_json(event)
        except Exception:  # noqa: BLE001 -- a dead socket must not break the broadcast loop
            dead.append(conn_id)
    for conn_id in dead:
        state.connections.pop(conn_id, None)
        state.roles.pop(conn_id, None)

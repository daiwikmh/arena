from __future__ import annotations

import asyncio
import base64
import json
import uuid

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from google.genai import types

from engine.live.session import ensure_session_started
from engine.live.state import drop, get, get_or_create

router = APIRouter()


@router.websocket("/live/{project_id}/session")
async def live_session(websocket: WebSocket, project_id: str, role: str = "control") -> None:
    if role not in ("camera", "control"):
        await websocket.close(code=1008, reason="role must be 'camera' or 'control'")
        return

    await websocket.accept()
    state = get_or_create(project_id)
    conn_id = uuid.uuid4().hex
    state.connections[conn_id] = websocket
    state.roles[conn_id] = role
    ensure_session_started(state)

    try:
        await asyncio.wait_for(state.ready.wait(), timeout=15)
    except asyncio.TimeoutError:
        await websocket.send_json({"type": "error", "message": "live session did not start in time"})

    try:
        while True:
            message = await websocket.receive()

            if message["type"] == "websocket.disconnect":
                break

            if "bytes" in message and message["bytes"] is not None:
                frame_bytes = message["bytes"]
                if role == "camera":
                    state.latest_camera_frame = frame_bytes
                    encoded = base64.b64encode(frame_bytes).decode("ascii")
                    for other_id, other_ws in list(state.connections.items()):
                        if other_id == conn_id or state.roles.get(other_id) != "control":
                            continue
                        try:
                            await other_ws.send_json({"type": "camera_frame", "data": encoded})
                        except Exception:  # noqa: BLE001 -- a dead viewer must not break camera relay
                            pass
                if state.session is not None:
                    async with state.send_lock:
                        await state.session.send_realtime_input(
                            video=types.Blob(data=frame_bytes, mime_type="image/jpeg")
                        )

            elif "text" in message and message["text"] is not None:
                try:
                    payload = json.loads(message["text"])
                except json.JSONDecodeError:
                    continue

                if state.session is None:
                    continue

                msg_type = payload.get("type")
                if msg_type == "text" and payload.get("text"):
                    async with state.send_lock:
                        await state.session.send_client_content(
                            turns=types.Content(role="user", parts=[types.Part(text=payload["text"])]),
                            turn_complete=True,
                        )
                elif msg_type == "audio" and payload.get("data"):
                    audio_bytes = base64.b64decode(payload["data"])
                    async with state.send_lock:
                        await state.session.send_realtime_input(
                            audio=types.Blob(data=audio_bytes, mime_type="audio/pcm;rate=16000")
                        )
                elif msg_type == "audio_end":
                    async with state.send_lock:
                        await state.session.send_realtime_input(audio_stream_end=True)

    except WebSocketDisconnect:
        pass
    finally:
        state.connections.pop(conn_id, None)
        state.roles.pop(conn_id, None)
        if not state.connections and state.session_task is not None:
            state.session_task.cancel()
            drop(project_id)


@router.get("/live/{project_id}/frame/{frame_id}")
def get_live_frame(project_id: str, frame_id: str) -> Response:
    state = get(project_id)
    if state is None or frame_id not in state.result_frames:
        raise HTTPException(status_code=404, detail=f"no live frame {frame_id!r} for project {project_id!r}")
    image_bytes, mime_type = state.result_frames[frame_id]
    return Response(content=image_bytes, media_type=mime_type)

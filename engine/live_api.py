from __future__ import annotations

import asyncio
import base64
import json
import uuid
from dataclasses import dataclass, field

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from google.genai import types

from engine.models import ImageReference, generate_image, get_client, model_for

router = APIRouter()

SYSTEM_INSTRUCTION = (
    "You are watching a live camera feed and talking with the user in real time. "
    "When the user asks for a visual effect to appear on the live view (e.g. "
    "'give me a fireball'), or asks to change an effect that's already showing "
    "(e.g. 'make it blue', 'turn it into lightning'), call apply_effect with a "
    "single complete description of what the effect should look like now — not "
    "a diff, the full picture, so it can be regenerated from scratch each time. "
    "For anything else — greetings, questions, filler — just respond normally "
    "and do not call the tool."
)


def _apply_effect_declaration() -> types.Tool:
    return types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="apply_effect",
                description=(
                    "Apply or change a generative visual effect on the live camera view."
                ),
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "description": types.Schema(
                            type=types.Type.STRING,
                            description="A complete, self-contained description of what the effect should look like now.",
                        ),
                    },
                    required=["description"],
                ),
            )
        ]
    )


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


def _get_or_create(project_id: str) -> LiveProjectState:
    return _PROJECTS.setdefault(project_id, LiveProjectState(project_id=project_id))


async def _broadcast(state: LiveProjectState, event: dict) -> None:
    dead: list[str] = []
    for conn_id, ws in state.connections.items():
        try:
            await ws.send_json(event)
        except Exception:  # noqa: BLE001 -- a dead socket must not break the broadcast loop
            dead.append(conn_id)
    for conn_id in dead:
        state.connections.pop(conn_id, None)
        state.roles.pop(conn_id, None)


async def _apply_effect(state: LiveProjectState, description: str) -> None:
    if state.latest_result_frame is not None:
        reference_bytes, reference_mime = state.latest_result_frame, state.latest_result_mime_type
    elif state.latest_camera_frame is not None:
        reference_bytes, reference_mime = state.latest_camera_frame, "image/jpeg"
    else:
        reference_bytes, reference_mime = None, ""

    refs = [ImageReference(data=reference_bytes, mime_type=reference_mime)] if reference_bytes else None

    try:
        result = await generate_image(description, role="scene", refs=refs)
    except Exception as exc:  # noqa: BLE001 -- surfaced to clients, not swallowed
        await _broadcast(state, {"type": "error", "message": f"{type(exc).__name__}: {exc}"})
        return

    frame_id = uuid.uuid4().hex
    state.result_frames[frame_id] = (result.image_bytes, result.mime_type)
    state.latest_result_frame = result.image_bytes
    state.latest_result_mime_type = result.mime_type

    await _broadcast(
        state,
        {
            "type": "effect_applied",
            "description": description,
            "frame_url": f"/live/{state.project_id}/frame/{frame_id}",
            "cost_usd": result.usage.candidates_tokens * 30.00 / 1_000_000,
        },
    )


async def _run_live_session(state: LiveProjectState) -> None:
    client = get_client()
    model_id = model_for("live")

    config = types.LiveConnectConfig(
        response_modalities=[types.Modality.AUDIO],
        output_audio_transcription=types.AudioTranscriptionConfig(),
        input_audio_transcription=types.AudioTranscriptionConfig(),
        system_instruction=SYSTEM_INSTRUCTION,
        tools=[_apply_effect_declaration()],
    )

    try:
        async with client.aio.live.connect(model=model_id, config=config) as session:
            state.session = session
            state.ready.set()
            await _broadcast(state, {"type": "session_ready"})

            async for message in session.receive():
                if not state.connections:
                    break

                if message.tool_call and message.tool_call.function_calls:
                    responses = []
                    for fc in message.tool_call.function_calls:
                        description = (fc.args or {}).get("description", "") if fc.name == "apply_effect" else ""
                        if fc.name == "apply_effect" and description:
                            await _apply_effect(state, description)
                        responses.append(
                            types.FunctionResponse(id=fc.id, name=fc.name, response={"result": "applied"})
                        )
                    async with state.send_lock:
                        await session.send_tool_response(function_responses=responses)

                if message.server_content:
                    sc = message.server_content
                    if sc.output_transcription and sc.output_transcription.text:
                        await _broadcast(state, {"type": "transcript", "role": "model", "text": sc.output_transcription.text})
                    if sc.input_transcription and sc.input_transcription.text:
                        await _broadcast(state, {"type": "transcript", "role": "user", "text": sc.input_transcription.text})
    except Exception as exc:  # noqa: BLE001 -- surfaced to clients, session teardown must not crash the server
        await _broadcast(state, {"type": "error", "message": f"live session ended: {type(exc).__name__}: {exc}"})
    finally:
        state.session = None
        state.ready.clear()
        _PROJECTS.pop(state.project_id, None)


def _ensure_session_started(state: LiveProjectState) -> None:
    if state.session_task is None or state.session_task.done():
        state.session_task = asyncio.create_task(_run_live_session(state))


@router.websocket("/live/{project_id}/session")
async def live_session(websocket: WebSocket, project_id: str, role: str = "control") -> None:
    if role not in ("camera", "control"):
        await websocket.close(code=1008, reason="role must be 'camera' or 'control'")
        return

    await websocket.accept()
    state = _get_or_create(project_id)
    conn_id = uuid.uuid4().hex
    state.connections[conn_id] = websocket
    state.roles[conn_id] = role
    _ensure_session_started(state)

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
            _PROJECTS.pop(project_id, None)


@router.get("/live/{project_id}/frame/{frame_id}")
def get_live_frame(project_id: str, frame_id: str) -> Response:
    state = _PROJECTS.get(project_id)
    if state is None or frame_id not in state.result_frames:
        raise HTTPException(status_code=404, detail=f"no live frame {frame_id!r} for project {project_id!r}")
    image_bytes, mime_type = state.result_frames[frame_id]
    return Response(content=image_bytes, media_type=mime_type)

from __future__ import annotations

import asyncio

from google.genai import types

from engine.live.effects import SYSTEM_INSTRUCTION, apply_effect, apply_effect_declaration
from engine.live.state import LiveProjectState, broadcast, drop
from engine.models import get_client, model_for


async def run_live_session(state: LiveProjectState) -> None:
    client = get_client()
    model_id = model_for("live")

    config = types.LiveConnectConfig(
        response_modalities=[types.Modality.AUDIO],
        output_audio_transcription=types.AudioTranscriptionConfig(),
        input_audio_transcription=types.AudioTranscriptionConfig(),
        system_instruction=SYSTEM_INSTRUCTION,
        tools=[apply_effect_declaration()],
    )

    try:
        async with client.aio.live.connect(model=model_id, config=config) as session:
            state.session = session
            state.ready.set()
            await broadcast(state, {"type": "session_ready"})

            async for message in session.receive():
                if not state.connections:
                    break

                if message.tool_call and message.tool_call.function_calls:
                    responses = []
                    for fc in message.tool_call.function_calls:
                        description = (fc.args or {}).get("description", "") if fc.name == "apply_effect" else ""
                        if fc.name == "apply_effect" and description:
                            await apply_effect(state, description)
                        responses.append(
                            types.FunctionResponse(id=fc.id, name=fc.name, response={"result": "applied"})
                        )
                    async with state.send_lock:
                        await session.send_tool_response(function_responses=responses)

                if message.server_content:
                    sc = message.server_content
                    if sc.output_transcription and sc.output_transcription.text:
                        await broadcast(state, {"type": "transcript", "role": "model", "text": sc.output_transcription.text})
                    if sc.input_transcription and sc.input_transcription.text:
                        await broadcast(state, {"type": "transcript", "role": "user", "text": sc.input_transcription.text})
    except Exception as exc:  # noqa: BLE001 -- surfaced to clients, session teardown must not crash the server
        await broadcast(state, {"type": "error", "message": f"live session ended: {type(exc).__name__}: {exc}"})
    finally:
        state.session = None
        state.ready.clear()
        drop(state.project_id)


def ensure_session_started(state: LiveProjectState) -> None:
    if state.session_task is None or state.session_task.done():
        state.session_task = asyncio.create_task(run_live_session(state))

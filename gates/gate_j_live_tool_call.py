import asyncio

from dotenv import load_dotenv

load_dotenv()

from google.genai import types

from engine.models import get_client, model_for

CALLED: list[str] = []


def apply_effect(description: str) -> str:
    """Apply or modify a visual effect on the live camera view.

    Call this whenever the user asks for a visual effect to appear
    (e.g. "give me a fireball") or asks to change one that's already
    showing (e.g. "make it blue", "turn it into lightning").

    Args:
        description: a complete, self-contained description of what
            the effect should look like after this change — not a diff.
    """
    CALLED.append(description)
    print(f"  >>> TOOL CALLED: apply_effect(description={description!r})")
    return "applied"


TURNS = [
    ("hello", False),
    ("what do you see right now", False),
    ("give me a fireball", True),
    ("make it blue", True),
    ("hang on a second", False),
    ("turn it into lightning", True),
    ("thanks, that's cool", False),
]


async def main() -> None:
    client = get_client()
    model_id = model_for("live")
    print(f"connecting to {model_id}...")

    config = types.LiveConnectConfig(
        response_modalities=[types.Modality.AUDIO],
        output_audio_transcription=types.AudioTranscriptionConfig(),
        system_instruction=(
            "You are watching a live camera feed and talking with the user. "
            "When the user asks for a visual effect to appear, or asks to change "
            "an effect that's already showing, call apply_effect with a complete "
            "description of what it should look like now. For anything else — "
            "greetings, questions about what you see, filler like 'hang on' — "
            "just respond normally and do not call the tool."
        ),
        tools=[apply_effect],
    )

    async with client.aio.live.connect(model=model_id, config=config) as session:
        print("connected. sending turns...\n")

        for text, expected_call in TURNS:
            before = len(CALLED)
            print(f'user: "{text}"  (expect tool call: {expected_call})')

            await session.send_client_content(
                turns=types.Content(role="user", parts=[types.Part(text=text)]),
                turn_complete=True,
            )

            reply_text = ""
            async for message in session.receive():
                if message.tool_call and message.tool_call.function_calls:
                    for fc in message.tool_call.function_calls:
                        if fc.name == "apply_effect":
                            desc = (fc.args or {}).get("description", "")
                            apply_effect(desc)
                    await session.send_tool_response(
                        function_responses=[
                            types.FunctionResponse(id=fc.id, name=fc.name, response={"result": "applied"})
                            for fc in message.tool_call.function_calls
                        ]
                    )
                if message.server_content and message.server_content.output_transcription:
                    if message.server_content.output_transcription.text:
                        reply_text += message.server_content.output_transcription.text
                if message.server_content and message.server_content.turn_complete:
                    break

            fired = len(CALLED) > before
            status = "OK" if fired == expected_call else "MISMATCH"
            print(f"  gemini: {reply_text.strip()[:120] if reply_text.strip() else '(no text, tool called)'}")
            print(f"  tool fired: {fired}   [{status}]\n")

    print("=== summary ===")
    print(f"total tool calls: {len(CALLED)}")
    for d in CALLED:
        print(f"  - {d}")


if __name__ == "__main__":
    asyncio.run(main())

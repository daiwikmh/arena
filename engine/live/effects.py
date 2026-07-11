from __future__ import annotations

import io
import uuid

from google.genai import types
from PIL import Image

from engine.live.state import LiveProjectState, broadcast
from engine.models import ImageReference, generate_image

_STANDARD_ASPECT_RATIOS = ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]


def nearest_aspect_ratio(image_bytes: bytes) -> str:
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            width, height = img.size
    except Exception:  # noqa: BLE001 -- a bad reference frame falls back to a sane default, not a crash
        return "16:9"

    actual = width / height

    def ratio_value(label: str) -> float:
        w, h = label.split(":")
        return int(w) / int(h)

    return min(_STANDARD_ASPECT_RATIOS, key=lambda label: abs(actual - ratio_value(label)))


SYSTEM_INSTRUCTION = (
    "You are watching a live camera feed and talking with the user in real time, "
    "directing whatever visual change they ask for onto that scene — not just "
    "conjured objects (a fireball, ice, lightning), but actions and physical "
    "changes to the scene itself (throwing something, a room getting darker, "
    "weather rolling in, an object changing material). Whatever they ask for is "
    "in scope; do not assume the request is limited to a fixed list of effects. "
    "\n\n"
    "When the user asks for something to appear, change, or happen, call "
    "apply_effect. Before writing the description, reason briefly about the real "
    "physics and material science of the request, then bake that reasoning "
    "into the description itself so the image model renders it plausibly rather "
    "than as a flat sticker pasted onto the scene:\n"
    "- Light: does the effect emit light? If so, describe how it lights the "
    "surfaces, skin, and objects near it, and the shadows that fall away from it.\n"
    "- Material and motion: how does the effect's material actually behave — "
    "flame licks and flickers upward, electricity branches and forks, smoke "
    "curls and disperses, thrown objects have a trajectory and motion blur. If "
    "the user describes an action (e.g. 'throw it'), describe the mid-action "
    "moment — the object in flight, the arm's follow-through, the motion blur — "
    "not a static pose.\n"
    "- Contact physics: if the effect touches a person or surface (in a hand, "
    "against skin, on the ceiling), describe the physical consequence — heat "
    "haze, singed or glowing contact points, the surface reacting — not just "
    "the effect floating independently of the scene.\n"
    "\n"
    "Always write a single complete description of the resulting scene, not a "
    "diff — the full picture, so it can be regenerated from scratch every time. "
    "\n\n"
    "Stay faithful to what was actually asked. Add the specific thing the user "
    "requested plus only its *direct* physical consequences (the light it casts, "
    "the shadows it throws, the surface it touches) — do not invent an entire "
    "dramatized scene around it. If they ask for 'dark clouds,' give dark clouds "
    "and the dimming they cause; do not also add rain, downpour, and a twilight "
    "storm unless they asked for those. Keep everything about the scene the user "
    "didn't ask to change — the people, their poses, the furniture, the layout, "
    "the framing — exactly as it already is. "
    "\n\n"
    "For anything that isn't a request to change the scene — greetings, "
    "questions, filler — just respond normally and do not call the tool."
)


def apply_effect_declaration() -> types.Tool:
    return types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="apply_effect",
                description=(
                    "Render a requested visual change — an effect, an action, or a physical "
                    "change to the scene — onto the live camera view."
                ),
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "description": types.Schema(
                            type=types.Type.STRING,
                            description=(
                                "A complete, physically-grounded description of the resulting scene: "
                                "how the effect emits or reflects light, how its material moves or "
                                "behaves, and how it physically interacts with anything it touches."
                            ),
                        ),
                    },
                    required=["description"],
                ),
            )
        ]
    )


async def apply_effect(state: LiveProjectState, description: str) -> None:
    if state.latest_result_frame is not None:
        reference_bytes, reference_mime = state.latest_result_frame, state.latest_result_mime_type
    elif state.latest_camera_frame is not None:
        reference_bytes, reference_mime = state.latest_camera_frame, "image/jpeg"
    else:
        reference_bytes, reference_mime = None, ""

    refs = [ImageReference(data=reference_bytes, mime_type=reference_mime)] if reference_bytes else None
    aspect_ratio = nearest_aspect_ratio(reference_bytes) if reference_bytes else None

    try:
        result = await generate_image(description, role="scene", refs=refs, aspect_ratio=aspect_ratio)
    except Exception as exc:  # noqa: BLE001 -- surfaced to clients, not swallowed
        await broadcast(state, {"type": "error", "message": f"{type(exc).__name__}: {exc}"})
        return

    frame_id = uuid.uuid4().hex
    state.result_frames[frame_id] = (result.image_bytes, result.mime_type)
    state.latest_result_frame = result.image_bytes
    state.latest_result_mime_type = result.mime_type

    await broadcast(
        state,
        {
            "type": "effect_applied",
            "description": description,
            "frame_url": f"/live/{state.project_id}/frame/{frame_id}",
            "cost_usd": result.usage.candidates_tokens * 30.00 / 1_000_000,
        },
    )

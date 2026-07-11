from __future__ import annotations

from engine.ir import CameraMovement, ShotSpec

CAMERA_FRAMING_HINT: dict[CameraMovement, str] = {
    "static": "a centered, balanced composition",
    "pan_left": "the subject weighted toward the right of frame, open space on the left for the pan to reveal",
    "pan_right": "the subject weighted toward the left of frame, open space on the right for the pan to reveal",
    "tilt_up": "the subject weighted toward the lower half of frame, open space above for the tilt to reveal",
    "tilt_down": "the subject weighted toward the upper half of frame, open space below for the tilt to reveal",
    "zoom_in": "the subject small in frame with generous surrounding context, room to move closer",
    "zoom_out": "the subject large and close in frame, room to pull back",
    "tracking": "the subject centered with even space on both sides for lateral movement",
    "handheld": "a natural, slightly off-center composition",
}


def render(shot: ShotSpec) -> str:
    palette = ", ".join(shot.palette)
    clauses = [
        f"{shot.subject}, {shot.setting}.",
        (
            f"Time of day: {shot.time_of_day}. Mood: {shot.mood}. "
            f"Lighting: {shot.lighting}."
        ),
        f"Palette: {palette}.",
        (
            f"This is the opening frame of a {shot.duration_sec}-second shot where "
            f"{shot.action}. Compose with {CAMERA_FRAMING_HINT[shot.camera_movement]}."
        ),
    ]
    if shot.excludes:
        clauses.append("Exclude: " + ", ".join(shot.excludes) + ".")
    if shot.object_refs:
        labels = ", ".join(ref.label for ref in shot.object_refs)
        clauses.append(
            f"Keep the referenced {labels} visually consistent with the "
            f"provided reference images."
        )
    clauses.append(
        "Still photography framing, no motion blur, no text, no logos, no watermarks."
    )
    return " ".join(clauses)

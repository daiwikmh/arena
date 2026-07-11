from __future__ import annotations

from engine.ir import Directive, Region, ResolvedSpec

_REGION_PHRASE: dict[Region, str] = {
    Region.UPPER_LEFT: "upper-left third",
    Region.UPPER_CENTER: "top edge",
    Region.UPPER_RIGHT: "upper-right third",
    Region.MIDDLE_LEFT: "left third",
    Region.MIDDLE_CENTER: "center",
    Region.MIDDLE_RIGHT: "right third",
    Region.LOWER_LEFT: "lower-left third",
    Region.LOWER_CENTER: "bottom edge",
    Region.LOWER_RIGHT: "lower-right third",
}

_LUMINANCE_PHRASE: dict[str, str] = {
    "low": "in soft shadow, low luminance",
    "mid": "in even midtone light",
    "high": "brightly lit",
}


def _composition_clause(directive: Directive) -> str:
    copy_region = _REGION_PHRASE[directive.region]
    subject_region = _REGION_PHRASE[directive.subject_bias]
    luminance = _LUMINANCE_PHRASE[directive.luminance]
    return (
        f"Compose with the {copy_region} {luminance}, reserved as negative "
        f"space for overlaid text; weight the subject toward the {subject_region}."
    )


def render(resolved: ResolvedSpec) -> str:
    scene = resolved.scene
    palette = ", ".join(scene.palette)
    clauses = [
        f"{scene.subject}, {scene.setting}.",
        (
            f"Time of day: {scene.time_of_day}. Mood: {scene.mood}. "
            f"Lighting: {scene.lighting}, shot on a {scene.lens_mm}mm lens."
        ),
        f"Palette: {palette}.",
        _composition_clause(resolved.directive),
    ]
    if scene.excludes:
        clauses.append("Exclude: " + ", ".join(scene.excludes) + ".")
    if resolved.object_refs:
        labels = ", ".join(ref.label for ref in resolved.object_refs)
        clauses.append(
            f"Keep the referenced {labels} visually consistent with the "
            f"provided reference images."
        )
    clauses.append("No text, no logos, no watermarks rendered in the image.")
    return " ".join(clauses)

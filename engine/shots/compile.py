from __future__ import annotations

from dataclasses import dataclass

from engine.ir import ShotSpec
from engine.shots.link import link_shot
from engine.shots.templates import render

DEFAULT_SHOT_TEMPLATE_VERSION = "shot-v1"


@dataclass(frozen=True)
class CompiledShotPrompt:
    shot: ShotSpec
    text: str
    refs: list[dict[str, str]]
    template_version: str


def compile_shot_prompt(
    shot: ShotSpec,
    template_version: str = DEFAULT_SHOT_TEMPLATE_VERSION,
) -> CompiledShotPrompt:
    if template_version != DEFAULT_SHOT_TEMPLATE_VERSION:
        raise ValueError(f"unknown shot template version: {template_version!r}")
    text = render(shot)
    refs = link_shot(shot)
    return CompiledShotPrompt(
        shot=shot,
        text=text,
        refs=refs,
        template_version=template_version,
    )

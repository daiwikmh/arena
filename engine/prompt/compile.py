from __future__ import annotations

from dataclasses import dataclass

from engine.ir import CopyBox, FormatSpec, LocaleSpec, ResolvedSpec, SceneSpec
from engine.prompt.link import link
from engine.prompt.lower import DEFAULT_TEMPLATE_VERSION, lower
from engine.prompt.resolve import resolve


@dataclass(frozen=True)
class CompiledPrompt:
    resolved: ResolvedSpec
    text: str
    refs: list[dict[str, str]]
    template_version: str


def compile_prompt(
    scene: SceneSpec,
    locale: LocaleSpec,
    fmt: FormatSpec,
    copy_box: CopyBox | None = None,
    template_version: str = DEFAULT_TEMPLATE_VERSION,
) -> CompiledPrompt:
    resolved = resolve(scene, locale, fmt, copy_box)
    text = lower(resolved, template_version)
    refs = link(resolved)
    return CompiledPrompt(
        resolved=resolved,
        text=text,
        refs=refs,
        template_version=template_version,
    )

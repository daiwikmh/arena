from __future__ import annotations

from collections.abc import Callable

from engine.ir import ResolvedSpec
from engine.prompt.templates import v1

DEFAULT_TEMPLATE_VERSION = "v1"

_TEMPLATES: dict[str, Callable[[ResolvedSpec], str]] = {
    "v1": v1.render,
}


def lower(resolved: ResolvedSpec, template_version: str = DEFAULT_TEMPLATE_VERSION) -> str:
    try:
        render = _TEMPLATES[template_version]
    except KeyError as exc:
        raise ValueError(f"unknown template version: {template_version!r}") from exc
    return render(resolved)

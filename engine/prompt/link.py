from __future__ import annotations

from engine.ir import ResolvedSpec


def link(resolved: ResolvedSpec) -> list[dict[str, str]]:
    return [
        {"asset_id": ref.asset_id, "role": "object", "label": ref.label}
        for ref in resolved.object_refs
    ]

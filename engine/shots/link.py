from __future__ import annotations

from engine.ir import ShotSpec


def link_shot(shot: ShotSpec) -> list[dict[str, str]]:
    return [
        {"asset_id": ref.asset_id, "role": "object", "label": ref.label}
        for ref in shot.object_refs
    ]

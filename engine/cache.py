from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from engine.ir import ResolvedSpec, ShotSpec

DEFAULT_CACHE_ROOT = Path(__file__).resolve().parent.parent / ".cache" / "scenes"


def compute_cache_key(resolved: ResolvedSpec, template_version: str, model_id: str) -> str:
    payload = {
        "resolved": json.loads(resolved.model_dump_json()),
        "template_version": template_version,
        "model_id": model_id,
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def compute_shot_cache_key(shot: ShotSpec, template_version: str, model_id: str) -> str:
    payload = {
        "shot": json.loads(shot.model_dump_json()),
        "template_version": template_version,
        "model_id": model_id,
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def compute_repair_key(parent_id: str, variant_index: int, repair_note: str) -> str:
    payload = {"parent": parent_id, "variant": variant_index, "note": repair_note}
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class CachedScene:
    key: str
    image_bytes: bytes
    mime_type: str
    model_id: str
    interaction_id: str | None


class SceneCache:
    def __init__(self, root: Path = DEFAULT_CACHE_ROOT) -> None:
        self.root = root

    def _dir_for(self, key: str) -> Path:
        return self.root / key[:2]

    def _image_path(self, key: str, mime_type: str) -> Path:
        ext = "png" if "png" in mime_type else "jpg"
        return self._dir_for(key) / f"{key}.{ext}"

    def _meta_path(self, key: str) -> Path:
        return self._dir_for(key) / f"{key}.json"

    def has(self, key: str) -> bool:
        return self._meta_path(key).exists()

    def get(self, key: str) -> CachedScene | None:
        meta_path = self._meta_path(key)
        if not meta_path.exists():
            return None
        meta = json.loads(meta_path.read_text())
        image_path = self._dir_for(key) / meta["filename"]
        return CachedScene(
            key=key,
            image_bytes=image_path.read_bytes(),
            mime_type=meta["mime_type"],
            model_id=meta.get("model_id", ""),
            interaction_id=meta.get("interaction_id"),
        )

    def put(
        self,
        key: str,
        image_bytes: bytes,
        mime_type: str,
        *,
        model_id: str = "",
        interaction_id: str | None = None,
    ) -> CachedScene:
        directory = self._dir_for(key)
        directory.mkdir(parents=True, exist_ok=True)
        image_path = self._image_path(key, mime_type)
        image_path.write_bytes(image_bytes)
        self._meta_path(key).write_text(
            json.dumps(
                {
                    "mime_type": mime_type,
                    "filename": image_path.name,
                    "model_id": model_id,
                    "interaction_id": interaction_id,
                }
            )
        )
        return CachedScene(
            key=key,
            image_bytes=image_bytes,
            mime_type=mime_type,
            model_id=model_id,
            interaction_id=interaction_id,
        )

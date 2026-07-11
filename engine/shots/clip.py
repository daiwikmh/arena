from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Literal

from engine.cache import SceneCache, compute_clip_cache_key
from engine.ir import Draft, ShotSpec
from engine.models import MODEL_ROUTING, ImageReference, generate_clip
from engine.shots.templates import render_clip_prompt

DEFAULT_CLIP_TEMPLATE_VERSION = "clip-v1"


@dataclass(frozen=True)
class ClipGenerationResult:
    shot: ShotSpec
    cache_key: str
    source: Literal["cache", "generated", "error"]
    video_bytes: bytes | None
    video_uri: str | None
    mime_type: str | None
    model_id: str | None
    interaction_id: str | None
    error: str | None


async def generate_clip_for_shot(
    shot: ShotSpec,
    *,
    keyframe_bytes: bytes,
    keyframe_mime_type: str,
    keyframe_draft_id: str,
    cache: SceneCache,
    template_version: str = DEFAULT_CLIP_TEMPLATE_VERSION,
) -> ClipGenerationResult:
    model_id = MODEL_ROUTING["animate"]
    key = compute_clip_cache_key(shot, keyframe_draft_id, template_version, model_id)

    cached = cache.get(key)
    if cached is not None:
        return ClipGenerationResult(
            shot=shot,
            cache_key=key,
            source="cache",
            video_bytes=cached.image_bytes,
            video_uri=None,
            mime_type=cached.mime_type,
            model_id=cached.model_id or model_id,
            interaction_id=cached.interaction_id,
            error=None,
        )

    prompt_text = render_clip_prompt(shot)
    try:
        result = await generate_clip(
            prompt_text,
            task="image_to_video",
            keyframe=ImageReference(data=keyframe_bytes, mime_type=keyframe_mime_type),
            aspect_ratio=shot.aspect_ratio,
            duration_sec=shot.duration_sec,
        )
    except Exception as exc:  # noqa: BLE001 -- surfaced verbatim in the report, not swallowed
        return ClipGenerationResult(
            shot=shot,
            cache_key=key,
            source="error",
            video_bytes=None,
            video_uri=None,
            mime_type=None,
            model_id=None,
            interaction_id=None,
            error=f"{type(exc).__name__}: {exc}",
        )

    if result.video_bytes is not None:
        cache.put(
            key,
            result.video_bytes,
            result.mime_type,
            model_id=result.model_id,
            interaction_id=result.interaction_id,
        )

    return ClipGenerationResult(
        shot=shot,
        cache_key=key,
        source="generated",
        video_bytes=result.video_bytes,
        video_uri=result.video_uri,
        mime_type=result.mime_type,
        model_id=result.model_id,
        interaction_id=result.interaction_id,
        error=None,
    )


def build_clip_draft(
    result: ClipGenerationResult, keyframe_draft_id: str, template_version: str
) -> Draft:
    return Draft(
        id=result.cache_key,
        prompt_hash=hashlib.sha256(result.shot.model_dump_json().encode("utf-8")).hexdigest()[:16],
        template_version=template_version,
        model_id=result.model_id or "",
        image_ref=result.cache_key,
        author="agent",
        interaction_id=result.interaction_id,
        parent=keyframe_draft_id,
        findings=[],
    )

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Literal

from engine.cache import SceneCache, compute_shot_cache_key
from engine.executor import PRICE_PER_M_OUTPUT_TOKENS, TokenBucket
from engine.ir import ShotSpec
from engine.models import MODEL_ROUTING, ImageReference, ModelRole, Usage, generate_image
from engine.shots.compile import DEFAULT_SHOT_TEMPLATE_VERSION, compile_shot_prompt


def _resolve_refs(cache: SceneCache, refs: list[dict[str, str]]) -> list[ImageReference]:
    resolved: list[ImageReference] = []
    for ref in refs:
        cached = cache.get(ref["asset_id"])
        if cached is not None:
            resolved.append(ImageReference(data=cached.image_bytes, mime_type=cached.mime_type))
    return resolved


@dataclass(frozen=True)
class KeyframeResult:
    shot: ShotSpec
    cache_key: str
    source: Literal["cache", "generated", "error"]
    image_bytes: bytes | None
    mime_type: str | None
    model_id: str | None
    interaction_id: str | None
    usage: Usage | None
    error: str | None


@dataclass(frozen=True)
class KeyframeBatchReport:
    results: list[KeyframeResult]
    wall_clock_seconds: float
    api_calls: int
    cache_hits: int
    errors: int
    total_cost_usd: float


async def _generate_one_keyframe(
    shot: ShotSpec,
    *,
    cache: SceneCache,
    template_version: str,
    role: ModelRole,
    semaphore: asyncio.Semaphore,
    bucket: TokenBucket | None,
) -> KeyframeResult:
    compiled = compile_shot_prompt(shot, template_version)
    model_id = MODEL_ROUTING[role]
    key = compute_shot_cache_key(shot, template_version, model_id)

    cached = cache.get(key)
    if cached is not None:
        return KeyframeResult(
            shot=shot,
            cache_key=key,
            source="cache",
            image_bytes=cached.image_bytes,
            mime_type=cached.mime_type,
            model_id=cached.model_id or model_id,
            interaction_id=cached.interaction_id,
            usage=None,
            error=None,
        )

    refs = _resolve_refs(cache, compiled.refs)
    image_kwargs = {"refs": refs} if refs else {}

    async with semaphore:
        if bucket is not None:
            await bucket.acquire()
        try:
            generated = await generate_image(compiled.text, role=role, **image_kwargs)
        except Exception as exc:  # noqa: BLE001 -- surfaced verbatim in the report, not swallowed
            return KeyframeResult(
                shot=shot,
                cache_key=key,
                source="error",
                image_bytes=None,
                mime_type=None,
                model_id=None,
                interaction_id=None,
                usage=None,
                error=f"{type(exc).__name__}: {exc}",
            )

    cache.put(
        key,
        generated.image_bytes,
        generated.mime_type,
        model_id=generated.model_id,
        interaction_id=generated.interaction_id,
    )
    return KeyframeResult(
        shot=shot,
        cache_key=key,
        source="generated",
        image_bytes=generated.image_bytes,
        mime_type=generated.mime_type,
        model_id=generated.model_id,
        interaction_id=generated.interaction_id,
        usage=generated.usage,
        error=None,
    )


async def generate_keyframes(
    shots: list[ShotSpec],
    *,
    cache: SceneCache,
    template_version: str = DEFAULT_SHOT_TEMPLATE_VERSION,
    role: ModelRole = "scene",
    max_concurrent: int = 10,
    rate_per_minute: float | None = None,
) -> KeyframeBatchReport:
    semaphore = asyncio.Semaphore(max_concurrent)
    bucket = TokenBucket(rate_per_minute) if rate_per_minute else None

    started = time.monotonic()
    results = await asyncio.gather(
        *(
            _generate_one_keyframe(
                shot,
                cache=cache,
                template_version=template_version,
                role=role,
                semaphore=semaphore,
                bucket=bucket,
            )
            for shot in shots
        )
    )
    wall_clock = time.monotonic() - started

    api_calls = sum(1 for r in results if r.source == "generated")
    cache_hits = sum(1 for r in results if r.source == "cache")
    errors = sum(1 for r in results if r.source == "error")
    total_cost = sum(
        r.usage.candidates_tokens * PRICE_PER_M_OUTPUT_TOKENS / 1_000_000
        for r in results
        if r.usage is not None
    )

    return KeyframeBatchReport(
        results=list(results),
        wall_clock_seconds=wall_clock,
        api_calls=api_calls,
        cache_hits=cache_hits,
        errors=errors,
        total_cost_usd=total_cost,
    )

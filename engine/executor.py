from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Literal

from engine.cache import SceneCache, compute_cache_key
from engine.ir import FormatSpec, LocaleSpec, ResolvedSpec, SceneSpec
from engine.models import ModelRole, MODEL_ROUTING, Usage, generate_image
from engine.prompt import DEFAULT_TEMPLATE_VERSION, compile_prompt

PRICE_PER_M_OUTPUT_TOKENS = 30.00


class TokenBucket:
    def __init__(self, rate_per_minute: float, burst: int | None = None) -> None:
        self.rate_per_second = rate_per_minute / 60
        self.capacity = burst if burst is not None else max(1, int(rate_per_minute))
        self.tokens = float(self.capacity)
        self.updated = time.monotonic()
        self.lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self.lock:
            while True:
                now = time.monotonic()
                elapsed = now - self.updated
                self.tokens = min(self.capacity, self.tokens + elapsed * self.rate_per_second)
                self.updated = now
                if self.tokens >= 1:
                    self.tokens -= 1
                    return
                await asyncio.sleep((1 - self.tokens) / self.rate_per_second)


@dataclass(frozen=True)
class FanOutResult:
    resolved: ResolvedSpec
    cache_key: str
    source: Literal["cache", "generated", "error"]
    image_bytes: bytes | None
    mime_type: str | None
    model_id: str | None
    interaction_id: str | None
    usage: Usage | None
    error: str | None


@dataclass(frozen=True)
class FanOutReport:
    results: list[FanOutResult]
    wall_clock_seconds: float
    api_calls: int
    cache_hits: int
    errors: int
    total_cost_usd: float


async def _generate_one(
    scene: SceneSpec,
    locale: LocaleSpec,
    fmt: FormatSpec,
    *,
    cache: SceneCache,
    template_version: str,
    role: ModelRole,
    semaphore: asyncio.Semaphore,
    bucket: TokenBucket | None,
) -> FanOutResult:
    compiled = compile_prompt(scene, locale, fmt, template_version=template_version)
    resolved = compiled.resolved
    model_id = MODEL_ROUTING[role]
    key = compute_cache_key(resolved, template_version, model_id)

    cached = cache.get(key)
    if cached is not None:
        return FanOutResult(
            resolved=resolved,
            cache_key=key,
            source="cache",
            image_bytes=cached.image_bytes,
            mime_type=cached.mime_type,
            model_id=cached.model_id or model_id,
            interaction_id=cached.interaction_id,
            usage=None,
            error=None,
        )

    async with semaphore:
        if bucket is not None:
            await bucket.acquire()
        try:
            generated = await generate_image(compiled.text, role=role)
        except Exception as exc:  # noqa: BLE001 -- surfaced verbatim in the report, not swallowed
            return FanOutResult(
                resolved=resolved,
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
    return FanOutResult(
        resolved=resolved,
        cache_key=key,
        source="generated",
        image_bytes=generated.image_bytes,
        mime_type=generated.mime_type,
        model_id=generated.model_id,
        interaction_id=generated.interaction_id,
        usage=generated.usage,
        error=None,
    )


async def fan_out(
    scene: SceneSpec,
    locales: list[LocaleSpec],
    formats: list[FormatSpec],
    *,
    cache: SceneCache,
    template_version: str = DEFAULT_TEMPLATE_VERSION,
    role: ModelRole = "scene",
    max_concurrent: int = 10,
    rate_per_minute: float | None = None,
) -> FanOutReport:
    semaphore = asyncio.Semaphore(max_concurrent)
    bucket = TokenBucket(rate_per_minute) if rate_per_minute else None

    started = time.monotonic()
    results = await asyncio.gather(
        *(
            _generate_one(
                scene,
                locale,
                fmt,
                cache=cache,
                template_version=template_version,
                role=role,
                semaphore=semaphore,
                bucket=bucket,
            )
            for locale in locales
            for fmt in formats
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

    return FanOutReport(
        results=list(results),
        wall_clock_seconds=wall_clock,
        api_calls=api_calls,
        cache_hits=cache_hits,
        errors=errors,
        total_cost_usd=total_cost,
    )

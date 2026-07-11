import asyncio
import time

import pytest

from engine import executor as executor_mod
from engine.cache import SceneCache
from engine.executor import TokenBucket, fan_out
from engine.models import ImageResult, Usage
from tests.fixtures.formats import FORMATS
from tests.fixtures.locales import LOCALES
from tests.fixtures.scenes import SCENES


class FakeGenerator:
    def __init__(self) -> None:
        self.calls = 0
        self.max_concurrent_seen = 0
        self._in_flight = 0
        self._lock = asyncio.Lock()

    async def __call__(self, prompt_text: str, *, role: str = "scene") -> ImageResult:
        async with self._lock:
            self._in_flight += 1
            self.max_concurrent_seen = max(self.max_concurrent_seen, self._in_flight)
        self.calls += 1
        await asyncio.sleep(0.01)
        async with self._lock:
            self._in_flight -= 1
        return ImageResult(
            image_bytes=f"img-for:{prompt_text}".encode(),
            mime_type="image/png",
            usage=Usage(prompt_tokens=40, candidates_tokens=1120, total_tokens=1160),
            model_id="gemini-3.1-flash-lite-image",
            response_id="resp-fake",
            interaction_id=None,
        )


@pytest.fixture
def cache(tmp_path):
    return SceneCache(root=tmp_path / "scenes")


@pytest.fixture
def fake_generator(monkeypatch):
    fake = FakeGenerator()
    monkeypatch.setattr(executor_mod, "generate_image", fake)
    return fake


def _matrix(n_locales: int = 3, n_formats: int = 2):
    return LOCALES[:n_locales], FORMATS[:n_formats]


async def test_cold_fan_out_calls_the_model_for_every_cell(cache, fake_generator):
    locales, formats = _matrix()
    report = await fan_out(SCENES[0], locales, formats, cache=cache, max_concurrent=4)

    n = len(locales) * len(formats)
    assert report.api_calls == n
    assert report.cache_hits == 0
    assert report.errors == 0
    assert fake_generator.calls == n
    assert report.total_cost_usd == pytest.approx(n * 1120 * 30.00 / 1_000_000)


async def test_warm_rerun_hits_cache_and_calls_the_model_zero_times(cache, fake_generator):
    locales, formats = _matrix()
    await fan_out(SCENES[0], locales, formats, cache=cache, max_concurrent=4)

    fake_generator.calls = 0
    report = await fan_out(SCENES[0], locales, formats, cache=cache, max_concurrent=4)

    n = len(locales) * len(formats)
    assert report.api_calls == 0
    assert report.cache_hits == n
    assert report.total_cost_usd == 0.0
    assert fake_generator.calls == 0


async def test_editing_headline_copy_is_still_free_through_the_executor(cache, fake_generator):
    locales, formats = _matrix(n_locales=1, n_formats=1)
    await fan_out(SCENES[0], locales, formats, cache=cache, max_concurrent=4)

    edited = [
        locales[0].model_copy(
            update={"headline": "A completely different, much longer headline."}
        )
    ]
    fake_generator.calls = 0
    report = await fan_out(SCENES[0], edited, formats, cache=cache, max_concurrent=4)

    assert report.api_calls == 0
    assert report.cache_hits == 1
    assert fake_generator.calls == 0


async def test_concurrency_is_bounded_by_max_concurrent(cache, fake_generator):
    locales, formats = _matrix(n_locales=5, n_formats=2)
    await fan_out(SCENES[0], locales, formats, cache=cache, max_concurrent=3)

    assert fake_generator.max_concurrent_seen <= 3


async def test_errors_are_captured_not_raised(cache, monkeypatch):
    async def failing(prompt_text: str, *, role: str = "scene") -> ImageResult:
        raise RuntimeError("429 rate limited")

    monkeypatch.setattr(executor_mod, "generate_image", failing)

    locales, formats = _matrix(n_locales=1, n_formats=1)
    report = await fan_out(SCENES[0], locales, formats, cache=cache, max_concurrent=2)

    assert report.errors == 1
    assert report.api_calls == 0
    assert report.results[0].error is not None
    assert "429" in report.results[0].error


async def test_token_bucket_throttles_to_the_configured_rate():
    bucket = TokenBucket(rate_per_minute=600, burst=2)
    started = time.monotonic()
    for _ in range(4):
        await bucket.acquire()
    elapsed = time.monotonic() - started

    assert elapsed >= 0.15

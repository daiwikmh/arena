import asyncio

import pytest

import engine.shots.executor as shot_executor_mod
from engine.cache import SceneCache
from engine.models import ImageResult, Usage
from engine.shots import generate_keyframes
from tests.fixtures.shots import SHOTS


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
            image_bytes=f"keyframe-for:{prompt_text}".encode(),
            mime_type="image/png",
            usage=Usage(prompt_tokens=40, candidates_tokens=1120, total_tokens=1160),
            model_id="gemini-3.1-flash-lite-image",
            response_id="resp-fake",
            interaction_id="ixn-fake",
        )


@pytest.fixture
def cache(tmp_path):
    return SceneCache(root=tmp_path / "scenes")


@pytest.fixture
def fake_generator(monkeypatch):
    fake = FakeGenerator()
    monkeypatch.setattr(shot_executor_mod, "generate_image", fake)
    return fake


async def test_cold_batch_calls_the_model_once_per_shot(cache, fake_generator):
    shots = SHOTS[:4]
    report = await generate_keyframes(shots, cache=cache, max_concurrent=4)

    assert report.api_calls == 4
    assert report.cache_hits == 0
    assert report.errors == 0
    assert fake_generator.calls == 4
    assert report.total_cost_usd == pytest.approx(4 * 1120 * 30.00 / 1_000_000)


async def test_warm_rerun_hits_cache_and_calls_the_model_zero_times(cache, fake_generator):
    shots = SHOTS[:4]
    await generate_keyframes(shots, cache=cache, max_concurrent=4)

    fake_generator.calls = 0
    report = await generate_keyframes(shots, cache=cache, max_concurrent=4)

    assert report.api_calls == 0
    assert report.cache_hits == 4
    assert report.total_cost_usd == 0.0
    assert fake_generator.calls == 0


async def test_editing_the_action_text_regenerates_only_that_shot(cache, fake_generator):
    shots = SHOTS[:3]
    await generate_keyframes(shots, cache=cache, max_concurrent=4)

    edited = shots[0].model_copy(update={"action": "a golf ball follows the marble down the track"})
    fake_generator.calls = 0
    report = await generate_keyframes([edited, shots[1], shots[2]], cache=cache, max_concurrent=4)

    assert report.api_calls == 1
    assert report.cache_hits == 2
    assert fake_generator.calls == 1


async def test_concurrency_is_bounded_by_max_concurrent(cache, fake_generator):
    shots = SHOTS[:6]
    await generate_keyframes(shots, cache=cache, max_concurrent=2)
    assert fake_generator.max_concurrent_seen <= 2


async def test_errors_are_captured_not_raised(cache, monkeypatch):
    async def failing(prompt_text: str, *, role: str = "scene") -> ImageResult:
        raise RuntimeError("429 rate limited")

    monkeypatch.setattr(shot_executor_mod, "generate_image", failing)

    report = await generate_keyframes(SHOTS[:2], cache=cache, max_concurrent=2)

    assert report.errors == 2
    assert report.api_calls == 0
    assert all(r.error is not None and "429" in r.error for r in report.results)

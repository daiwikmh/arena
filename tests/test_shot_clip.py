import pytest

import engine.shots.clip as clip_mod
from engine.cache import SceneCache
from engine.models import ClipResult, Usage
from engine.shots import build_clip_draft, generate_clip_for_shot
from engine.shots.clip import ClipGenerationResult
from tests.fixtures.shots import SHOTS


class FakeClipGenerator:
    def __init__(self) -> None:
        self.calls = 0
        self.last_kwargs = None

    async def __call__(self, prompt_text, *, task="image_to_video", keyframe=None, aspect_ratio=None, duration_sec=None, previous_interaction_id=None, role="animate"):
        self.calls += 1
        self.last_kwargs = {"prompt_text": prompt_text, "task": task, "keyframe": keyframe}
        return ClipResult(
            video_bytes=f"clip-{self.calls}".encode(),
            video_uri=None,
            mime_type="video/mp4",
            usage=Usage(prompt_tokens=200, candidates_tokens=5792 * 6, total_tokens=0),
            model_id="gemini-omni-flash-preview",
            interaction_id=f"ixn-{self.calls}",
        )


@pytest.fixture
def cache(tmp_path):
    return SceneCache(root=tmp_path / "clips")


@pytest.fixture
def fake_generator(monkeypatch):
    fake = FakeClipGenerator()
    monkeypatch.setattr(clip_mod, "generate_clip", fake)
    return fake


async def test_cold_generation_calls_the_model_once(cache, fake_generator):
    shot = SHOTS[0]
    result = await generate_clip_for_shot(
        shot,
        keyframe_bytes=b"keyframe-bytes",
        keyframe_mime_type="image/png",
        keyframe_draft_id="kf-draft-1",
        cache=cache,
    )

    assert result.source == "generated"
    assert result.video_bytes == b"clip-1"
    assert fake_generator.calls == 1
    assert fake_generator.last_kwargs["keyframe"].mime_type == "image/png"


async def test_warm_rerun_hits_cache(cache, fake_generator):
    shot = SHOTS[0]
    first = await generate_clip_for_shot(
        shot,
        keyframe_bytes=b"keyframe-bytes",
        keyframe_mime_type="image/png",
        keyframe_draft_id="kf-draft-1",
        cache=cache,
    )
    fake_generator.calls = 0

    second = await generate_clip_for_shot(
        shot,
        keyframe_bytes=b"keyframe-bytes",
        keyframe_mime_type="image/png",
        keyframe_draft_id="kf-draft-1",
        cache=cache,
    )

    assert second.source == "cache"
    assert second.video_bytes == first.video_bytes
    assert second.cache_key == first.cache_key
    assert fake_generator.calls == 0


async def test_regenerating_the_keyframe_invalidates_the_clip_cache(cache, fake_generator):
    shot = SHOTS[0]
    first = await generate_clip_for_shot(
        shot,
        keyframe_bytes=b"keyframe-bytes",
        keyframe_mime_type="image/png",
        keyframe_draft_id="kf-draft-1",
        cache=cache,
    )

    fake_generator.calls = 0
    second = await generate_clip_for_shot(
        shot,
        keyframe_bytes=b"a-different-keyframe",
        keyframe_mime_type="image/png",
        keyframe_draft_id="kf-draft-2",
        cache=cache,
    )

    assert second.cache_key != first.cache_key
    assert fake_generator.calls == 1


async def test_errors_are_captured_not_raised(cache, monkeypatch):
    async def failing(*args, **kwargs):
        raise RuntimeError("429 quota exceeded")

    monkeypatch.setattr(clip_mod, "generate_clip", failing)

    result = await generate_clip_for_shot(
        SHOTS[0],
        keyframe_bytes=b"kf",
        keyframe_mime_type="image/png",
        keyframe_draft_id="kf-draft-1",
        cache=cache,
    )

    assert result.source == "error"
    assert result.video_bytes is None
    assert "429" in result.error


async def test_build_clip_draft_points_parent_at_the_keyframe():
    shot = SHOTS[0]

    result = ClipGenerationResult(
        shot=shot,
        cache_key="clip-key-abc",
        source="generated",
        video_bytes=b"x",
        video_uri=None,
        mime_type="video/mp4",
        model_id="gemini-omni-flash-preview",
        interaction_id="ixn-1",
        error=None,
    )

    draft = build_clip_draft(result, keyframe_draft_id="kf-draft-1", template_version="clip-v1")

    assert draft.id == "clip-key-abc"
    assert draft.parent == "kf-draft-1"
    assert draft.author == "agent"
    assert draft.interaction_id == "ixn-1"

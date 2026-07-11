import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import engine.shots.clip as shot_clip_mod
import engine.shots.executor as shot_executor_mod
import engine.shots_api as shots_api_mod
from engine.cache import SceneCache
from engine.models import ClipResult, ImageResult, Usage

SHOT_BODY = {
    "subject": "a glass marble at the top of a wooden chain-reaction track",
    "setting": "a sunlit workshop table, close-up",
    "action": "the marble is released and begins rolling down the track",
    "camera_movement": "pan_right",
    "time_of_day": "day",
    "palette": ["#8A5A32", "#EDEEF0"],
    "mood": "playful, precise",
    "lighting": "soft",
    "duration_sec": 6,
    "aspect_ratio": "16:9",
    "excludes": ["text", "people"],
    "object_refs": [{"asset_id": "ast_marble01", "label": "glass marble"}],
}


@pytest.fixture(autouse=True)
def isolated_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(shots_api_mod, "_cache", SceneCache(root=tmp_path / "scenes"))
    shots_api_mod._PROJECTS.clear()
    yield


@pytest.fixture
def client():
    from engine.api import app

    return TestClient(app)


class FakeGenerator:
    def __init__(self) -> None:
        self.calls = 0

    async def __call__(self, prompt_text: str, *, role: str = "scene") -> ImageResult:
        self.calls += 1
        buf = io.BytesIO()
        Image.new("RGB", (64, 64), color=(self.calls * 10 % 256, 40, 60)).save(buf, format="PNG")
        return ImageResult(
            image_bytes=buf.getvalue(),
            mime_type="image/png",
            usage=Usage(prompt_tokens=40, candidates_tokens=1120, total_tokens=1160),
            model_id="gemini-3.1-flash-lite-image",
            response_id=f"resp-{self.calls}",
            interaction_id=f"ixn-{self.calls}",
        )


@pytest.fixture
def fake_generator(monkeypatch):
    fake = FakeGenerator()
    monkeypatch.setattr(shot_executor_mod, "generate_image", fake)
    return fake


class FakeClipGenerator:
    def __init__(self) -> None:
        self.calls = 0

    async def __call__(self, prompt_text, *, task="image_to_video", keyframe=None, aspect_ratio=None, duration_sec=None, previous_interaction_id=None, role="animate"):
        self.calls += 1
        return ClipResult(
            video_bytes=f"clip-bytes-{self.calls}".encode(),
            video_uri=None,
            mime_type="video/mp4",
            usage=None,
            model_id="gemini-omni-flash-preview",
            interaction_id=f"clip-ixn-{self.calls}",
        )


@pytest.fixture
def fake_clip_generator(monkeypatch):
    fake = FakeClipGenerator()
    monkeypatch.setattr(shot_clip_mod, "generate_clip", fake)
    return fake


def test_get_project_auto_creates_an_empty_project(client):
    r = client.get("/projects/proj-1")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "proj-1"
    assert body["shots"] == []


def test_create_shot_adds_it_to_the_project(client):
    r = client.post("/projects/proj-1/shots", json=SHOT_BODY)
    assert r.status_code == 200
    shot_id = r.json()["shot_id"]

    summary = client.get("/projects/proj-1").json()
    assert summary["shot_ids"] == [shot_id]
    assert summary["shots"][0]["has_keyframe"] is False
    assert summary["shots"][0]["spec"]["camera_movement"] == "pan_right"


def test_generate_keyframe_then_fetch_image(client, fake_generator):
    shot_id = client.post("/projects/proj-1/shots", json=SHOT_BODY).json()["shot_id"]

    r = client.post(f"/projects/proj-1/shots/{shot_id}/keyframe")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "generated"
    assert body["draft_id"] is not None
    assert body["cost_usd"] == pytest.approx(1120 * 30.00 / 1_000_000)
    assert fake_generator.calls == 1

    r = client.get(f"/projects/proj-1/shots/{shot_id}/keyframe/image")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    img = Image.open(io.BytesIO(r.content))
    assert img.size == (64, 64)

    summary = client.get("/projects/proj-1").json()
    assert summary["shots"][0]["has_keyframe"] is True
    assert summary["shots"][0]["draft_id"] == body["draft_id"]


def test_regenerating_the_same_shot_hits_cache(client, fake_generator):
    shot_id = client.post("/projects/proj-1/shots", json=SHOT_BODY).json()["shot_id"]

    first = client.post(f"/projects/proj-1/shots/{shot_id}/keyframe").json()
    assert first["status"] == "generated"
    assert fake_generator.calls == 1

    second = client.post(f"/projects/proj-1/shots/{shot_id}/keyframe").json()
    assert second["status"] == "cached"
    assert second["cost_usd"] == 0.0
    assert second["draft_id"] == first["draft_id"]
    assert fake_generator.calls == 1


def test_keyframe_generation_surfaces_errors_without_500(client, monkeypatch):
    async def failing(prompt_text: str, *, role: str = "scene") -> ImageResult:
        raise RuntimeError("429 RESOURCE_EXHAUSTED")

    monkeypatch.setattr(shot_executor_mod, "generate_image", failing)

    shot_id = client.post("/projects/proj-1/shots", json=SHOT_BODY).json()["shot_id"]
    r = client.post(f"/projects/proj-1/shots/{shot_id}/keyframe")

    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "error"
    assert body["draft_id"] is None
    assert "429" in body["error"]


def test_keyframe_image_404s_before_generation(client):
    shot_id = client.post("/projects/proj-1/shots", json=SHOT_BODY).json()["shot_id"]
    r = client.get(f"/projects/proj-1/shots/{shot_id}/keyframe/image")
    assert r.status_code == 404


def test_unknown_shot_404s(client):
    client.get("/projects/proj-1")
    r = client.post("/projects/proj-1/shots/not-a-real-shot/keyframe")
    assert r.status_code == 404


def test_clip_requires_an_approved_keyframe_first(client, fake_clip_generator):
    shot_id = client.post("/projects/proj-1/shots", json=SHOT_BODY).json()["shot_id"]
    r = client.post(f"/projects/proj-1/shots/{shot_id}/clip")
    assert r.status_code == 400
    assert fake_clip_generator.calls == 0


def test_generate_clip_after_keyframe_then_fetch_video(client, fake_generator, fake_clip_generator):
    shot_id = client.post("/projects/proj-1/shots", json=SHOT_BODY).json()["shot_id"]
    client.post(f"/projects/proj-1/shots/{shot_id}/keyframe")

    r = client.post(f"/projects/proj-1/shots/{shot_id}/clip")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "generated"
    assert body["delivery"] == "bytes"
    assert body["draft_id"] is not None
    assert body["cost_usd"] == pytest.approx(6 * 5792 * 17.50 / 1_000_000)
    assert fake_clip_generator.calls == 1

    r = client.get(f"/projects/proj-1/shots/{shot_id}/clip/video")
    assert r.status_code == 200
    assert r.headers["content-type"] == "video/mp4"
    assert r.content == b"clip-bytes-1"

    summary = client.get("/projects/proj-1").json()
    assert summary["shots"][0]["has_clip"] is True
    assert summary["shots"][0]["clip_draft_id"] == body["draft_id"]


def test_clip_draft_parent_is_the_keyframe_draft(client, fake_generator, fake_clip_generator):
    shot_id = client.post("/projects/proj-1/shots", json=SHOT_BODY).json()["shot_id"]
    keyframe = client.post(f"/projects/proj-1/shots/{shot_id}/keyframe").json()
    clip = client.post(f"/projects/proj-1/shots/{shot_id}/clip").json()

    project = shots_api_mod._get_or_create_project("proj-1")
    shot_state = project.shots[shot_id]
    assert shot_state.clip_draft.parent == keyframe["draft_id"]
    assert shot_state.clip_draft.id == clip["draft_id"]


def test_regenerating_clip_for_same_keyframe_hits_cache(client, fake_generator, fake_clip_generator):
    shot_id = client.post("/projects/proj-1/shots", json=SHOT_BODY).json()["shot_id"]
    client.post(f"/projects/proj-1/shots/{shot_id}/keyframe")

    first = client.post(f"/projects/proj-1/shots/{shot_id}/clip").json()
    assert first["status"] == "generated"
    assert fake_clip_generator.calls == 1

    second = client.post(f"/projects/proj-1/shots/{shot_id}/clip").json()
    assert second["status"] == "cached"
    assert second["cost_usd"] == 0.0
    assert second["draft_id"] == first["draft_id"]
    assert fake_clip_generator.calls == 1


def test_clip_generation_surfaces_errors_without_500(client, fake_generator, monkeypatch):
    shot_id = client.post("/projects/proj-1/shots", json=SHOT_BODY).json()["shot_id"]
    client.post(f"/projects/proj-1/shots/{shot_id}/keyframe")

    async def failing(*args, **kwargs):
        raise RuntimeError("429 RESOURCE_EXHAUSTED")

    monkeypatch.setattr(shot_clip_mod, "generate_clip", failing)

    r = client.post(f"/projects/proj-1/shots/{shot_id}/clip")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "error"
    assert body["draft_id"] is None
    assert "429" in body["error"]


def test_clip_video_404s_before_generation(client, fake_generator):
    shot_id = client.post("/projects/proj-1/shots", json=SHOT_BODY).json()["shot_id"]
    client.post(f"/projects/proj-1/shots/{shot_id}/keyframe")
    r = client.get(f"/projects/proj-1/shots/{shot_id}/clip/video")
    assert r.status_code == 404


def test_upload_asset_then_fetch_it_back(client):
    r = client.post(
        "/projects/proj-1/assets",
        files={"file": ("reference.png", b"fake-png-bytes", "image/png")},
    )
    assert r.status_code == 200
    asset = r.json()["asset"]
    assert asset["filename"] == "reference.png"
    assert asset["mime_type"] == "image/png"
    assert asset["url"] == f"/projects/proj-1/assets/{asset['id']}"

    r = client.get(asset["url"])
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert r.content == b"fake-png-bytes"

    summary = client.get("/projects/proj-1").json()
    assert len(summary["assets"]) == 1
    assert summary["assets"][0]["id"] == asset["id"]


def test_uploading_the_same_bytes_twice_reuses_the_asset_id(client):
    first = client.post(
        "/projects/proj-1/assets",
        files={"file": ("a.png", b"identical-bytes", "image/png")},
    ).json()["asset"]
    second = client.post(
        "/projects/proj-1/assets",
        files={"file": ("b.png", b"identical-bytes", "image/png")},
    ).json()["asset"]

    assert first["id"] == second["id"]
    summary = client.get("/projects/proj-1").json()
    assert len(summary["assets"]) == 1


def test_upload_rejects_empty_file(client):
    r = client.post("/projects/proj-1/assets", files={"file": ("empty.png", b"", "image/png")})
    assert r.status_code == 400


def test_get_asset_404s_for_unknown_id(client):
    client.get("/projects/proj-1")
    r = client.get("/projects/proj-1/assets/not-a-real-asset")
    assert r.status_code == 404


def test_assets_are_scoped_per_project(client):
    client.post(
        "/projects/proj-1/assets",
        files={"file": ("a.png", b"proj-1-bytes", "image/png")},
    )
    summary_proj_2 = client.get("/projects/proj-2").json()
    assert summary_proj_2["assets"] == []

import base64
from types import SimpleNamespace

import pytest

import engine.models as models_mod
from engine.models import ImageReference, generate_clip


def make_video_content(*, data=None, uri=None, mime_type="video/mp4"):
    return SimpleNamespace(type="video", data=data, uri=uri, mime_type=mime_type)


def make_interaction(*, contents=None, interaction_id="ixn-1", usage=None, steps=None):
    if steps is None:
        steps = [SimpleNamespace(type="model_output", content=contents or [])]
    return SimpleNamespace(steps=steps, id=interaction_id, usage=usage)


class FakeInteractionsClient:
    def __init__(self, response):
        self._response = response
        self.last_body = None

    async def create(self, *, body):
        self.last_body = body
        return self._response


class FakeClient:
    def __init__(self, response):
        self.interactions = FakeInteractionsClient(response)


@pytest.fixture
def keyframe():
    return ImageReference(data=b"\x89PNG-fake-bytes", mime_type="image/png")


async def test_generate_clip_sends_image_and_text_content_with_task(monkeypatch, keyframe):
    video_bytes = b"fake-mp4-bytes"
    interaction = make_interaction(
        contents=[make_video_content(data=base64.b64encode(video_bytes).decode())]
    )
    fake_client = FakeClient(interaction)
    monkeypatch.setattr(models_mod, "get_client", lambda: fake_client)

    await generate_clip("animate this", keyframe=keyframe, task="image_to_video")

    body = fake_client.interactions.last_body
    assert body["model"] == "gemini-omni-flash-preview"
    assert body["generation_config"]["video_config"]["task"] == "image_to_video"
    assert body["input"][0] == {
        "type": "image",
        "data": keyframe.data,
        "mime_type": keyframe.mime_type,
    }
    assert body["input"][1] == {"type": "text", "text": "animate this"}
    assert body["response_format"]["type"] == "video"


async def test_generate_clip_without_keyframe_omits_image_content(monkeypatch):
    interaction = make_interaction(
        contents=[make_video_content(data=base64.b64encode(b"x").decode())]
    )
    fake_client = FakeClient(interaction)
    monkeypatch.setattr(models_mod, "get_client", lambda: fake_client)

    await generate_clip("a sunrise", task="text_to_video")

    body = fake_client.interactions.last_body
    assert body["input"] == [{"type": "text", "text": "a sunrise"}]


async def test_generate_clip_extracts_inline_video_bytes(monkeypatch, keyframe):
    video_bytes = b"real-video-payload"
    interaction = make_interaction(
        contents=[make_video_content(data=base64.b64encode(video_bytes).decode(), mime_type="video/mp4")],
        interaction_id="ixn-abc",
    )
    monkeypatch.setattr(models_mod, "get_client", lambda: FakeClient(interaction))

    result = await generate_clip("animate", keyframe=keyframe)

    assert result.video_bytes == video_bytes
    assert result.video_uri is None
    assert result.mime_type == "video/mp4"
    assert result.interaction_id == "ixn-abc"


async def test_generate_clip_extracts_uri_when_no_inline_data(monkeypatch, keyframe):
    interaction = make_interaction(
        contents=[make_video_content(data=None, uri="gs://bucket/clip.mp4")]
    )
    monkeypatch.setattr(models_mod, "get_client", lambda: FakeClient(interaction))

    result = await generate_clip("animate", keyframe=keyframe)

    assert result.video_bytes is None
    assert result.video_uri == "gs://bucket/clip.mp4"


async def test_generate_clip_raises_when_no_video_content(monkeypatch, keyframe):
    interaction = make_interaction(contents=[])
    monkeypatch.setattr(models_mod, "get_client", lambda: FakeClient(interaction))

    with pytest.raises(RuntimeError, match="no video content"):
        await generate_clip("animate", keyframe=keyframe)


async def test_generate_clip_includes_previous_interaction_id_when_chaining(monkeypatch, keyframe):
    interaction = make_interaction(
        contents=[make_video_content(data=base64.b64encode(b"x").decode())]
    )
    fake_client = FakeClient(interaction)
    monkeypatch.setattr(models_mod, "get_client", lambda: fake_client)

    await generate_clip("swap the car for a truck", task="edit", previous_interaction_id="ixn-parent")

    body = fake_client.interactions.last_body
    assert body["previous_interaction_id"] == "ixn-parent"
    assert body["generation_config"]["video_config"]["task"] == "edit"


async def test_generate_clip_omits_previous_interaction_id_when_absent(monkeypatch, keyframe):
    interaction = make_interaction(
        contents=[make_video_content(data=base64.b64encode(b"x").decode())]
    )
    fake_client = FakeClient(interaction)
    monkeypatch.setattr(models_mod, "get_client", lambda: fake_client)

    await generate_clip("animate", keyframe=keyframe)

    assert "previous_interaction_id" not in fake_client.interactions.last_body


async def test_generate_clip_passes_aspect_ratio_and_duration(monkeypatch, keyframe):
    interaction = make_interaction(
        contents=[make_video_content(data=base64.b64encode(b"x").decode())]
    )
    fake_client = FakeClient(interaction)
    monkeypatch.setattr(models_mod, "get_client", lambda: fake_client)

    await generate_clip("animate", keyframe=keyframe, aspect_ratio="16:9", duration_sec=6)

    fmt = fake_client.interactions.last_body["response_format"]
    assert fmt["aspect_ratio"] == "16:9"
    assert fmt["duration"] == "6s"

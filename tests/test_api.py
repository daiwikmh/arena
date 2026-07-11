import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import engine.api as api_mod
import engine.executor as executor_mod
import engine.repair as repair_mod
from engine.cache import SceneCache
from engine.ir import Finding, ObjectRef, SceneSpec
from engine.models import ImageResult, Usage
from engine.planner import PlanRequest

BRAND_BODY = {
    "wordmark": "MERIDIAN",
    "legal": "Cold brew. Drink responsibly.",
    "palette": ["#1A2B3C", "#EDEEF0"],
}

LOCALES_BODY = [
    {"code": "en-US", "language": "English", "direction": "ltr", "headline": "Wake up slower.", "legal": "x"},
    {"code": "de-DE", "language": "German", "direction": "ltr", "headline": "Wach langsamer auf.", "legal": "y"},
]

FORMATS_BODY = [
    {"id": "1:1", "width_ratio": 1, "height_ratio": 1},
    {"id": "9:16", "width_ratio": 9, "height_ratio": 16},
]

SCENE = SceneSpec(
    subject="cold brew bottle on a stone counter",
    setting="minimalist kitchen, morning light",
    time_of_day="dawn",
    palette=["#1A2B3C", "#EDEEF0"],
    mood="calm, unhurried",
    lens_mm=50,
    lighting="soft",
    excludes=["text", "people"],
    object_refs=[ObjectRef(asset_id="ast_bottle01", label="product bottle")],
)


@pytest.fixture(autouse=True)
def isolated_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(api_mod, "_cache", SceneCache(root=tmp_path / "scenes"))
    api_mod._CAMPAIGNS.clear()
    api_mod._CONNECTIONS.clear()
    yield


@pytest.fixture
def client():
    return TestClient(api_mod.app)


def _create_campaign(client) -> str:
    r = client.post(
        "/campaigns",
        json={
            "brand": BRAND_BODY,
            "available_locales": LOCALES_BODY,
            "available_formats": FORMATS_BODY,
        },
    )
    assert r.status_code == 200
    return r.json()["id"]


def _fake_png_bytes(color=(20, 30, 40)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), color=color).save(buf, format="PNG")
    return buf.getvalue()


class FakeGenerator:
    def __init__(self) -> None:
        self.calls = 0

    async def __call__(self, prompt_text: str, *, role: str = "scene") -> ImageResult:
        self.calls += 1
        return ImageResult(
            image_bytes=_fake_png_bytes((self.calls * 10 % 256, 30, 40)),
            mime_type="image/png",
            usage=Usage(prompt_tokens=40, candidates_tokens=1120, total_tokens=1160),
            model_id="gemini-3.1-flash-lite-image",
            response_id=f"resp-{self.calls}",
            interaction_id=f"ixn-{self.calls}",
        )


def test_create_and_fetch_campaign(client):
    campaign_id = _create_campaign(client)
    r = client.get(f"/campaigns/{campaign_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == campaign_id
    assert body["plan"] is None
    assert body["cells"] == 0


def test_get_unknown_campaign_is_404(client):
    r = client.get("/campaigns/does-not-exist")
    assert r.status_code == 404


async def test_plan_endpoint_never_lets_the_model_author_locale_copy(client, monkeypatch):
    campaign_id = _create_campaign(client)

    async def fake_request_plan(intent, *, available_locales, available_formats, role="plan"):
        return PlanRequest(scene=SCENE, locale_codes=["de-DE"], format_ids=["9:16"])

    import engine.planner as planner_mod

    monkeypatch.setattr(planner_mod, "request_plan", fake_request_plan)

    r = client.post(f"/campaigns/{campaign_id}/plan", json={"intent": "launch in Germany"})
    assert r.status_code == 200
    body = r.json()
    assert [l["code"] for l in body["locales"]] == ["de-DE"]
    assert body["locales"][0]["headline"] == "Wach langsamer auf."


async def test_full_pipeline_fan_out_then_flag_then_repair_then_adopt(client, monkeypatch):
    import engine.planner as planner_mod

    async def fake_request_plan(intent, *, available_locales, available_formats, role="plan"):
        return PlanRequest(
            scene=SCENE, locale_codes=["en-US", "de-DE"], format_ids=["1:1", "9:16"]
        )

    monkeypatch.setattr(planner_mod, "request_plan", fake_request_plan)

    fake_gen = FakeGenerator()
    monkeypatch.setattr(executor_mod, "generate_image", fake_gen)
    monkeypatch.setattr(repair_mod, "generate_image", fake_gen)

    campaign_id = _create_campaign(client)

    r = client.post(f"/campaigns/{campaign_id}/plan", json={"intent": "launch globally"})
    assert r.status_code == 200

    r = client.post(f"/campaigns/{campaign_id}/fan-out", json={"max_concurrent": 4})
    assert r.status_code == 200
    fan_out_body = r.json()
    assert fan_out_body["cells"] == 4
    assert fan_out_body["api_calls"] == 4
    assert fake_gen.calls == 4

    r2 = client.post(f"/campaigns/{campaign_id}/fan-out", json={"max_concurrent": 4})
    assert r2.json()["api_calls"] == 0
    assert r2.json()["cache_hits"] == 4
    assert fake_gen.calls == 4

    r = client.get(f"/campaigns/{campaign_id}/cells/en-US/1:1/image")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    served_image = Image.open(io.BytesIO(r.content))
    assert served_image.size == (64, 64)

    r = client.get(f"/campaigns/{campaign_id}/cells/zz-ZZ/1:1/image")
    assert r.status_code == 404

    async def fake_critique_montage(cells, *, role="critic"):
        target = next(c for c in cells if c.cell_id == "de-DE|9:16")
        return [
            Finding(
                severity="critical",
                tier="vision",
                code="occlusion",
                message="Product mostly hidden.",
                locale_code=target.locale_code,
                format_id=target.format_id,
                fix_hint="Increase object-reference weight.",
            )
        ]

    monkeypatch.setattr(api_mod, "critique_montage", fake_critique_montage)

    r = client.post(f"/campaigns/{campaign_id}/critique/vision", json={})
    assert r.status_code == 200
    findings = r.json()
    assert len(findings) == 1
    assert findings[0]["locale_code"] == "de-DE"
    assert findings[0]["code"] == "occlusion"

    summary = client.get(f"/campaigns/{campaign_id}").json()
    assert summary["flagged_cells"] == 1

    calls_before_repair = fake_gen.calls
    r = client.post(
        f"/campaigns/{campaign_id}/repair",
        json={"locale_code": "de-DE", "format_id": "9:16", "variants": 2},
    )
    assert r.status_code == 200
    repair_body = r.json()
    assert repair_body["needs_regeneration"] is True
    assert len(repair_body["candidates"]) == 2
    assert fake_gen.calls == calls_before_repair + 2

    candidate_id = repair_body["candidates"][0]["id"]

    r = client.get(f"/drafts/{candidate_id}/image")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"

    r = client.get("/drafts/not-a-real-draft-id/image")
    assert r.status_code == 404

    r = client.post(
        f"/campaigns/{campaign_id}/repair/adopt",
        json={"locale_code": "de-DE", "format_id": "9:16", "draft_id": candidate_id},
    )
    assert r.status_code == 200
    assert r.json()["active_draft"] == candidate_id

    summary = client.get(f"/campaigns/{campaign_id}").json()
    assert summary["flagged_cells"] == 0


def test_repair_on_unknown_cell_is_404(client):
    campaign_id = _create_campaign(client)
    r = client.post(
        f"/campaigns/{campaign_id}/repair",
        json={"locale_code": "zz-ZZ", "format_id": "1:1"},
    )
    assert r.status_code == 404


def test_websocket_receives_broadcast_on_fan_out(client, monkeypatch):
    import engine.planner as planner_mod

    async def fake_request_plan(intent, *, available_locales, available_formats, role="plan"):
        return PlanRequest(scene=SCENE, locale_codes=["en-US"], format_ids=["1:1"])

    monkeypatch.setattr(planner_mod, "request_plan", fake_request_plan)

    fake_gen = FakeGenerator()
    monkeypatch.setattr(executor_mod, "generate_image", fake_gen)

    campaign_id = _create_campaign(client)
    client.post(f"/campaigns/{campaign_id}/plan", json={"intent": "launch"})

    with client.websocket_connect(f"/campaigns/{campaign_id}/live") as ws:
        client.post(f"/campaigns/{campaign_id}/fan-out", json={"max_concurrent": 2})
        event = ws.receive_json()
        assert event["type"] == "fan_out"
        assert event["api_calls"] == 1

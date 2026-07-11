import pytest

from engine.ir import BrandSpec, ObjectRef, SceneSpec
from engine.planner import PlanRequest, plan, request_plan, resolve_plan
from tests.fixtures.formats import FORMATS
from tests.fixtures.locales import LOCALES

BRAND = BrandSpec(
    wordmark="MERIDIAN",
    legal="Cold brew. Drink responsibly.",
    palette=["#1A2B3C", "#EDEEF0"],
)

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


def test_resolve_plan_assembles_full_plan_from_catalog():
    request = PlanRequest(
        scene=SCENE,
        locale_codes=["de-DE", "ar-EG"],
        format_ids=["9:16", "1:1"],
    )
    result = resolve_plan(request, BRAND, LOCALES, FORMATS)

    assert result.brand == BRAND
    assert result.scene == SCENE
    assert [l.code for l in result.locales] == ["de-DE", "ar-EG"]
    assert [f.id for f in result.formats] == ["9:16", "1:1"]


def test_resolve_plan_rejects_locale_outside_catalog():
    request = PlanRequest(
        scene=SCENE,
        locale_codes=["de-DE", "zz-ZZ"],
        format_ids=["1:1"],
    )
    with pytest.raises(ValueError, match="zz-ZZ"):
        resolve_plan(request, BRAND, LOCALES, FORMATS)


def test_resolve_plan_rejects_format_outside_catalog():
    request = PlanRequest(
        scene=SCENE,
        locale_codes=["de-DE"],
        format_ids=["1:1", "999:1"],
    )
    with pytest.raises(ValueError, match="999:1"):
        resolve_plan(request, BRAND, LOCALES, FORMATS)


def test_plan_request_rejects_empty_selections():
    with pytest.raises(Exception):
        PlanRequest(scene=SCENE, locale_codes=[], format_ids=["1:1"])
    with pytest.raises(Exception):
        PlanRequest(scene=SCENE, locale_codes=["de-DE"], format_ids=[])


class _FakeModels:
    def __init__(self, response):
        self._response = response
        self.last_call = None

    async def generate_content(self, *, model, contents, config):
        self.last_call = {"model": model, "contents": contents, "config": config}
        return self._response


class _FakeAio:
    def __init__(self, response):
        self.models = _FakeModels(response)


class _FakeClient:
    def __init__(self, response):
        self.aio = _FakeAio(response)


class _FakeResponse:
    def __init__(self, parsed):
        self.parsed = parsed
        self.text = parsed.model_dump_json() if parsed is not None else "null"


async def test_request_plan_uses_the_planner_model_and_returns_parsed_request(monkeypatch):
    expected = PlanRequest(scene=SCENE, locale_codes=["de-DE"], format_ids=["9:16"])
    fake_client = _FakeClient(_FakeResponse(expected))
    monkeypatch.setattr("engine.planner.get_client", lambda: fake_client)

    result = await request_plan(
        "launch cold brew across Germany, story format",
        available_locales=LOCALES,
        available_formats=FORMATS,
    )

    assert result == expected
    assert fake_client.aio.models.last_call["model"] == "gemini-3-flash"
    assert fake_client.aio.models.last_call["config"].response_schema is PlanRequest


async def test_request_plan_falls_back_to_manual_parse_when_sdk_parsed_is_none(monkeypatch):
    expected = PlanRequest(scene=SCENE, locale_codes=["ar-EG"], format_ids=["1:1"])
    fake_client = _FakeClient(_FakeResponse(None))
    fake_client.aio.models._response.text = expected.model_dump_json()
    monkeypatch.setattr("engine.planner.get_client", lambda: fake_client)

    result = await request_plan(
        "launch in Egypt",
        available_locales=LOCALES,
        available_formats=FORMATS,
    )

    assert result == expected


async def test_plan_end_to_end_wires_request_and_resolve(monkeypatch):
    expected_request = PlanRequest(
        scene=SCENE, locale_codes=["de-DE", "hi-IN"], format_ids=["9:16", "16:9"]
    )
    fake_client = _FakeClient(_FakeResponse(expected_request))
    monkeypatch.setattr("engine.planner.get_client", lambda: fake_client)

    result = await plan(
        "launch cold brew in Germany and India",
        brand=BRAND,
        available_locales=LOCALES,
        available_formats=FORMATS,
    )

    assert [l.code for l in result.locales] == ["de-DE", "hi-IN"]
    assert [f.id for f in result.formats] == ["9:16", "16:9"]
    assert result.brand == BRAND

import io

import pytest
from PIL import Image

from engine.critic.vision import (
    MontageCell,
    VisionCriticResponse,
    VisionFindingItem,
    build_montage,
    critique_montage,
)


def _fake_png(color: tuple[int, int, int]) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), color=color).save(buf, format="PNG")
    return buf.getvalue()


def _cells(n: int) -> list[MontageCell]:
    return [
        MontageCell(
            cell_id=f"loc{i}|1:1",
            locale_code=f"loc{i}",
            format_id="1:1",
            image_bytes=_fake_png((i * 20 % 256, 40, 60)),
        )
        for i in range(n)
    ]


def test_build_montage_raises_on_empty_input():
    with pytest.raises(ValueError):
        build_montage([])


def test_build_montage_produces_a_decodable_image_sized_by_grid():
    cells = _cells(4)
    montage_bytes = build_montage(cells, thumb_size=100, columns=2)
    image = Image.open(io.BytesIO(montage_bytes))
    assert image.format == "PNG"
    assert image.size == (200, 240)


def test_build_montage_infers_square_ish_grid_when_columns_not_given():
    cells = _cells(9)
    montage_bytes = build_montage(cells, thumb_size=50)
    image = Image.open(io.BytesIO(montage_bytes))
    assert image.size == (150, 210)


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


async def test_critique_montage_maps_findings_back_to_locale_and_format(monkeypatch):
    cells = _cells(3)
    fake_response_body = VisionCriticResponse(
        findings=[
            VisionFindingItem(
                cell_id="loc1|1:1",
                severity="critical",
                code="occlusion",
                message="Product mostly hidden behind generated foliage.",
                fix_hint="Re-run with a higher object-reference weight.",
            )
        ]
    )
    fake_client = _FakeClient(_FakeResponse(fake_response_body))
    monkeypatch.setattr("engine.critic.vision.get_client", lambda: fake_client)

    findings = await critique_montage(cells)

    assert len(findings) == 1
    finding = findings[0]
    assert finding.tier == "vision"
    assert finding.code == "occlusion"
    assert finding.locale_code == "loc1"
    assert finding.format_id == "1:1"
    assert fake_client.aio.models.last_call["model"] == "gemini-3-flash"
    assert fake_client.aio.models.last_call["config"].response_schema is VisionCriticResponse


async def test_critique_montage_returns_empty_list_when_all_clean(monkeypatch):
    cells = _cells(3)
    fake_client = _FakeClient(_FakeResponse(VisionCriticResponse(findings=[])))
    monkeypatch.setattr("engine.critic.vision.get_client", lambda: fake_client)

    findings = await critique_montage(cells)

    assert findings == []


async def test_critique_montage_drops_findings_for_unknown_cell_ids(monkeypatch):
    cells = _cells(2)
    fake_response_body = VisionCriticResponse(
        findings=[
            VisionFindingItem(
                cell_id="does-not-exist|9:16",
                severity="warning",
                code="uncanny",
                message="hallucinated cell reference",
            ),
            VisionFindingItem(
                cell_id="loc0|1:1",
                severity="warning",
                code="uncanny",
                message="real finding on a real cell",
            ),
        ]
    )
    fake_client = _FakeClient(_FakeResponse(fake_response_body))
    monkeypatch.setattr("engine.critic.vision.get_client", lambda: fake_client)

    findings = await critique_montage(cells)

    assert len(findings) == 1
    assert findings[0].locale_code == "loc0"

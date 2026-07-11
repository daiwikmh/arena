from __future__ import annotations

import hashlib
import io
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from PIL import Image
from pycrdt.websocket import ASGIServer, WebsocketServer
from pydantic import BaseModel

from engine.cache import SceneCache
from engine.critic.typography import TTFontMetrics, TextLayout, run_deterministic_critic
from engine.critic.vision import MontageCell, critique_montage
from engine.executor import FanOutReport, FanOutResult, fan_out
from engine.ir import BrandSpec, Draft, Finding, FormatSpec, LocaleSpec, LocalizationPlan
from engine.models import ModelRole
from engine.planner import plan as run_planner
from engine.prompt import DEFAULT_TEMPLATE_VERSION, compile_prompt
from engine.repair import RepairPlan, plan_repair, repair_draft
from engine.live_api import router as live_router
from engine.shots_api import router as shots_router

_canvas_sync = WebsocketServer(auto_clean_rooms=False)


@asynccontextmanager
async def _lifespan(app: FastAPI):
    async with _canvas_sync:
        yield


app = FastAPI(title="Presscheck engine", lifespan=_lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+):(4321|4322)|https://[a-zA-Z0-9.-]+\.trycloudflare\.com",
    allow_methods=["*"],
    allow_headers=["*"],
)

_cache = SceneCache()

app.mount("/sync", ASGIServer(_canvas_sync))
app.include_router(shots_router)
app.include_router(live_router)


def _cell_key(locale_code: str, format_id: str) -> str:
    return f"{locale_code}|{format_id}"


@dataclass
class CampaignState:
    id: str
    brand: BrandSpec
    available_locales: list[LocaleSpec]
    available_formats: list[FormatSpec]
    template_version: str = DEFAULT_TEMPLATE_VERSION
    plan: LocalizationPlan | None = None
    drafts: dict[str, Draft] = field(default_factory=dict)
    findings: dict[str, list[Finding]] = field(default_factory=dict)
    repair_candidates: dict[str, list[Draft]] = field(default_factory=dict)
    last_fan_out: FanOutReport | None = None


_CAMPAIGNS: dict[str, CampaignState] = {}
_CONNECTIONS: dict[str, list[WebSocket]] = {}


async def _broadcast(campaign_id: str, event: dict) -> None:
    for ws in list(_CONNECTIONS.get(campaign_id, [])):
        try:
            await ws.send_json(event)
        except Exception:  # noqa: BLE001 -- a dead socket must not break the broadcast loop
            pass


def _get_campaign(campaign_id: str) -> CampaignState:
    campaign = _CAMPAIGNS.get(campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail=f"no campaign {campaign_id!r}")
    return campaign


def _locale_and_format(campaign: CampaignState, locale_code: str, format_id: str):
    if campaign.plan is None:
        raise HTTPException(status_code=400, detail="campaign has no plan yet")
    locale = next((l for l in campaign.plan.locales if l.code == locale_code), None)
    fmt = next((f for f in campaign.plan.formats if f.id == format_id), None)
    if locale is None or fmt is None:
        raise HTTPException(
            status_code=404,
            detail=f"cell {locale_code}|{format_id} is not part of this campaign's plan",
        )
    return locale, fmt


class CreateCampaignRequest(BaseModel):
    brand: BrandSpec
    available_locales: list[LocaleSpec]
    available_formats: list[FormatSpec]


class CreateCampaignResponse(BaseModel):
    id: str


@app.post("/campaigns", response_model=CreateCampaignResponse)
def create_campaign(body: CreateCampaignRequest) -> CreateCampaignResponse:
    campaign_id = uuid.uuid4().hex
    _CAMPAIGNS[campaign_id] = CampaignState(
        id=campaign_id,
        brand=body.brand,
        available_locales=body.available_locales,
        available_formats=body.available_formats,
    )
    return CreateCampaignResponse(id=campaign_id)


class CampaignSummary(BaseModel):
    id: str
    plan: LocalizationPlan | None
    cells: int
    flagged_cells: int
    last_fan_out_api_calls: int | None
    last_fan_out_cost_usd: float | None


@app.get("/campaigns/{campaign_id}", response_model=CampaignSummary)
def get_campaign(campaign_id: str) -> CampaignSummary:
    campaign = _get_campaign(campaign_id)
    flagged = sum(1 for findings in campaign.findings.values() if findings)
    return CampaignSummary(
        id=campaign.id,
        plan=campaign.plan,
        cells=len(campaign.drafts),
        flagged_cells=flagged,
        last_fan_out_api_calls=(
            campaign.last_fan_out.api_calls if campaign.last_fan_out else None
        ),
        last_fan_out_cost_usd=(
            campaign.last_fan_out.total_cost_usd if campaign.last_fan_out else None
        ),
    )


class PlanRequestBody(BaseModel):
    intent: str


@app.post("/campaigns/{campaign_id}/plan", response_model=LocalizationPlan)
async def create_plan(campaign_id: str, body: PlanRequestBody) -> LocalizationPlan:
    campaign = _get_campaign(campaign_id)
    campaign.plan = await run_planner(
        body.intent,
        brand=campaign.brand,
        available_locales=campaign.available_locales,
        available_formats=campaign.available_formats,
    )
    await _broadcast(campaign_id, {"type": "plan", "plan": campaign.plan.model_dump(mode="json")})
    return campaign.plan


def _prompt_hash_for(result: FanOutResult) -> str:
    return hashlib.sha256(result.resolved.model_dump_json().encode("utf-8")).hexdigest()[:16]


def _draft_from_fan_out_result(result: FanOutResult, template_version: str) -> Draft | None:
    if result.source == "error":
        return None
    return Draft(
        id=result.cache_key,
        prompt_hash=_prompt_hash_for(result),
        template_version=template_version,
        model_id=result.model_id or "",
        image_ref=result.cache_key,
        author="agent",
        interaction_id=result.interaction_id,
        parent=None,
        findings=[],
    )


class FanOutRequestBody(BaseModel):
    max_concurrent: int = 10
    rate_per_minute: float | None = None
    role: ModelRole = "scene"


class FanOutResponse(BaseModel):
    wall_clock_seconds: float
    api_calls: int
    cache_hits: int
    errors: int
    total_cost_usd: float
    cells: int


@app.post("/campaigns/{campaign_id}/fan-out", response_model=FanOutResponse)
async def trigger_fan_out(campaign_id: str, body: FanOutRequestBody) -> FanOutResponse:
    campaign = _get_campaign(campaign_id)
    if campaign.plan is None:
        raise HTTPException(status_code=400, detail="campaign has no plan yet")

    report = await fan_out(
        campaign.plan.scene,
        campaign.plan.locales,
        campaign.plan.formats,
        cache=_cache,
        template_version=campaign.template_version,
        role=body.role,
        max_concurrent=body.max_concurrent,
        rate_per_minute=body.rate_per_minute,
    )
    campaign.last_fan_out = report

    for result in report.results:
        draft = _draft_from_fan_out_result(result, campaign.template_version)
        if draft is None:
            continue
        key = _cell_key(result.resolved.locale_code, result.resolved.format_id)
        campaign.drafts[key] = draft

    await _broadcast(
        campaign_id,
        {
            "type": "fan_out",
            "api_calls": report.api_calls,
            "cache_hits": report.cache_hits,
            "errors": report.errors,
            "total_cost_usd": report.total_cost_usd,
        },
    )

    return FanOutResponse(
        wall_clock_seconds=report.wall_clock_seconds,
        api_calls=report.api_calls,
        cache_hits=report.cache_hits,
        errors=report.errors,
        total_cost_usd=report.total_cost_usd,
        cells=len(report.results),
    )


@app.get("/drafts/{draft_id}/image")
def get_draft_image(draft_id: str) -> Response:
    cached = _cache.get(draft_id)
    if cached is None:
        raise HTTPException(status_code=404, detail=f"no cached image for draft {draft_id!r}")
    return Response(content=cached.image_bytes, media_type=cached.mime_type)


@app.get("/campaigns/{campaign_id}/cells/{locale_code}/{format_id}/image")
def get_cell_image(campaign_id: str, locale_code: str, format_id: str) -> Response:
    campaign = _get_campaign(campaign_id)
    key = _cell_key(locale_code, format_id)
    draft = campaign.drafts.get(key)
    if draft is None:
        raise HTTPException(status_code=404, detail=f"no draft yet for cell {key!r}")
    cached = _cache.get(draft.image_ref)
    if cached is None:
        raise HTTPException(status_code=404, detail=f"draft {draft.id!r} has no cached image")
    return Response(content=cached.image_bytes, media_type=cached.mime_type)


class TypographyCheckItem(BaseModel):
    locale_code: str
    format_id: str
    text: str
    font_path: str
    font_size_px: float
    line_height_px: float
    box_width_px: float
    box_px: tuple[int, int, int, int] | None = None
    text_rgb: tuple[float, float, float] = (255.0, 255.0, 255.0)
    large_text: bool = False


class TypographyCritiqueRequestBody(BaseModel):
    items: list[TypographyCheckItem]


@app.post("/campaigns/{campaign_id}/critique/typography", response_model=list[Finding])
def critique_typography(
    campaign_id: str, body: TypographyCritiqueRequestBody
) -> list[Finding]:
    campaign = _get_campaign(campaign_id)
    all_findings: list[Finding] = []

    for item in body.items:
        try:
            metrics = TTFontMetrics(item.font_path)
        except Exception as exc:  # noqa: BLE001 -- surfaced as a client-facing 422
            raise HTTPException(
                status_code=422, detail=f"could not load font {item.font_path!r}: {exc}"
            ) from exc

        image: Image.Image | None = None
        key = _cell_key(item.locale_code, item.format_id)
        draft = campaign.drafts.get(key)
        if draft is not None and item.box_px is not None:
            cached = _cache.get(draft.image_ref)
            if cached is not None:
                image = Image.open(io.BytesIO(cached.image_bytes))

        layout = TextLayout(
            text=item.text,
            font_size_px=item.font_size_px,
            line_height_px=item.line_height_px,
        )
        findings = run_deterministic_critic(
            layout=layout,
            metrics=metrics,
            box_width_px=item.box_width_px,
            locale_code=item.locale_code,
            format_id=item.format_id,
            image=image,
            box_px=item.box_px,
            text_rgb=item.text_rgb,
            large_text=item.large_text,
        )
        campaign.findings.setdefault(key, [])
        campaign.findings[key] = [
            f for f in campaign.findings[key] if f.tier != "deterministic"
        ] + findings
        all_findings.extend(findings)

    return all_findings


class VisionCritiqueRequestBody(BaseModel):
    cell_keys: list[str] | None = None


@app.post("/campaigns/{campaign_id}/critique/vision", response_model=list[Finding])
async def critique_vision(
    campaign_id: str, body: VisionCritiqueRequestBody
) -> list[Finding]:
    campaign = _get_campaign(campaign_id)
    target_keys = body.cell_keys or list(campaign.drafts.keys())

    cells: list[MontageCell] = []
    for key in target_keys:
        draft = campaign.drafts.get(key)
        if draft is None:
            continue
        cached = _cache.get(draft.image_ref)
        if cached is None:
            continue
        locale_code, format_id = key.split("|", 1)
        cells.append(
            MontageCell(
                cell_id=key,
                locale_code=locale_code,
                format_id=format_id,
                image_bytes=cached.image_bytes,
            )
        )

    if not cells:
        return []

    findings = await critique_montage(cells)
    for finding in findings:
        key = _cell_key(finding.locale_code, finding.format_id)
        campaign.findings.setdefault(key, [])
        campaign.findings[key].append(finding)

    await _broadcast(
        campaign_id, {"type": "vision_critique", "findings": len(findings)}
    )
    return findings


class RepairRequestBody(BaseModel):
    locale_code: str
    format_id: str
    repair_note: str = ""
    variants: int = 3


class RepairResponse(BaseModel):
    layout_fixes: list[dict]
    needs_regeneration: bool
    candidates: list[Draft]


@app.post("/campaigns/{campaign_id}/repair", response_model=RepairResponse)
async def request_repair(campaign_id: str, body: RepairRequestBody) -> RepairResponse:
    campaign = _get_campaign(campaign_id)
    key = _cell_key(body.locale_code, body.format_id)

    parent_draft = campaign.drafts.get(key)
    if parent_draft is None:
        raise HTTPException(status_code=404, detail=f"no draft yet for cell {key!r}")

    findings = campaign.findings.get(key, [])
    repair_plan: RepairPlan = plan_repair(findings)

    candidates: list[Draft] = []
    if repair_plan.needs_regeneration:
        locale, fmt = _locale_and_format(campaign, body.locale_code, body.format_id)
        compiled = compile_prompt(
            campaign.plan.scene, locale, fmt, template_version=campaign.template_version
        )
        candidates = await repair_draft(
            parent_draft,
            compiled,
            findings,
            cache=_cache,
            template_version=campaign.template_version,
            variants=body.variants,
            repair_note=body.repair_note,
        )
        campaign.repair_candidates[key] = candidates

    await _broadcast(
        campaign_id,
        {"type": "repair", "cell": key, "candidates": len(candidates)},
    )

    return RepairResponse(
        layout_fixes=[
            {
                "code": f.code,
                "action": f.action,
                "locale_code": f.locale_code,
                "format_id": f.format_id,
            }
            for f in repair_plan.layout_fixes
        ],
        needs_regeneration=repair_plan.needs_regeneration,
        candidates=candidates,
    )


class AdoptRepairRequestBody(BaseModel):
    locale_code: str
    format_id: str
    draft_id: str


@app.post("/campaigns/{campaign_id}/repair/adopt")
async def adopt_repair(campaign_id: str, body: AdoptRepairRequestBody) -> dict:
    campaign = _get_campaign(campaign_id)
    key = _cell_key(body.locale_code, body.format_id)
    candidates = campaign.repair_candidates.get(key, [])
    chosen = next((d for d in candidates if d.id == body.draft_id), None)
    if chosen is None:
        raise HTTPException(
            status_code=404, detail=f"draft {body.draft_id!r} is not a candidate for {key!r}"
        )
    campaign.drafts[key] = chosen
    campaign.findings[key] = []
    await _broadcast(campaign_id, {"type": "adopt", "cell": key, "draft_id": chosen.id})
    return {"cell": key, "active_draft": chosen.id}


@app.websocket("/campaigns/{campaign_id}/live")
async def campaign_live(websocket: WebSocket, campaign_id: str) -> None:
    await websocket.accept()
    _CONNECTIONS.setdefault(campaign_id, []).append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        _CONNECTIONS[campaign_id].remove(websocket)

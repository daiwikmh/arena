from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from engine.cache import SceneCache
from engine.executor import PRICE_PER_M_OUTPUT_TOKENS
from engine.ir import Draft, ShotSpec
from engine.shots import (
    DEFAULT_CLIP_TEMPLATE_VERSION,
    DEFAULT_SHOT_TEMPLATE_VERSION,
    build_clip_draft,
    generate_clip_for_shot,
    generate_keyframes,
)

router = APIRouter()

_cache = SceneCache()

_MAX_ERROR_LEN = 220

PRICE_PER_M_VIDEO_OUTPUT_TOKENS = 17.50


def _summarize_error(raw: str) -> str:
    if len(raw) <= _MAX_ERROR_LEN:
        return raw
    return raw[:_MAX_ERROR_LEN].rstrip() + "…"


@dataclass
class ShotState:
    id: str
    spec: ShotSpec
    draft: Draft | None = None
    clip_draft: Draft | None = None


@dataclass
class ProjectState:
    id: str
    shots: dict[str, ShotState] = field(default_factory=dict)
    shot_order: list[str] = field(default_factory=list)


_PROJECTS: dict[str, ProjectState] = {}


def _get_or_create_project(project_id: str) -> ProjectState:
    return _PROJECTS.setdefault(project_id, ProjectState(id=project_id))


def _get_shot(project: ProjectState, shot_id: str) -> ShotState:
    shot = project.shots.get(shot_id)
    if shot is None:
        raise HTTPException(status_code=404, detail=f"no shot {shot_id!r} in project {project.id!r}")
    return shot


class ShotSummary(BaseModel):
    id: str
    spec: ShotSpec
    has_keyframe: bool
    draft_id: str | None
    has_clip: bool
    clip_draft_id: str | None


class ProjectSummary(BaseModel):
    id: str
    shot_ids: list[str]
    shots: list[ShotSummary]


def _shot_summary(shot: ShotState) -> ShotSummary:
    return ShotSummary(
        id=shot.id,
        spec=shot.spec,
        has_keyframe=shot.draft is not None,
        draft_id=shot.draft.id if shot.draft else None,
        has_clip=shot.clip_draft is not None,
        clip_draft_id=shot.clip_draft.id if shot.clip_draft else None,
    )


@router.get("/projects/{project_id}", response_model=ProjectSummary)
def get_project(project_id: str) -> ProjectSummary:
    project = _get_or_create_project(project_id)
    return ProjectSummary(
        id=project.id,
        shot_ids=list(project.shot_order),
        shots=[_shot_summary(project.shots[sid]) for sid in project.shot_order],
    )


class CreateShotResponse(BaseModel):
    shot_id: str
    spec: ShotSpec


@router.post("/projects/{project_id}/shots", response_model=CreateShotResponse)
def create_shot(project_id: str, spec: ShotSpec) -> CreateShotResponse:
    project = _get_or_create_project(project_id)
    shot_id = uuid4().hex
    project.shots[shot_id] = ShotState(id=shot_id, spec=spec)
    project.shot_order.append(shot_id)
    return CreateShotResponse(shot_id=shot_id, spec=spec)


class KeyframeResponse(BaseModel):
    shot_id: str
    status: Literal["generated", "cached", "error"]
    draft_id: str | None
    error: str | None
    cost_usd: float


def _prompt_hash_for(shot: ShotSpec) -> str:
    return hashlib.sha256(shot.model_dump_json().encode("utf-8")).hexdigest()[:16]


@router.post("/projects/{project_id}/shots/{shot_id}/keyframe", response_model=KeyframeResponse)
async def generate_shot_keyframe(project_id: str, shot_id: str) -> KeyframeResponse:
    project = _get_or_create_project(project_id)
    shot_state = _get_shot(project, shot_id)

    report = await generate_keyframes([shot_state.spec], cache=_cache)
    result = report.results[0]

    if result.source == "error":
        return KeyframeResponse(
            shot_id=shot_id,
            status="error",
            draft_id=None,
            error=_summarize_error(result.error or "unknown error"),
            cost_usd=0.0,
        )

    draft = Draft(
        id=result.cache_key,
        prompt_hash=_prompt_hash_for(shot_state.spec),
        template_version=DEFAULT_SHOT_TEMPLATE_VERSION,
        model_id=result.model_id or "",
        image_ref=result.cache_key,
        author="agent",
        interaction_id=result.interaction_id,
        parent=None,
        findings=[],
    )
    shot_state.draft = draft

    cost = (
        result.usage.candidates_tokens * PRICE_PER_M_OUTPUT_TOKENS / 1_000_000
        if result.usage is not None
        else 0.0
    )
    return KeyframeResponse(
        shot_id=shot_id,
        status="generated" if result.source == "generated" else "cached",
        draft_id=draft.id,
        error=None,
        cost_usd=cost,
    )


@router.get("/projects/{project_id}/shots/{shot_id}/keyframe/image")
def get_shot_keyframe_image(project_id: str, shot_id: str) -> Response:
    project = _get_or_create_project(project_id)
    shot_state = _get_shot(project, shot_id)
    if shot_state.draft is None:
        raise HTTPException(status_code=404, detail=f"shot {shot_id!r} has no keyframe yet")
    cached = _cache.get(shot_state.draft.image_ref)
    if cached is None:
        raise HTTPException(status_code=404, detail=f"draft {shot_state.draft.id!r} has no cached image")
    return Response(content=cached.image_bytes, media_type=cached.mime_type)


class ClipResponse(BaseModel):
    shot_id: str
    status: Literal["generated", "cached", "error"]
    draft_id: str | None
    error: str | None
    cost_usd: float
    delivery: Literal["bytes", "uri", "none"]
    video_uri: str | None


@router.post("/projects/{project_id}/shots/{shot_id}/clip", response_model=ClipResponse)
async def generate_shot_clip(project_id: str, shot_id: str) -> ClipResponse:
    project = _get_or_create_project(project_id)
    shot_state = _get_shot(project, shot_id)

    if shot_state.draft is None:
        raise HTTPException(
            status_code=400, detail=f"shot {shot_id!r} has no approved keyframe to animate"
        )

    cached_keyframe = _cache.get(shot_state.draft.image_ref)
    if cached_keyframe is None:
        raise HTTPException(
            status_code=404, detail=f"keyframe draft {shot_state.draft.id!r} has no cached image"
        )

    result = await generate_clip_for_shot(
        shot_state.spec,
        keyframe_bytes=cached_keyframe.image_bytes,
        keyframe_mime_type=cached_keyframe.mime_type,
        keyframe_draft_id=shot_state.draft.id,
        cache=_cache,
    )

    if result.source == "error":
        return ClipResponse(
            shot_id=shot_id,
            status="error",
            draft_id=None,
            error=_summarize_error(result.error or "unknown error"),
            cost_usd=0.0,
            delivery="none",
            video_uri=None,
        )

    draft = build_clip_draft(result, shot_state.draft.id, DEFAULT_CLIP_TEMPLATE_VERSION)
    shot_state.clip_draft = draft

    cost = 0.0
    if result.source == "generated":
        tokens_per_sec = 5792
        cost = shot_state.spec.duration_sec * tokens_per_sec * PRICE_PER_M_VIDEO_OUTPUT_TOKENS / 1_000_000

    return ClipResponse(
        shot_id=shot_id,
        status="generated" if result.source == "generated" else "cached",
        draft_id=draft.id,
        error=None,
        cost_usd=cost,
        delivery="bytes" if result.video_bytes is not None else ("uri" if result.video_uri else "none"),
        video_uri=result.video_uri,
    )


@router.get("/projects/{project_id}/shots/{shot_id}/clip/video")
def get_shot_clip_video(project_id: str, shot_id: str) -> Response:
    project = _get_or_create_project(project_id)
    shot_state = _get_shot(project, shot_id)
    if shot_state.clip_draft is None:
        raise HTTPException(status_code=404, detail=f"shot {shot_id!r} has no clip yet")
    cached = _cache.get(shot_state.clip_draft.image_ref)
    if cached is None:
        raise HTTPException(
            status_code=409,
            detail=(
                f"clip draft {shot_state.clip_draft.id!r} was generated with a URI delivery "
                f"that was never fetched into the local cache; this path is not implemented yet"
            ),
        )
    return Response(content=cached.image_bytes, media_type=cached.mime_type)

from __future__ import annotations

import base64
import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Literal

from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

ModelRole = Literal[
    "scene", "scene_style_locked", "hero", "plan", "critic", "repair_hard", "animate", "live"
]

MODEL_ROUTING: dict[ModelRole, str] = {
    "scene": "gemini-3.1-flash-lite-image",
    "scene_style_locked": "gemini-3.1-flash-image",
    "hero": "gemini-3-pro-image",
    "plan": "gemini-3-flash",
    "critic": "gemini-3-flash",
    "repair_hard": "gemini-3.5-flash",
    "animate": "gemini-omni-flash-preview",
    "live": "gemini-3.1-flash-live-preview",
}

VideoTask = Literal["text_to_video", "image_to_video", "reference_to_video", "edit"]


def model_for(role: ModelRole) -> str:
    return MODEL_ROUTING[role]


@lru_cache(maxsize=1)
def get_client() -> genai.Client:
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY is not set")
    return genai.Client(api_key=api_key)


@dataclass(frozen=True)
class Usage:
    prompt_tokens: int
    candidates_tokens: int
    total_tokens: int


@dataclass(frozen=True)
class ImageReference:
    data: bytes
    mime_type: str


@dataclass(frozen=True)
class ImageResult:
    image_bytes: bytes
    mime_type: str
    usage: Usage
    model_id: str
    response_id: str | None
    interaction_id: str | None


@dataclass(frozen=True)
class ClipResult:
    video_bytes: bytes | None
    video_uri: str | None
    mime_type: str
    usage: Usage | None
    model_id: str
    interaction_id: str | None


def _extract_image_part(response: types.GenerateContentResponse) -> tuple[bytes, str]:
    candidates = response.candidates or []
    if not candidates:
        raise RuntimeError("no candidates in image generation response")
    parts = candidates[0].content.parts if candidates[0].content else None
    if not parts:
        raise RuntimeError("no content parts in image generation response")
    for part in parts:
        inline = getattr(part, "inline_data", None)
        if inline is not None and inline.data:
            return inline.data, inline.mime_type or "image/png"
    raise RuntimeError("no inline image data in response parts")


def _usage_from_response(response: types.GenerateContentResponse) -> Usage:
    meta = response.usage_metadata
    if meta is None:
        raise RuntimeError("response carried no usage_metadata")
    return Usage(
        prompt_tokens=meta.prompt_token_count or 0,
        candidates_tokens=meta.candidates_token_count or 0,
        total_tokens=meta.total_token_count or 0,
    )


async def generate_image(
    prompt_text: str,
    *,
    role: ModelRole = "scene",
    refs: list[ImageReference] | None = None,
    aspect_ratio: str | None = None,
    image_size: str = "1K",
    thinking_level: Literal["minimal", "high"] = "minimal",
) -> ImageResult:
    client = get_client()
    model_id = model_for(role)

    contents: list[types.PartUnionDict] = []
    for ref in refs or []:
        contents.append(types.Part.from_bytes(data=ref.data, mime_type=ref.mime_type))
    contents.append(prompt_text)

    image_config = types.ImageConfig(image_size=image_size)
    if aspect_ratio is not None:
        image_config.aspect_ratio = aspect_ratio

    config = types.GenerateContentConfig(
        response_modalities=["IMAGE"],
        image_config=image_config,
        thinking_config=types.ThinkingConfig(thinking_level=thinking_level),
    )

    response = await client.aio.models.generate_content(
        model=model_id,
        contents=contents,
        config=config,
    )

    image_bytes, mime_type = _extract_image_part(response)
    usage = _usage_from_response(response)

    return ImageResult(
        image_bytes=image_bytes,
        mime_type=mime_type,
        usage=usage,
        model_id=model_id,
        response_id=response.response_id,
        interaction_id=getattr(response, "interaction_id", None),
    )


def _extract_video_content(interaction) -> tuple[bytes | None, str | None, str]:
    for step in interaction.steps or []:
        if getattr(step, "type", None) != "model_output":
            continue
        for content in step.content or []:
            if getattr(content, "type", None) != "video":
                continue
            mime_type = content.mime_type or "video/mp4"
            if content.data:
                return base64.b64decode(content.data), None, mime_type
            if content.uri:
                return None, content.uri, mime_type
    raise RuntimeError("no video content in interaction steps")


def _clip_usage_from_interaction(interaction) -> Usage | None:
    usage = interaction.usage
    if usage is None:
        return None
    return Usage(
        prompt_tokens=getattr(usage, "prompt_token_count", 0) or 0,
        candidates_tokens=getattr(usage, "candidates_token_count", 0) or 0,
        total_tokens=getattr(usage, "total_token_count", 0) or 0,
    )


async def generate_clip(
    prompt_text: str,
    *,
    task: VideoTask = "image_to_video",
    keyframe: ImageReference | None = None,
    aspect_ratio: str | None = None,
    duration_sec: int | None = None,
    previous_interaction_id: str | None = None,
    role: ModelRole = "animate",
) -> ClipResult:
    client = get_client()
    model_id = model_for(role)

    content: list[dict] = []
    if keyframe is not None:
        content.append({"type": "image", "data": keyframe.data, "mime_type": keyframe.mime_type})
    content.append({"type": "text", "text": prompt_text})

    response_format: dict = {"type": "video"}
    if aspect_ratio is not None:
        response_format["aspect_ratio"] = aspect_ratio
    if duration_sec is not None:
        response_format["duration"] = f"{duration_sec}s"

    body: dict = {
        "model": model_id,
        "input": content,
        "generation_config": {"video_config": {"task": task}},
        "response_format": response_format,
    }
    if previous_interaction_id is not None:
        body["previous_interaction_id"] = previous_interaction_id

    interaction = await client.interactions.create(body=body)

    video_bytes, video_uri, mime_type = _extract_video_content(interaction)
    usage = _clip_usage_from_interaction(interaction)

    return ClipResult(
        video_bytes=video_bytes,
        video_uri=video_uri,
        mime_type=mime_type,
        usage=usage,
        model_id=model_id,
        interaction_id=interaction.id or None,
    )

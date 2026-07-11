from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Literal

from google import genai
from google.genai import types

ModelRole = Literal["scene", "scene_style_locked", "hero", "plan", "critic", "repair_hard"]

MODEL_ROUTING: dict[ModelRole, str] = {
    "scene": "gemini-3.1-flash-lite-image",
    "scene_style_locked": "gemini-3.1-flash-image",
    "hero": "gemini-3-pro-image",
    "plan": "gemini-3-flash",
    "critic": "gemini-3-flash",
    "repair_hard": "gemini-3.5-flash",
}


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

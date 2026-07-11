from __future__ import annotations

import io
import math
from dataclasses import dataclass
from typing import Literal

from google.genai import types
from PIL import Image, ImageDraw, ImageFont
from pydantic import Field

from engine.ir import Finding, Frozen
from engine.models import ModelRole, get_client, model_for

SYSTEM_INSTRUCTION = (
    "You are reviewing a montage contact sheet of localized ad proofs. Each "
    "cell is labeled with its cell_id in the format locale_code|format_id, "
    "shown below the thumbnail. Flag ONLY judgment calls a human designer "
    "would need to review: the product is occluded or majority-hidden by the "
    "generated scene, the scene reads as culturally inappropriate or "
    "alienating for its locale, or the image looks uncanny or AI-artifacted "
    "in a way that would embarrass the brand. Do NOT flag text legibility, "
    "contrast, or layout — those are checked separately by a deterministic "
    "system. If a proof is clean, do not mention it. Reference each flagged "
    "proof by its exact cell_id."
)


class VisionFindingItem(Frozen):
    cell_id: str
    severity: Literal["critical", "warning"]
    code: str
    message: str
    fix_hint: str | None = None


class VisionCriticResponse(Frozen):
    findings: list[VisionFindingItem] = Field(default_factory=list)


@dataclass(frozen=True)
class MontageCell:
    cell_id: str
    locale_code: str
    format_id: str
    image_bytes: bytes


def build_montage(
    cells: list[MontageCell], *, thumb_size: int = 220, columns: int | None = None
) -> bytes:
    if not cells:
        raise ValueError("cannot montage zero cells")

    columns = columns or math.ceil(math.sqrt(len(cells)))
    rows = math.ceil(len(cells) / columns)
    label_h = 20
    cell_w = thumb_size
    cell_h = thumb_size + label_h

    canvas = Image.new("RGB", (columns * cell_w, rows * cell_h), color=(24, 24, 24))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()

    for idx, cell in enumerate(cells):
        col, row = idx % columns, idx // columns
        x0, y0 = col * cell_w, row * cell_h
        thumb = Image.open(io.BytesIO(cell.image_bytes)).convert("RGB")
        thumb.thumbnail((thumb_size, thumb_size))
        offset_x = x0 + (thumb_size - thumb.width) // 2
        offset_y = y0 + (thumb_size - thumb.height) // 2
        canvas.paste(thumb, (offset_x, offset_y))
        draw.text((x0 + 4, y0 + thumb_size + 2), cell.cell_id, fill=(255, 255, 255), font=font)

    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    return buf.getvalue()


async def critique_montage(
    cells: list[MontageCell],
    *,
    role: ModelRole = "critic",
) -> list[Finding]:
    montage_bytes = build_montage(cells)
    client = get_client()
    model_id = model_for(role)
    cell_ids = ", ".join(cell.cell_id for cell in cells)
    prompt_text = f"Cells in this montage, left to right, top to bottom: {cell_ids}"

    response = await client.aio.models.generate_content(
        model=model_id,
        contents=[
            types.Part.from_bytes(data=montage_bytes, mime_type="image/png"),
            prompt_text,
        ],
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            response_schema=VisionCriticResponse,
        ),
    )

    parsed = response.parsed
    if not isinstance(parsed, VisionCriticResponse):
        parsed = VisionCriticResponse.model_validate_json(response.text)

    cells_by_id = {cell.cell_id: cell for cell in cells}
    findings: list[Finding] = []
    for item in parsed.findings:
        cell = cells_by_id.get(item.cell_id)
        if cell is None:
            continue
        findings.append(
            Finding(
                severity=item.severity,
                tier="vision",
                code=item.code,
                message=item.message,
                locale_code=cell.locale_code,
                format_id=cell.format_id,
                fix_hint=item.fix_hint,
            )
        )
    return findings

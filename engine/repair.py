from __future__ import annotations

import hashlib
from dataclasses import dataclass

from engine.cache import SceneCache, compute_repair_key
from engine.ir import Draft, Finding
from engine.models import ModelRole, generate_image
from engine.prompt.compile import CompiledPrompt

DEFAULT_REPAIR_VARIANTS = 3

REPAIRABLE_WITHOUT_REGENERATION = {"text_overflow", "glyph_clipping"}

LAYOUT_FIX_ACTIONS: dict[str, str] = {
    "text_overflow": "reflow_to_additional_line",
    "glyph_clipping": "increase_line_height",
}


@dataclass(frozen=True)
class LayoutFix:
    code: str
    action: str
    locale_code: str
    format_id: str


@dataclass(frozen=True)
class RepairPlan:
    layout_fixes: list[LayoutFix]
    needs_regeneration: bool


def deterministic_fixes(findings: list[Finding]) -> list[LayoutFix]:
    fixes: list[LayoutFix] = []
    for finding in findings:
        action = LAYOUT_FIX_ACTIONS.get(finding.code)
        if action is None:
            continue
        fixes.append(
            LayoutFix(
                code=finding.code,
                action=action,
                locale_code=finding.locale_code,
                format_id=finding.format_id,
            )
        )
    return fixes


def needs_regeneration(findings: list[Finding]) -> bool:
    return any(f.code not in REPAIRABLE_WITHOUT_REGENERATION for f in findings)


def plan_repair(findings: list[Finding]) -> RepairPlan:
    return RepairPlan(
        layout_fixes=deterministic_fixes(findings),
        needs_regeneration=needs_regeneration(findings),
    )


def _prompt_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


async def repair_draft(
    parent_draft: Draft,
    compiled: CompiledPrompt,
    findings: list[Finding],
    *,
    cache: SceneCache,
    template_version: str,
    role: ModelRole = "scene",
    variants: int = DEFAULT_REPAIR_VARIANTS,
    repair_note: str = "",
) -> list[Draft]:
    if not needs_regeneration(findings):
        return []

    repair_prompt_text = compiled.text if not repair_note else f"{compiled.text} {repair_note}"
    prompt_hash = _prompt_hash(repair_prompt_text)

    drafts: list[Draft] = []
    for variant_index in range(variants):
        key = compute_repair_key(parent_draft.id, variant_index, repair_note)
        cached = cache.get(key)

        if cached is not None:
            drafts.append(
                Draft(
                    id=key,
                    prompt_hash=prompt_hash,
                    template_version=template_version,
                    model_id=parent_draft.model_id,
                    image_ref=key,
                    author="agent",
                    interaction_id=parent_draft.interaction_id,
                    parent=parent_draft.id,
                    findings=[],
                )
            )
            continue

        generated = await generate_image(repair_prompt_text, role=role)
        cache.put(
            key,
            generated.image_bytes,
            generated.mime_type,
            model_id=generated.model_id,
            interaction_id=generated.interaction_id,
        )
        drafts.append(
            Draft(
                id=key,
                prompt_hash=prompt_hash,
                template_version=template_version,
                model_id=generated.model_id,
                image_ref=key,
                author="agent",
                interaction_id=generated.interaction_id,
                parent=parent_draft.id,
                findings=[],
            )
        )

    return drafts

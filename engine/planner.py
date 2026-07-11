from __future__ import annotations

from google.genai import types
from pydantic import Field

from engine.ir import BrandSpec, Frozen, FormatSpec, LocaleSpec, LocalizationPlan, SceneSpec
from engine.models import ModelRole, get_client, model_for

SYSTEM_INSTRUCTION = (
    "You are the creative planner for an ad localization pipeline. Given a "
    "user's intent, a fixed catalog of already-approved locales, and a fixed "
    "catalog of supported aspect ratios, select which locales and formats "
    "this campaign should target and author the creative SceneSpec: the "
    "generated scene's subject, setting, mood, and composition. Never author "
    "locale copy or translations — locale headlines and legal text are "
    "human-approved inputs, not something you produce. locale_codes and "
    "format_ids must be chosen only from the provided catalogs."
)


class PlanRequest(Frozen):
    scene: SceneSpec
    locale_codes: list[str] = Field(min_length=1)
    format_ids: list[str] = Field(min_length=1)


def _catalog_prompt(
    available_locales: list[LocaleSpec], available_formats: list[FormatSpec]
) -> str:
    locale_lines = "\n".join(
        f"- {locale.code} ({locale.language}, {locale.direction.value})"
        for locale in available_locales
    )
    format_lines = "\n".join(f"- {fmt.id}" for fmt in available_formats)
    return f"Available locales:\n{locale_lines}\n\nAvailable formats:\n{format_lines}"


async def request_plan(
    intent: str,
    *,
    available_locales: list[LocaleSpec],
    available_formats: list[FormatSpec],
    role: ModelRole = "plan",
) -> PlanRequest:
    client = get_client()
    model_id = model_for(role)
    prompt = f"{intent}\n\n{_catalog_prompt(available_locales, available_formats)}"

    response = await client.aio.models.generate_content(
        model=model_id,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            response_schema=PlanRequest,
        ),
    )

    parsed = response.parsed
    if isinstance(parsed, PlanRequest):
        return parsed
    return PlanRequest.model_validate_json(response.text)


def resolve_plan(
    request: PlanRequest,
    brand: BrandSpec,
    catalog_locales: list[LocaleSpec],
    catalog_formats: list[FormatSpec],
) -> LocalizationPlan:
    locales_by_code = {locale.code: locale for locale in catalog_locales}
    formats_by_id = {fmt.id: fmt for fmt in catalog_formats}

    missing_locales = [c for c in request.locale_codes if c not in locales_by_code]
    missing_formats = [f for f in request.format_ids if f not in formats_by_id]
    if missing_locales or missing_formats:
        raise ValueError(
            f"planner selected outside the provided catalog: "
            f"unknown locale_codes={missing_locales} unknown format_ids={missing_formats}"
        )

    return LocalizationPlan(
        brand=brand,
        scene=request.scene,
        locales=[locales_by_code[c] for c in request.locale_codes],
        formats=[formats_by_id[f] for f in request.format_ids],
    )


async def plan(
    intent: str,
    *,
    brand: BrandSpec,
    available_locales: list[LocaleSpec],
    available_formats: list[FormatSpec],
    role: ModelRole = "plan",
) -> LocalizationPlan:
    request = await request_plan(
        intent,
        available_locales=available_locales,
        available_formats=available_formats,
        role=role,
    )
    return resolve_plan(request, brand, available_locales, available_formats)

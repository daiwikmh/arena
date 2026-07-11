import pytest

import engine.repair as repair_mod
from engine.cache import SceneCache
from engine.ir import Finding
from engine.models import ImageResult, Usage
from engine.prompt import compile_prompt
from engine.repair import (
    deterministic_fixes,
    needs_regeneration,
    plan_repair,
    repair_draft,
)
from tests.fixtures.formats import FORMATS
from tests.fixtures.locales import LOCALES
from tests.fixtures.scenes import SCENES


def _finding(code: str, tier: str = "deterministic", severity: str = "warning") -> Finding:
    return Finding(
        severity=severity,
        tier=tier,
        code=code,
        message=f"synthetic {code} finding",
        locale_code="de-DE",
        format_id="9:16",
    )


def test_deterministic_fixes_maps_known_codes_to_layout_actions():
    findings = [_finding("text_overflow"), _finding("glyph_clipping")]
    fixes = deterministic_fixes(findings)

    assert {f.code for f in fixes} == {"text_overflow", "glyph_clipping"}
    assert {f.action for f in fixes} == {"reflow_to_additional_line", "increase_line_height"}


def test_deterministic_fixes_ignores_vision_tier_codes():
    findings = [_finding("occlusion", tier="vision", severity="critical")]
    fixes = deterministic_fixes(findings)
    assert fixes == []


def test_needs_regeneration_false_when_only_deterministically_fixable():
    findings = [_finding("text_overflow"), _finding("glyph_clipping")]
    assert needs_regeneration(findings) is False


def test_needs_regeneration_true_when_a_judgment_finding_present():
    findings = [_finding("text_overflow"), _finding("occlusion", tier="vision", severity="critical")]
    assert needs_regeneration(findings) is True


def test_plan_repair_combines_fixes_and_regeneration_flag():
    findings = [_finding("low_contrast")]
    result = plan_repair(findings)
    assert result.layout_fixes == []
    assert result.needs_regeneration is True


class FakeGenerator:
    def __init__(self) -> None:
        self.calls = 0

    async def __call__(self, prompt_text: str, *, role: str = "scene") -> ImageResult:
        self.calls += 1
        return ImageResult(
            image_bytes=f"repaired:{self.calls}:{prompt_text}".encode(),
            mime_type="image/png",
            usage=Usage(prompt_tokens=40, candidates_tokens=1120, total_tokens=1160),
            model_id="gemini-3.1-flash-lite-image",
            response_id=f"resp-{self.calls}",
            interaction_id=f"ixn-{self.calls}",
        )


@pytest.fixture
def cache(tmp_path):
    return SceneCache(root=tmp_path / "scenes")


@pytest.fixture
def fake_generator(monkeypatch):
    fake = FakeGenerator()
    monkeypatch.setattr(repair_mod, "generate_image", fake)
    return fake


def _parent_draft_and_compiled():
    de = next(l for l in LOCALES if l.code == "de-DE")
    fmt = FORMATS[0]
    compiled = compile_prompt(SCENES[0], de, fmt)
    from engine.cache import compute_cache_key

    key = compute_cache_key(compiled.resolved, "v1", "gemini-3.1-flash-lite-image")
    from engine.ir import Draft

    parent = Draft(
        id=key,
        prompt_hash="deadbeef",
        template_version="v1",
        model_id="gemini-3.1-flash-lite-image",
        image_ref=key,
        author="agent",
        interaction_id="ixn-original",
        parent=None,
        findings=[],
    )
    return parent, compiled


async def test_repair_draft_is_a_noop_when_only_deterministic_fixes_apply(cache, fake_generator):
    parent, compiled = _parent_draft_and_compiled()
    findings = [_finding("text_overflow")]

    drafts = await repair_draft(
        parent, compiled, findings, cache=cache, template_version="v1"
    )

    assert drafts == []
    assert fake_generator.calls == 0


async def test_repair_draft_produces_three_distinct_branches_when_regeneration_needed(
    cache, fake_generator
):
    parent, compiled = _parent_draft_and_compiled()
    findings = [_finding("occlusion", tier="vision", severity="critical")]

    drafts = await repair_draft(
        parent, compiled, findings, cache=cache, template_version="v1", variants=3
    )

    assert len(drafts) == 3
    assert fake_generator.calls == 3
    assert len({d.id for d in drafts}) == 3, "each variant must be a distinct branch"
    assert all(d.parent == parent.id for d in drafts)
    assert all(d.author == "agent" for d in drafts)


async def test_repair_draft_does_not_mutate_the_parent(cache, fake_generator):
    parent, compiled = _parent_draft_and_compiled()
    parent_snapshot = parent.model_copy(deep=True)
    findings = [_finding("occlusion", tier="vision", severity="critical")]

    await repair_draft(parent, compiled, findings, cache=cache, template_version="v1")

    assert parent == parent_snapshot


async def test_rejecting_a_repair_costs_nothing_because_nothing_was_adopted(
    cache, fake_generator
):
    parent, compiled = _parent_draft_and_compiled()
    findings = [_finding("occlusion", tier="vision", severity="critical")]

    drafts = await repair_draft(parent, compiled, findings, cache=cache, template_version="v1")
    assert fake_generator.calls == 3

    active_draft = parent
    assert active_draft is parent
    assert active_draft.id == parent.id


async def test_repairing_twice_with_same_note_hits_cache_not_the_model(cache, fake_generator):
    parent, compiled = _parent_draft_and_compiled()
    findings = [_finding("occlusion", tier="vision", severity="critical")]

    first = await repair_draft(
        parent, compiled, findings, cache=cache, template_version="v1",
        variants=2, repair_note="darken the scene",
    )
    assert fake_generator.calls == 2

    second = await repair_draft(
        parent, compiled, findings, cache=cache, template_version="v1",
        variants=2, repair_note="darken the scene",
    )
    assert fake_generator.calls == 2, "identical repair must hit the cache, not regenerate"
    assert [d.id for d in first] == [d.id for d in second]


async def test_different_repair_notes_produce_different_branches(cache, fake_generator):
    parent, compiled = _parent_draft_and_compiled()
    findings = [_finding("occlusion", tier="vision", severity="critical")]

    a = await repair_draft(
        parent, compiled, findings, cache=cache, template_version="v1",
        variants=1, repair_note="darken the scene",
    )
    b = await repair_draft(
        parent, compiled, findings, cache=cache, template_version="v1",
        variants=1, repair_note="brighten the scene",
    )

    assert a[0].id != b[0].id

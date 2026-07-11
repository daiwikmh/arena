import json
import socket
from pathlib import Path

import pytest

from engine.prompt import compile_prompt
from tests.fixtures.matrix import case_id, cases
from tests.fixtures.formats import FORMATS
from tests.fixtures.locales import LOCALES
from tests.fixtures.scenes import SCENES

GOLDEN_PATH = Path(__file__).parent / "fixtures" / "golden_prompts.json"


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def guard(*args, **kwargs):
        raise AssertionError("prompt compiler must not touch the network")

    monkeypatch.setattr(socket.socket, "connect", guard)


def test_golden_matrix_is_the_full_combinatorial_set():
    assert len(SCENES) == 4
    assert len(LOCALES) == 5
    assert len(FORMATS) == 10
    assert len(list(cases())) == 200


def test_golden_prompts_match_snapshot():
    golden = json.loads(GOLDEN_PATH.read_text())
    mismatches = []
    for scene, locale, fmt in cases():
        cid = case_id(scene, locale, fmt)
        expected = golden.get(cid)
        if expected is None:
            mismatches.append(f"missing golden: {cid}")
            continue
        compiled = compile_prompt(scene, locale, fmt)
        if compiled.text != expected["text"]:
            mismatches.append(f"text drift: {cid}")
        if compiled.resolved.copy_region.value != expected["copy_region"]:
            mismatches.append(f"copy_region drift: {cid}")
        if compiled.resolved.directive.region.value != expected["directive_region"]:
            mismatches.append(f"directive.region drift: {cid}")
        if compiled.resolved.directive.subject_bias.value != expected["directive_subject_bias"]:
            mismatches.append(f"directive.subject_bias drift: {cid}")
    assert not mismatches, "\n".join(mismatches)


def test_compile_is_byte_identical_across_calls():
    scene, locale, fmt = next(iter(cases()))
    a = compile_prompt(scene, locale, fmt)
    b = compile_prompt(scene, locale, fmt)
    assert a.text == b.text
    assert a.resolved == b.resolved
    assert a.refs == b.refs


def test_rtl_and_ltr_diverge_with_no_model_involved():
    scene = SCENES[0]
    fmt = FORMATS[7]
    de = next(l for l in LOCALES if l.code == "de-DE")
    ar = next(l for l in LOCALES if l.code == "ar-EG")

    p_de = compile_prompt(scene, de, fmt)
    p_ar = compile_prompt(scene, ar, fmt)

    assert p_de.text != p_ar.text
    assert p_de.resolved.copy_region != p_ar.resolved.copy_region
    assert p_de.resolved.directive.subject_bias != p_ar.resolved.directive.subject_bias


def test_default_copy_box_mirrors_across_direction():
    from engine.ir import Direction
    from engine.prompt.resolve import default_copy_box

    ltr = default_copy_box(Direction.LTR)
    rtl = default_copy_box(Direction.RTL)

    assert ltr.w == rtl.w
    assert ltr.h == rtl.h
    assert ltr.x != rtl.x
    assert pytest.approx(ltr.x + ltr.w + rtl.x, abs=1e-9) == 1.0


def test_editing_headline_copy_does_not_change_the_compiled_scene_prompt():
    scene = SCENES[0]
    fmt = FORMATS[0]
    de = next(l for l in LOCALES if l.code == "de-DE")
    de_edited = de.model_copy(update={"headline": "Ein ganz anderer Satz, viel laenger als vorher."})

    p_before = compile_prompt(scene, de, fmt)
    p_after = compile_prompt(scene, de_edited, fmt)

    assert p_before.text == p_after.text
    assert p_before.resolved == p_after.resolved

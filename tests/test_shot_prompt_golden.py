import json
import socket
from pathlib import Path

import pytest

from engine.ir import ObjectRef
from engine.shots import compile_shot_prompt
from tests.fixtures.shots import SHOTS

GOLDEN_PATH = Path(__file__).parent / "fixtures" / "golden_shot_prompts.json"


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def guard(*args, **kwargs):
        raise AssertionError("shot prompt compiler must not touch the network")

    monkeypatch.setattr(socket.socket, "connect", guard)


def test_one_shot_per_camera_movement():
    assert len(SHOTS) == 9
    assert len({s.camera_movement for s in SHOTS}) == 9


def test_golden_shot_prompts_match_snapshot():
    golden = json.loads(GOLDEN_PATH.read_text())
    mismatches = []
    for shot in SHOTS:
        expected = golden.get(shot.camera_movement)
        if expected is None:
            mismatches.append(f"missing golden: {shot.camera_movement}")
            continue
        compiled = compile_shot_prompt(shot)
        if compiled.text != expected["text"]:
            mismatches.append(f"text drift: {shot.camera_movement}")
    assert not mismatches, "\n".join(mismatches)


def test_compile_is_byte_identical_across_calls():
    shot = SHOTS[0]
    a = compile_shot_prompt(shot)
    b = compile_shot_prompt(shot)
    assert a.text == b.text
    assert a.refs == b.refs


def test_pan_left_and_pan_right_bias_the_subject_oppositely():
    left = next(s for s in SHOTS if s.camera_movement == "pan_left")
    right = next(s for s in SHOTS if s.camera_movement == "pan_right")

    left_text = compile_shot_prompt(left).text
    right_text = compile_shot_prompt(right).text

    assert "weighted toward the right of frame" in left_text
    assert "weighted toward the left of frame" in right_text
    assert left_text != right_text


def test_tilt_up_and_tilt_down_bias_the_subject_oppositely():
    up = next(s for s in SHOTS if s.camera_movement == "tilt_up")
    down = next(s for s in SHOTS if s.camera_movement == "tilt_down")

    up_text = compile_shot_prompt(up).text
    down_text = compile_shot_prompt(down).text

    assert "weighted toward the lower half" in up_text
    assert "weighted toward the upper half" in down_text


def test_duration_and_action_are_woven_into_the_prompt():
    shot = SHOTS[0]
    compiled = compile_shot_prompt(shot)
    assert f"{shot.duration_sec}-second shot" in compiled.text
    assert shot.action in compiled.text


def test_object_refs_are_linked_and_named_in_prompt():
    shot = SHOTS[0].model_copy(
        update={"object_refs": [ObjectRef(asset_id="ast_marble01", label="glass marble")]}
    )
    compiled = compile_shot_prompt(shot)
    assert compiled.refs == [{"asset_id": "ast_marble01", "role": "object", "label": "glass marble"}]
    assert "glass marble" in compiled.text

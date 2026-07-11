import json
from pathlib import Path

from engine.shots import compile_shot_prompt
from tests.fixtures.shots import SHOTS

GOLDEN_PATH = Path(__file__).parent / "golden_shot_prompts.json"


def main() -> None:
    golden: dict[str, dict[str, str]] = {}
    for shot in SHOTS:
        compiled = compile_shot_prompt(shot)
        golden[shot.camera_movement] = {
            "text": compiled.text,
            "template_version": compiled.template_version,
        }
    GOLDEN_PATH.write_text(json.dumps(golden, indent=2, sort_keys=True) + "\n")
    print(f"wrote {len(golden)} golden shot prompts to {GOLDEN_PATH}")


if __name__ == "__main__":
    main()

import json
from pathlib import Path

from engine.prompt import compile_prompt
from tests.fixtures.matrix import case_id, cases

GOLDEN_PATH = Path(__file__).parent / "golden_prompts.json"


def main() -> None:
    golden: dict[str, dict[str, str]] = {}
    for scene, locale, fmt in cases():
        compiled = compile_prompt(scene, locale, fmt)
        golden[case_id(scene, locale, fmt)] = {
            "text": compiled.text,
            "copy_region": compiled.resolved.copy_region.value,
            "directive_region": compiled.resolved.directive.region.value,
            "directive_subject_bias": compiled.resolved.directive.subject_bias.value,
        }
    GOLDEN_PATH.write_text(json.dumps(golden, indent=2, sort_keys=True) + "\n")
    print(f"wrote {len(golden)} golden prompts to {GOLDEN_PATH}")


if __name__ == "__main__":
    main()

import asyncio
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from engine.ir import Direction, FormatSpec, LocaleSpec, SceneSpec
from engine.models import generate_image
from engine.prompt import compile_prompt

PRICE_PER_M_OUTPUT_TOKENS = 30.00
EXPECTED_TOKENS_PER_1K_IMAGE = 1120
BURST_SIZE = 30

OUTPUT_DIR = Path(__file__).parent / "output"


def make_prompt() -> str:
    scene = SceneSpec(
        subject="cold brew bottle on a stone counter",
        setting="minimalist kitchen, morning light through a window",
        time_of_day="dawn",
        palette=["#1A2B3C", "#EDEEF0"],
        mood="calm, unhurried",
        lens_mm=50,
        lighting="soft",
        excludes=["text", "people"],
        object_refs=[],
    )
    locale = LocaleSpec(
        code="en-US",
        language="English",
        direction=Direction.LTR,
        headline="Wake up slower.",
        legal="Cold brew. 2x caffeine.",
    )
    fmt = FormatSpec(id="1:1", width_ratio=1, height_ratio=1)
    return compile_prompt(scene, locale, fmt).text


async def single_call_cost_check(prompt_text: str) -> None:
    print("=== single call: cost verification ===")
    result = await generate_image(prompt_text, role="scene")
    tokens = result.usage.candidates_tokens
    cost = tokens * PRICE_PER_M_OUTPUT_TOKENS / 1_000_000

    print(f"model:              {result.model_id}")
    print(f"candidates_tokens:  {tokens}")
    print(f"expected (~1120):   {'MATCH' if abs(tokens - EXPECTED_TOKENS_PER_1K_IMAGE) < 200 else 'MISMATCH'}")
    print(f"cost this image:    ${cost:.4f}")
    print(f"prompt_tokens:      {result.usage.prompt_tokens}")
    print(f"total_tokens:       {result.usage.total_tokens}")
    print(f"response_id:        {result.response_id}")
    print(f"interaction_id:     {result.interaction_id}")
    print(f"mime_type:          {result.mime_type}")
    print(f"image bytes:        {len(result.image_bytes)}")

    OUTPUT_DIR.mkdir(exist_ok=True)
    ext = "png" if "png" in result.mime_type else "jpg"
    (OUTPUT_DIR / f"single.{ext}").write_bytes(result.image_bytes)
    print(f"saved to gates/output/single.{ext}")
    print()


async def burst(prompt_text: str, n: int) -> None:
    print(f"=== burst: {n} parallel calls, watching for 429 / IPM ceiling ===")

    async def one(i: int) -> tuple[int, str, float]:
        started = time.monotonic()
        try:
            result = await generate_image(prompt_text, role="scene")
            elapsed = time.monotonic() - started
            return i, f"ok tokens={result.usage.candidates_tokens}", elapsed
        except Exception as exc:  # noqa: BLE001 -- gate must surface the raw error shape
            elapsed = time.monotonic() - started
            return i, f"FAIL {type(exc).__name__}: {exc}", elapsed

    t0 = time.monotonic()
    results = await asyncio.gather(*(one(i) for i in range(n)))
    wall_clock = time.monotonic() - t0

    ok = [r for r in results if r[1].startswith("ok")]
    failed = [r for r in results if not r[1].startswith("ok")]

    for i, status, elapsed in sorted(results, key=lambda r: r[0]):
        print(f"  [{i:02d}] {elapsed:6.2f}s  {status}")

    total_tokens = sum(int(s.split("tokens=")[1]) for _, s, _ in ok)
    total_cost = total_tokens * PRICE_PER_M_OUTPUT_TOKENS / 1_000_000

    print()
    print(f"wall clock:         {wall_clock:.2f}s")
    print(f"succeeded:          {len(ok)}/{n}")
    print(f"failed:             {len(failed)}/{n}")
    print(f"total cost:         ${total_cost:.4f}")
    if failed:
        print("first failure reason (informs the IPM ceiling):")
        print(f"  {failed[0][1]}")


async def main() -> None:
    prompt_text = make_prompt()
    print("compiled prompt (pure, zero cost):")
    print(f"  {prompt_text}\n")

    await single_call_cost_check(prompt_text)
    await burst(prompt_text, BURST_SIZE)


if __name__ == "__main__":
    asyncio.run(main())

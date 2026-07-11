import asyncio
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BROWSER_SCRIPT = REPO_ROOT / "web" / "scripts" / "gate-d-browser.mjs"
PORT = 8347
BASE_URL = f"ws://127.0.0.1:{PORT}"


async def run_and_capture(cmd: list[str], cwd: Path | None = None) -> str:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=str(cwd) if cwd else None,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(
            f"command failed ({proc.returncode}): {' '.join(cmd)}\n"
            f"stdout: {stdout.decode()}\nstderr: {stderr.decode()}"
        )
    return stdout.decode().strip().splitlines()[-1]


async def start_server() -> asyncio.subprocess.Process:
    proc = await asyncio.create_subprocess_exec(
        "uv", "run", "python", "-m", "gates.gate_d.server", str(PORT),
        cwd=str(REPO_ROOT),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    line = await proc.stdout.readline()
    if b"listening" not in line:
        raise RuntimeError(f"server did not start cleanly: {line!r}")
    return proc


async def scenario_1_js_undoes_python_survives() -> dict:
    room = "scenario1"
    uri = f"{BASE_URL}/{room}"

    await run_and_capture(
        ["uv", "run", "python", "-m", "gates.gate_d.agent", uri, "produce", "agent-cell", "agent value"],
        cwd=REPO_ROOT,
    )

    raw = await run_and_capture(
        ["node", str(BROWSER_SCRIPT), BASE_URL, room, "undo", "user-cell", "user value", "agent-cell"],
        cwd=REPO_ROOT / "web",
    )
    result = json.loads(raw)

    before = result["beforeUndo"]
    after = result["afterUndo"]

    checks = {
        "before_undo_has_agent_edit": before.get("agent-cell") == "agent value",
        "before_undo_has_user_edit": before.get("user-cell") == "user value",
        "after_undo_agent_edit_survives": after.get("agent-cell") == "agent value",
        "after_undo_user_edit_is_gone": "user-cell" not in after,
    }
    return {"name": "JS undoes, Python agent's edit must survive", "before": before, "after": after, "checks": checks}


async def scenario_2_python_undoes_js_survives() -> dict:
    room = "scenario2"
    uri = f"{BASE_URL}/{room}"

    await run_and_capture(
        ["node", str(BROWSER_SCRIPT), BASE_URL, room, "produce", "user-cell-2", "user value 2"],
        cwd=REPO_ROOT / "web",
    )

    raw = await run_and_capture(
        ["uv", "run", "python", "-m", "gates.gate_d.agent", uri, "undo", "agent-cell-2", "agent value 2", "user-cell-2"],
        cwd=REPO_ROOT,
    )
    result = json.loads(raw)

    before = result["beforeUndo"]
    after = result["afterUndo"]

    checks = {
        "before_undo_has_user_edit": before.get("user-cell-2") == "user value 2",
        "before_undo_has_agent_edit": before.get("agent-cell-2") == "agent value 2",
        "after_undo_user_edit_survives": after.get("user-cell-2") == "user value 2",
        "after_undo_agent_edit_is_gone": "agent-cell-2" not in after,
    }
    return {"name": "Python agent undoes, JS peer's edit must survive", "before": before, "after": after, "checks": checks}


async def main() -> int:
    server = await start_server()
    try:
        results = []
        for scenario in (scenario_1_js_undoes_python_survives, scenario_2_python_undoes_js_survives):
            result = await scenario()
            results.append(result)

        all_passed = True
        for result in results:
            print(f"\n=== {result['name']} ===")
            print(f"  before undo: {result['before']}")
            print(f"  after undo:  {result['after']}")
            for check, passed in result["checks"].items():
                status = "PASS" if passed else "FAIL"
                print(f"  [{status}] {check}")
                all_passed = all_passed and passed

        print()
        if all_passed:
            print("GATE D: PASS — origin-scoped undo survives the process boundary in both directions.")
            return 0
        else:
            print("GATE D: FAIL — origin scoping did not hold. Co-editing needs redesigning (see plan §14).")
            return 1
    finally:
        server.terminate()
        await server.wait()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

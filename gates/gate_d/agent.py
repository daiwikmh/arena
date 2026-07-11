import asyncio
import json
import sys

import websockets
from pycrdt import (
    Doc,
    Map,
    UndoManager,
    YMessageType,
    create_sync_message,
    create_update_message,
    handle_sync_message,
)


async def _connect_and_sync(uri: str, doc: Doc) -> tuple:
    ws = await websockets.connect(uri)
    await ws.send(create_sync_message(doc))

    async def receiver() -> None:
        async for message in ws:
            raw = message if isinstance(message, bytes) else message.encode()
            if not raw or raw[0] != YMessageType.SYNC:
                continue
            reply = handle_sync_message(raw[1:], doc)
            if reply is not None:
                await ws.send(reply)

    recv_task = asyncio.create_task(receiver())
    await asyncio.sleep(0.5)
    return ws, recv_task


async def _wait_for_key(cells: Map, key: str, timeout_s: float = 5.0) -> None:
    deadline = asyncio.get_event_loop().time() + timeout_s
    while key not in cells and asyncio.get_event_loop().time() < deadline:
        await asyncio.sleep(0.05)


async def _broadcast_and_settle(ws, pending_updates: list[bytes], recv_task) -> None:
    for update in pending_updates:
        await ws.send(create_update_message(update))
    await asyncio.sleep(0.5)
    recv_task.cancel()
    try:
        await recv_task
    except (asyncio.CancelledError, websockets.ConnectionClosed):
        pass
    await ws.close()


async def run_produce(uri: str, cell_key: str, cell_value: str, wait_for_key: str | None) -> dict:
    doc = Doc()
    cells = doc.get("cells", type=Map)
    pending_updates: list[bytes] = []
    subscription = doc.observe(lambda event: pending_updates.append(bytes(event.update)))

    ws, recv_task = await _connect_and_sync(uri, doc)

    if wait_for_key:
        await _wait_for_key(cells, wait_for_key)

    pending_updates.clear()
    with doc.transaction(origin="agent"):
        cells[cell_key] = cell_value

    await _broadcast_and_settle(ws, pending_updates, recv_task)
    doc.unobserve(subscription)
    return dict(cells)


async def run_undo(uri: str, own_key: str, own_value: str, wait_for_key: str) -> dict:
    doc = Doc()
    cells = doc.get("cells", type=Map)
    pending_updates: list[bytes] = []
    subscription = doc.observe(lambda event: pending_updates.append(bytes(event.update)))

    undo_manager = UndoManager(scopes=[cells])
    undo_manager.include_origin("agent")

    ws, recv_task = await _connect_and_sync(uri, doc)

    await _wait_for_key(cells, wait_for_key)

    pending_updates.clear()
    with doc.transaction(origin="agent"):
        cells[own_key] = own_value

    for update in pending_updates:
        await ws.send(create_update_message(update))
    await asyncio.sleep(0.3)

    before_undo = dict(cells)
    undo_manager.undo()
    after_undo = dict(cells)

    recv_task.cancel()
    try:
        await recv_task
    except (asyncio.CancelledError, websockets.ConnectionClosed):
        pass
    await ws.close()
    doc.unobserve(subscription)

    return {"beforeUndo": before_undo, "afterUndo": after_undo}


if __name__ == "__main__":
    mode = sys.argv[2]
    uri = sys.argv[1]
    if mode == "produce":
        cell_key, cell_value = sys.argv[3], sys.argv[4]
        wait_for_key = sys.argv[5] if len(sys.argv) > 5 else None
        result = asyncio.run(run_produce(uri, cell_key, cell_value, wait_for_key))
    elif mode == "undo":
        own_key, own_value, wait_for_key = sys.argv[3], sys.argv[4], sys.argv[5]
        result = asyncio.run(run_undo(uri, own_key, own_value, wait_for_key))
    else:
        raise SystemExit(f"unknown mode {mode!r}")

    print(json.dumps(result))

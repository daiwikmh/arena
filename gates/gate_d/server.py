import asyncio
import sys

import websockets
from pycrdt.websocket import WebsocketServer


class WebsocketsChannel:
    def __init__(self, connection: websockets.ServerConnection) -> None:
        self._connection = connection

    @property
    def path(self) -> str:
        return self._connection.request.path if self._connection.request else "/"

    async def send(self, message: bytes) -> None:
        await self._connection.send(message)

    async def recv(self) -> bytes:
        message = await self._connection.recv()
        return message if isinstance(message, bytes) else message.encode()

    def __aiter__(self) -> "WebsocketsChannel":
        return self

    async def __anext__(self) -> bytes:
        try:
            return await self.recv()
        except websockets.ConnectionClosed:
            raise StopAsyncIteration()


PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8347


async def main() -> None:
    server = WebsocketServer(auto_clean_rooms=False)

    async def handler(connection: websockets.ServerConnection) -> None:
        await server.serve(WebsocketsChannel(connection))

    async with server:
        async with websockets.serve(handler, "127.0.0.1", PORT):
            print(f"gate-d sync server listening on ws://127.0.0.1:{PORT}", flush=True)
            await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())

import asyncio
from collections import defaultdict
from uuid import UUID

from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect


class QueueConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[UUID, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, organization_id: UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[organization_id].add(websocket)

    async def disconnect(self, organization_id: UUID, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections[organization_id].discard(websocket)
            if not self._connections[organization_id]:
                self._connections.pop(organization_id, None)

    async def publish(self, organization_id: UUID, event: dict) -> None:
        async with self._lock:
            connections = tuple(self._connections.get(organization_id, ()))
        disconnected = []
        for connection in connections:
            try:
                await connection.send_json(event)
            except (OSError, RuntimeError, WebSocketDisconnect):
                disconnected.append(connection)
        for connection in disconnected:
            await self.disconnect(organization_id, connection)


queue_connections = QueueConnectionManager()

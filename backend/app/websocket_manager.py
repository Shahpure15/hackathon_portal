from fastapi import WebSocket
from typing import Dict, Set

class ConnectionManager:
    def __init__(self):
        self.active: Dict[str, Set[WebSocket]] = {}  # eventId -> connections

    async def connect(self, ws: WebSocket, event_id: str):
        await ws.accept()
        self.active.setdefault(event_id, set()).add(ws)

    def disconnect(self, ws: WebSocket, event_id: str):
        if event_id in self.active:
            self.active[event_id].discard(ws)

    async def broadcast(self, event_id: str, message: dict):
        dead = []
        for ws in self.active.get(event_id, set()):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, event_id)

manager = ConnectionManager()

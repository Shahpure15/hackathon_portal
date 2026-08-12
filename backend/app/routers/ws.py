from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from jose import JWTError, jwt
from app.config import settings
from app.websocket_manager import manager

router = APIRouter(tags=["websocket"])

@router.websocket("/ws/ps-updates/{event_id}")
async def websocket_ps_updates(websocket: WebSocket, event_id: str):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4401)
        return

    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
        token_event_id = payload.get("eventId")
        if not token_event_id or token_event_id != event_id:
            await websocket.close(code=4401)
            return
    except JWTError:
        await websocket.close(code=4401)
        return

    await manager.connect(websocket, event_id)
    try:
        while True:
            # Keep-alive receive loop
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, event_id)
    except Exception:
        manager.disconnect(websocket, event_id)

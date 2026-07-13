"""Communications route — exposes the in-process EventBus to the frontend
over Server-Sent Events, so the IDE gets pushed HITL/terminal/build events
instead of polling. Auth via query-param token since browser EventSource
can't set custom headers."""
import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

logger = logging.getLogger("caraios.comms.route")
router = APIRouter()


async def _event_stream(user_id: str):
    from communications.bus import EventBus
    bus = EventBus()
    try:
        async for event in bus.subscribe(f"user:{user_id}"):
            yield f"id: {event['id']}\nevent: {event['type']}\ndata: {json.dumps(event['data'])}\n\n"
    except asyncio.CancelledError:
        logger.info(f"[comms] SSE stream closed for user {user_id}")
        raise


@router.get("/stream")
async def stream(token: str):
    import jwt
    from core.config import settings
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    except Exception:
        raise HTTPException(401, "Invalid or missing token")
    user_id = payload["sub"]
    return StreamingResponse(
        _event_stream(user_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )

"""Anonymous funnel tracking from the front end."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from app import db
from app.models import TrackEvent
from app.services.analytics import TRACKED_EVENTS, parse_user_agent

router = APIRouter(tags=["analytics"])


@router.post("/track")
async def track_event(body: TrackEvent, request: Request):
    if body.type not in TRACKED_EVENTS:
        raise HTTPException(status_code=400, detail="Unknown event type")
    device, browser = parse_user_agent(request.headers.get("user-agent", ""))
    await db.analytics_events.insert_one({
        "id": str(uuid.uuid4()), "type": body.type, "session_id": body.session_id,
        "code": body.code, "src": body.src or "direct",
        "device": device, "browser": browser,
        "at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}

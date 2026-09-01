"""Grand opening countdown. Server-authoritative so clocks can't be gamed."""
from datetime import datetime, timezone

from fastapi import APIRouter

from app.config import settings

router = APIRouter(prefix="/opening", tags=["opening"])

# Kept server-side so the offer stays a surprise until staff reveal it in person.
OFFER = ["☕ Coffee", "🍪 Cookie", "✨ Exclusive Bros Cafe sticker"]


@router.get("/status")
async def status():
    now = datetime.now(timezone.utc)
    opening = settings.opening_datetime.astimezone(timezone.utc)
    return {
        "server_time": now.isoformat(),
        "opening_time": opening.isoformat(),
        "is_open": now >= opening,
    }

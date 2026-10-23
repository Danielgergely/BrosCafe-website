"""Today's takings for the owners' phone widget. See services/live_sales.py."""
import hmac
import logging
from datetime import date

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, field_validator

from app import db
from app.config import settings
from app.security import require_admin
from app.services import live_sales as service
from app.services.fruitsys import FruitsysError

logger = logging.getLogger(__name__)
router = APIRouter(tags=["live-sales"])


@router.get("/live-sales")
async def live_sales(authorization: str = Header(default="")):
    # 404 rather than 401 when the feature is off or the key is wrong, so the
    # endpoint gives nobody a hint that it exists.
    supplied = authorization.removeprefix("Bearer ").strip()
    if not settings.live_sales_configured:
        raise HTTPException(status_code=404, detail="Not Found")
    if not hmac.compare_digest(supplied.encode(), settings.live_sales_key.encode()):
        # Lengths only, never the key: enough to tell a stray space or a
        # truncated paste (48 expected) from a different key.
        logger.warning("live sales: wrong key (got %d characters, expected %d)",
                       len(supplied), len(settings.live_sales_key))
        raise HTTPException(status_code=404, detail="Not Found")
    summary = await db.live_sales.find_one({"_id": "current"}, {"_id": 0})
    if summary is None:
        raise HTTPException(status_code=503, detail="No figures yet — the first update runs at startup")
    return summary


@router.get("/admin/live-sales")
async def admin_live_sales(fresh: bool = False, _: dict = Depends(require_admin)):
    """The dashboard: the latest summary and the forecast scorecard. `fresh`
    fetches from Fruitsys first, unless that happened in the last minute."""
    if not settings.live_sales_configured:
        raise HTTPException(status_code=404, detail="Live sales is not configured on this server")
    refresh_failed = False
    if fresh:
        try:
            await service.refresh_if_stale()
        except (FruitsysError, httpx.HTTPError, ValueError) as exc:
            logger.warning("live sales: fresh fetch failed: %s", exc)
            refresh_failed = True
    data = await service.dashboard()
    if data["summary"] is None:
        raise HTTPException(status_code=503, detail="No figures yet — the first update runs at startup")
    return {**data, "refresh_failed": refresh_failed}


class UnusualDay(BaseModel):
    note: str = Field(default="", max_length=120)


async def _after_marking() -> None:
    # Today's forecast and comparison follow at once; a failed fetch only
    # means they follow on the next poll.
    try:
        await service.refresh_if_stale(0)
    except (FruitsysError, httpx.HTTPError, ValueError) as exc:
        logger.warning("live sales: refresh after marking a day failed: %s", exc)


def _valid_day(day: str) -> str:
    try:
        return date.fromisoformat(day).isoformat()
    except ValueError:
        raise HTTPException(status_code=400, detail="Expected a date as YYYY-MM-DD")


@router.put("/admin/live-sales/unusual/{day}")
async def mark_unusual(day: str, body: UnusualDay, _: dict = Depends(require_admin)):
    """Mark a day unusual (an event, closing early): forecast like an ordinary
    day, but never learnt from."""
    await service.mark_unusual(_valid_day(day), body.note.strip())
    await _after_marking()
    return {"ok": True}


@router.delete("/admin/live-sales/unusual/{day}")
async def unmark_unusual(day: str, _: dict = Depends(require_admin)):
    await service.mark_unusual(_valid_day(day), None)
    await _after_marking()
    return {"ok": True}


class Post(BaseModel):
    time: str | None = Field(default=None, description="HH:MM, if known")
    note: str = Field(default="", max_length=200)

    @field_validator("time")
    @classmethod
    def _hh_mm(cls, value):
        if value in (None, ""):
            return None
        hour, _, minute = value.replace(".", ":").partition(":")
        if not (hour.isdigit() and minute.isdigit() and 0 <= int(hour) <= 23 and 0 <= int(minute) <= 59):
            raise ValueError("time must be HH:MM")
        return f"{int(hour):02d}:{int(minute):02d}"


@router.put("/admin/live-sales/posts/{day}")
async def mark_post(day: str, body: Post, _: dict = Depends(require_admin)):
    """Flag an Instagram post on a day, to measure the takings after it."""
    await service.mark_post(_valid_day(day), body.time, body.note.strip())
    return {"ok": True}


@router.delete("/admin/live-sales/posts/{day}")
async def unmark_post(day: str, _: dict = Depends(require_admin)):
    await service.mark_post(_valid_day(day), None, None, remove=True)
    return {"ok": True}

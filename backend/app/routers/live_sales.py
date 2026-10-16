"""Today's takings for the owners' phone widget. See services/live_sales.py."""
import hmac
import logging

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException

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

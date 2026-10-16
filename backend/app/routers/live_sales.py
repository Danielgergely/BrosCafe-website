"""Today's takings for the owners' phone widget. See services/live_sales.py."""
import hmac

from fastapi import APIRouter, Header, HTTPException

from app import db
from app.config import settings

router = APIRouter(tags=["live-sales"])


@router.get("/live-sales")
async def live_sales(authorization: str = Header(default="")):
    # 404 rather than 401 when the feature is off or the key is wrong, so the
    # endpoint gives nobody a hint that it exists.
    supplied = authorization.removeprefix("Bearer ").strip()
    if not settings.live_sales_configured or not hmac.compare_digest(
            supplied.encode(), settings.live_sales_key.encode()):
        raise HTTPException(status_code=404, detail="Not Found")
    summary = await db.live_sales.find_one({"_id": "current"}, {"_id": 0})
    if summary is None:
        raise HTTPException(status_code=503, detail="No figures yet — the first update runs at startup")
    return summary

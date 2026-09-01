"""Admin-tunable analytics thresholds, stored as a single settings document."""
from app import db
from app.config import settings

DEFAULTS = {
    "active_days": 30,
    "inactive_days": 30,
    "new_days": 14,
    "loyal_cycles": 2,
    "almost_reward_stamps": max(settings.stamps_required - 1, 1),
    "cafe_lat": None,
    "cafe_lng": None,
}


async def read() -> dict:
    doc = await db.app_settings.find_one({"_id": "config"})
    if not doc:
        return dict(DEFAULTS)
    doc.pop("_id", None)
    return {**DEFAULTS, **doc}


async def write(values: dict) -> dict:
    if values:
        await db.app_settings.update_one({"_id": "config"}, {"$set": values}, upsert=True)
    return await read()

"""Member lifecycle: creation, public projection, stamps, transaction log."""
import uuid
from datetime import datetime, timezone

import logging

from app import db
from app.config import settings
from app.wallet import google

logger = logging.getLogger(__name__)

REGISTRATION = "registration"
COFFEE_ADDED = "coffee_added"
REWARD_EARNED = "reward_earned"
REWARD_REDEEMED = "reward_redeemed"
MANUAL_ADJUSTMENT = "manual_adjustment"
OPENING_REDEEMED = "opening_redeemed"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def public(doc: dict) -> dict:
    """Everything a customer or staff member is allowed to see. Never tokens."""
    return {
        "code": doc["code"],
        "name": doc["name"],
        "email": doc["email"],
        "stamps": doc["stamps"],
        "stamps_required": settings.stamps_required,
        "total_coffees": doc["total_coffees"],
        "rewards_redeemed": doc["rewards_redeemed"],
        "reward_ready": doc["reward_ready"],
        "opening_status": doc.get("opening_status", "reserved"),
        "created_at": doc["created_at"],
    }


def new_document(name: str, email: str) -> dict:
    return {
        "code": uuid.uuid4().hex[:10],
        "name": name.strip() or "Friend",
        "email": email,
        "stamps": 0,
        "total_coffees": 0,
        "rewards_redeemed": 0,
        "reward_ready": False,
        "opening_status": "reserved",
        "created_at": _now(),
    }


async def create(name: str, email: str, lang: str = "hu") -> dict:
    doc = {**new_document(name, email), "lang": lang}
    await db.members.insert_one(dict(doc))
    await log(doc["code"], doc["name"], "customer", REGISTRATION, 0, 0, False, False)
    return doc


async def erase(code: str) -> dict | None:
    """Delete a member and everything that identifies them.

    Written for erasure requests, not only for clearing test accounts: a
    loyalty programme holds someone's name, email and visit history, and under
    GDPR they can ask for all of it back. Doing that by hand in the database
    is not a process a café can rely on.

    An Apple pass already on a phone cannot be recalled — removing the device
    registrations stops us pushing to it, and its serial stops resolving, so it
    quietly goes stale. Google passes can at least be marked expired.
    """
    doc = await db.members.find_one({"code": code})
    if not doc:
        return None

    pass_expired = False
    if doc.get("google_object_id"):
        try:
            pass_expired = await google.expire_object(code)
        except Exception:
            # Never let a wallet hiccup block the erasure itself.
            logger.exception("Could not expire the Google pass for %s", code)

    removed = {
        "transactions": (await db.transactions.delete_many({"code": code})).deleted_count,
        "magic_tokens": (await db.magic_tokens.delete_many(
            {"email": doc["email"]})).deleted_count,
        "analytics_events": (await db.analytics_events.delete_many(
            {"code": code})).deleted_count,
        "wallet_registrations": (await db.wallet_registrations.delete_many(
            {"serial": doc["wallet_serial"]})).deleted_count
        if doc.get("wallet_serial") else 0,
    }
    await db.members.delete_one({"code": code})
    logger.info("Erased member %s (%s): %s", code, doc["email"], removed)
    return {"code": code, "email": doc["email"],
            "google_pass_expired": pass_expired, "removed": removed}


async def find_by_scan(value: str) -> dict | None:
    """Resolve a scanned value: card code, Wallet serial or loyalty token."""
    value = value.strip()
    return await db.members.find_one({"$or": [
        {"code": value}, {"wallet_serial": value}, {"loyalty_token": value}]})


async def log(code, name, employee, kind, prev_stamps, new_stamps, prev_reward, new_reward) -> None:
    await db.transactions.insert_one({
        "id": str(uuid.uuid4()),
        "code": code, "customer_name": name, "employee": employee, "type": kind,
        "prev_stamps": prev_stamps, "new_stamps": new_stamps,
        "prev_reward": prev_reward, "new_reward": new_reward,
        "at": _now(),
    })

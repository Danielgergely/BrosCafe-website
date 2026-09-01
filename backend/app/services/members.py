"""Member lifecycle: creation, public projection, stamps, transaction log."""
import uuid
from datetime import datetime, timezone

from app import db
from app.config import settings

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


async def create(name: str, email: str) -> dict:
    doc = new_document(name, email)
    await db.members.insert_one(dict(doc))
    await log(doc["code"], doc["name"], "customer", REGISTRATION, 0, 0, False, False)
    return doc


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

"""Member lifecycle: creation, public projection, stamps, transaction log."""
import uuid
from datetime import datetime, timezone

import logging

from app import db
from app.config import settings
from app.services import tiers
from app.wallet import google

logger = logging.getLogger(__name__)

REGISTRATION = "registration"
COFFEE_ADDED = "coffee_added"
FREE_COFFEE_EARNED = "free_coffee_earned"
FREE_COFFEE_REDEEMED = "free_coffee_redeemed"
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
        # Per member, not global: a tier shortens the card.
        "stamps_required": tiers.stamps_required(doc),
        "total_coffees": doc["total_coffees"],
        "rewards_redeemed": doc["rewards_redeemed"],
        "reward_ready": doc["reward_ready"],
        # Banked drinks that don't come off the stamp card: referrals, and
        # whoever tops the game leaderboard that week.
        "free_coffees": doc.get("free_coffees", 0),
        "opening_status": doc.get("opening_status", "reserved"),
        "created_at": doc["created_at"],
        **tiers.summary(doc),
    }


def new_document(name: str, email: str) -> dict:
    return {
        "code": uuid.uuid4().hex[:10],
        "name": name.strip() or "Friend",
        "email": email,
        # The welcome bonus counts towards the reward but is not a purchase,
        # so total_coffees — which drives the sales analytics — stays at zero.
        "stamps": settings.welcome_stamps,
        "total_coffees": 0,
        "rewards_redeemed": 0,
        "reward_ready": False,
        "free_coffees": 0,
        "opening_status": "reserved",
        "created_at": _now(),
    }


async def create(name: str, email: str, lang: str = "hu",
                 referred_by: str | None = None) -> dict:
    doc = {**new_document(name, email), "lang": lang}
    if referred_by:
        # Credited only when this member is actually served — see
        # credit_referrer(). A signup on its own earns the referrer nothing,
        # which is what stops invented addresses being worth anything.
        doc["referred_by"] = referred_by
        doc["referral_credited"] = False
    await db.members.insert_one(dict(doc))
    # Record the bonus in the history, so a card that starts at 5 is explained.
    await log(doc["code"], doc["name"], "customer", REGISTRATION,
              0, doc["stamps"], False, False)
    return doc


async def erase(code: str) -> dict | None:
    """Delete a member and everything that identifies them.

    Written for erasure requests, not only for clearing test accounts: a
    loyalty programme holds someone's name, email and visit history, and under
    GDPR they can ask for all of it back. Doing that by hand in the database
    is not a process a café can rely on.

    An Apple pass already on a phone cannot be recalled: PassKit has no API for
    it. The next best thing is to leave it voided — Wallet greys the card out
    and marks it closed — which is what void_apple_pass sets up before the
    record goes. Google passes are marked expired outright.
    """
    # Local import: app.services.wallet imports this module.
    from app.services import wallet as wallet_service
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

    # Must happen before the record goes: the push needs the registrations, and
    # the tombstone needs the pass's own auth token.
    pass_voided = False
    try:
        pass_voided = await wallet_service.void_apple_pass(doc)
    except Exception:
        logger.exception("Could not void the Apple pass for %s", code)

    removed = {
        "transactions": (await db.transactions.delete_many({"code": code})).deleted_count,
        "magic_tokens": (await db.magic_tokens.delete_many(
            {"email": doc["email"]})).deleted_count,
        "analytics_events": (await db.analytics_events.delete_many(
            {"code": code})).deleted_count,
        # Kept when the pass was voided, so the phone can still be told and can
        # still fetch the closed version. iOS deletes them itself when someone
        # removes the greyed-out card.
        "wallet_registrations": 0 if pass_voided else (
            await db.wallet_registrations.delete_many(
                {"serial": doc["wallet_serial"]})).deleted_count
        if doc.get("wallet_serial") else 0,
    }
    await db.members.delete_one({"code": code})
    logger.info("Erased member %s (%s): voided=%s %s", code, doc["email"],
                pass_voided, removed)
    return {"code": code, "email": doc["email"],
            "google_pass_expired": pass_expired,
            "apple_pass_voided": pass_voided, "removed": removed}


async def find_by_scan(value: str) -> dict | None:
    """Resolve a scanned value: card code, Wallet serial or loyalty token."""
    value = value.strip()
    return await db.members.find_one({"$or": [
        {"code": value}, {"wallet_serial": value}, {"loyalty_token": value}]})


async def log(code, name, employee, kind, prev_stamps, new_stamps, prev_reward,
              new_reward, drink=None) -> None:
    await db.transactions.insert_one({
        "id": str(uuid.uuid4()),
        "code": code, "customer_name": name, "employee": employee, "type": kind,
        "prev_stamps": prev_stamps, "new_stamps": new_stamps,
        "prev_reward": prev_reward, "new_reward": new_reward,
        "drink": drink,
        "at": _now(),
    })


async def grant_free_coffees(code: str, count: int, reason: str,
                             employee: str = "system") -> dict | None:
    """Bank a free drink for someone. Never goes below zero."""
    doc = await db.members.find_one({"code": code})
    if not doc:
        return None
    total = max(0, doc.get("free_coffees", 0) + count)
    await db.members.update_one({"code": code}, {"$set": {"free_coffees": total}})
    doc["free_coffees"] = total
    await log(code, doc["name"], employee,
              FREE_COFFEE_EARNED if count > 0 else FREE_COFFEE_REDEEMED,
              doc["stamps"], doc["stamps"], doc["reward_ready"], doc["reward_ready"])
    logger.info("Free coffees for %s: %+d (%s) -> %d", code, count, reason, total)
    return doc


async def credit_referrer(member: dict, employee: str) -> dict | None:
    """Pay out a referral the first time the referred member is served.

    Returns the referrer if they were credited, so the caller can tell them.
    """
    referrer_code = member.get("referred_by")
    if not referrer_code or member.get("referral_credited"):
        return None

    # Mark first: a failure past this point must not pay twice.
    await db.members.update_one({"code": member["code"]},
                                {"$set": {"referral_credited": True}})
    member["referral_credited"] = True
    return await grant_free_coffees(referrer_code, 1, f"referred {member['code']}", employee)

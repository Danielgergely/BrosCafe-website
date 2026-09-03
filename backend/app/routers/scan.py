"""Staff scan actions. Every route resolves a scanned value to one member,
mutates the balance, records a transaction and refreshes the Wallet pass."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app import db
from app.config import settings
from app.models import AdjustRequest
from app.routers.opening import OFFER
from app.security import get_current_user
from app.services import email, members, tiers, wallet

router = APIRouter(prefix="/scan", tags=["scan"])


async def scanned_member(code: str) -> dict:
    doc = await members.find_by_scan(code)
    if not doc:
        raise HTTPException(status_code=404, detail="Customer not found")
    return doc


async def _apply(code: str, changes: dict, doc: dict) -> dict:
    await db.members.update_one({"code": code}, {"$set": changes})
    doc.update(changes)
    await wallet.notify_update(code)
    return members.public(doc)


@router.get("/{code}")
async def look_up(code: str, user: dict = Depends(get_current_user)):
    return members.public(await scanned_member(code))


@router.post("/{code}/add-coffee")
async def add_coffee(code: str, user: dict = Depends(get_current_user)):
    doc = await scanned_member(code)
    code = doc["code"]
    required = tiers.stamps_required(doc)

    # Diamond members drink free, so there is no card to fill and nothing to
    # redeem separately: serving one is the whole transaction. It still counts
    # towards the sales figures, and towards the free coffees given away.
    if required == 0:
        changes = {"stamps": 0, "reward_ready": True,
                   "total_coffees": doc["total_coffees"] + 1,
                   "rewards_redeemed": doc["rewards_redeemed"] + 1}
        result = await _apply(code, changes, doc)
        await members.log(code, doc["name"], user["email"], members.REWARD_REDEEMED,
                          0, 0, True, True)
        return result

    if doc["reward_ready"]:
        raise HTTPException(status_code=400,
                            detail="Reward is ready — redeem the free coffee first")

    previous = doc["stamps"]
    stamps = previous + 1
    reward_ready = stamps >= required
    changes = {"stamps": stamps, "total_coffees": doc["total_coffees"] + 1,
               "reward_ready": reward_ready}

    result = await _apply(code, changes, doc)
    await members.log(code, doc["name"], user["email"], members.COFFEE_ADDED,
                      previous, stamps, False, reward_ready)
    if reward_ready:
        await members.log(code, doc["name"], user["email"], members.REWARD_EARNED,
                          stamps, stamps, False, True)
        try:
            await email.send_reward_ready(doc["email"], doc.get("lang", "hu"))
        except Exception as exc:  # a failed email must never block the counter
            import logging
            logging.getLogger(__name__).warning("Reward email failed: %s", exc)
    return result


@router.post("/{code}/redeem")
async def redeem_reward(code: str, user: dict = Depends(get_current_user)):
    doc = await scanned_member(code)
    if not doc["reward_ready"]:
        raise HTTPException(status_code=400, detail="No reward available to redeem")

    code = doc["code"]
    previous = doc["stamps"]
    changes = {"stamps": 0, "reward_ready": False,
               "rewards_redeemed": doc["rewards_redeemed"] + 1}

    result = await _apply(code, changes, doc)
    await members.log(code, doc["name"], user["email"], members.REWARD_REDEEMED,
                      previous, 0, True, False)
    return result


@router.post("/{code}/adjust")
async def adjust(code: str, body: AdjustRequest, user: dict = Depends(get_current_user)):
    doc = await scanned_member(code)
    code = doc["code"]
    previous, previous_reward = doc["stamps"], doc["reward_ready"]
    required = tiers.stamps_required(doc) or settings.stamps_required
    stamps = max(0, min(required, previous + body.delta))
    reward_ready = stamps >= required

    result = await _apply(code, {"stamps": stamps, "reward_ready": reward_ready}, doc)
    await members.log(code, doc["name"], user["email"], members.MANUAL_ADJUSTMENT,
                      previous, stamps, previous_reward, reward_ready)
    return result


@router.post("/{code}/opening/reveal")
async def reveal_opening(code: str, user: dict = Depends(get_current_user)):
    doc = await scanned_member(code)
    status = doc.get("opening_status", "reserved")
    if status != "redeemed":
        status = "revealed"
        await db.members.update_one({"code": doc["code"]}, {"$set": {"opening_status": status}})
    return {"status": status, "offer": OFFER}


@router.post("/{code}/opening/redeem")
async def redeem_opening(code: str, user: dict = Depends(get_current_user)):
    doc = await scanned_member(code)
    if doc.get("opening_status") == "redeemed":
        raise HTTPException(status_code=400, detail="Opening offer already redeemed")
    await db.members.update_one({"code": doc["code"]}, {"$set": {
        "opening_status": "redeemed",
        "opening_redeemed_at": datetime.now(timezone.utc).isoformat()}})
    await members.log(doc["code"], doc["name"], user["email"], members.OPENING_REDEEMED,
                      doc["stamps"], doc["stamps"], doc["reward_ready"], doc["reward_ready"])
    return {"status": "redeemed", "offer": OFFER}

"""Staff scan actions. Every route resolves a scanned value to one member,
mutates the balance, records a transaction and refreshes the Wallet pass."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app import db
from app.config import settings
from app.models import AdjustRequest, DrinkChoice
from app.security import get_current_user
from app.services import drinks, email, members, tiers, wallet

router = APIRouter(prefix="/scan", tags=["scan"])


async def scanned_member(code: str) -> dict:
    doc = await members.find_by_scan(code)
    if not doc:
        raise HTTPException(status_code=404, detail="Customer not found")
    return doc


async def _apply(code: str, changes: dict, doc: dict) -> None:
    await db.members.update_one({"code": code}, {"$set": changes})
    doc.update(changes)
    await wallet.notify_update(code)


async def _card(doc: dict) -> dict:
    """What the counter sees: the member, plus the drink to offer them."""
    return {**members.public(doc), "usual": await drinks.usual(doc["code"])}


async def _chosen(body: DrinkChoice | None) -> str | None:
    drink = body.drink if body else None
    if not await drinks.known(drink):
        raise HTTPException(status_code=400, detail="Unknown drink")
    return drink


@router.get("/drinks")
async def drink_choices(user: dict = Depends(get_current_user)):
    return await drinks.choices()


@router.get("/{code}")
async def look_up(code: str, user: dict = Depends(get_current_user)):
    return await _card(await scanned_member(code))


@router.post("/{code}/add-coffee")
async def add_coffee(code: str, body: DrinkChoice | None = None,
                     user: dict = Depends(get_current_user)):
    doc = await scanned_member(code)
    code = doc["code"]
    drink = await _chosen(body)
    required = tiers.stamps_required(doc)

    # Diamond members drink free, so there is no card to fill and nothing to
    # redeem separately: serving one is the whole transaction. It still counts
    # towards the sales figures, and towards the free coffees given away.
    if required == 0:
        changes = {"stamps": 0, "reward_ready": True,
                   "total_coffees": doc["total_coffees"] + 1,
                   "rewards_redeemed": doc["rewards_redeemed"] + 1}
        await _apply(code, changes, doc)
        await members.log(code, doc["name"], user["email"], members.REWARD_REDEEMED,
                          0, 0, True, True, drink)
        return await _card(doc)

    if doc["reward_ready"]:
        raise HTTPException(status_code=400,
                            detail="Reward is ready — redeem the free coffee first")

    previous = doc["stamps"]
    stamps = previous + 1
    reward_ready = stamps >= required
    changes = {"stamps": stamps, "total_coffees": doc["total_coffees"] + 1,
               "reward_ready": reward_ready}

    await _apply(code, changes, doc)
    await members.log(code, doc["name"], user["email"], members.COFFEE_ADDED,
                      previous, stamps, False, reward_ready, drink)

    # The friend has now actually been served, so the card they were handed
    # pays out. Failing here must never block the counter.
    try:
        referrer = await members.credit_referrer(doc, user["email"])
        if referrer:
            await email.send_referral_earned(referrer["email"], doc["name"],
                                             referrer.get("lang", "hu"))
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Referral credit failed: %s", exc)
    if reward_ready:
        await members.log(code, doc["name"], user["email"], members.REWARD_EARNED,
                          stamps, stamps, False, True)
        try:
            await email.send_reward_ready(doc["email"], doc.get("lang", "hu"))
        except Exception as exc:  # a failed email must never block the counter
            import logging
            logging.getLogger(__name__).warning("Reward email failed: %s", exc)
    return await _card(doc)


@router.post("/{code}/redeem")
async def redeem_reward(code: str, body: DrinkChoice | None = None,
                        user: dict = Depends(get_current_user)):
    doc = await scanned_member(code)
    if not doc["reward_ready"]:
        raise HTTPException(status_code=400, detail="No reward available to redeem")

    code = doc["code"]
    drink = await _chosen(body)
    previous = doc["stamps"]
    changes = {"stamps": 0, "reward_ready": False,
               "rewards_redeemed": doc["rewards_redeemed"] + 1}

    await _apply(code, changes, doc)
    await members.log(code, doc["name"], user["email"], members.REWARD_REDEEMED,
                      previous, 0, True, False, drink)
    return await _card(doc)


@router.post("/{code}/redeem-free")
async def redeem_free_coffee(code: str, body: DrinkChoice | None = None,
                             user: dict = Depends(get_current_user)):
    """Spend a banked free drink. Separate from the stamp card, which is
    untouched: these are earned by referring someone or by winning the week."""
    doc = await scanned_member(code)
    if doc.get("free_coffees", 0) < 1:
        raise HTTPException(status_code=400, detail="No free coffee banked")

    drink = await _chosen(body)
    code = doc["code"]
    remaining = doc["free_coffees"] - 1
    await db.members.update_one({"code": code}, {"$set": {"free_coffees": remaining}})
    doc["free_coffees"] = remaining
    await wallet.notify_update(code)
    await members.log(code, doc["name"], user["email"], members.FREE_COFFEE_REDEEMED,
                      doc["stamps"], doc["stamps"], doc["reward_ready"],
                      doc["reward_ready"], drink)
    return await _card(doc)


@router.post("/{code}/adjust")
async def adjust(code: str, body: AdjustRequest, user: dict = Depends(get_current_user)):
    doc = await scanned_member(code)
    code = doc["code"]
    previous, previous_reward = doc["stamps"], doc["reward_ready"]
    required = tiers.stamps_required(doc) or settings.stamps_required
    stamps = max(0, min(required, previous + body.delta))
    reward_ready = stamps >= required

    await _apply(code, {"stamps": stamps, "reward_ready": reward_ready}, doc)
    await members.log(code, doc["name"], user["email"], members.MANUAL_ADJUSTMENT,
                      previous, stamps, previous_reward, reward_ready)
    return await _card(doc)


# The grand-opening gift. The café is open now and new members no longer get
# one; these two endpoints stay so the counter can still honour a pass that was
# handed out before opening day. Kept server-side so the gift stayed a surprise.
OFFER = ["☕ Coffee", "🍪 Cookie", "✨ Exclusive Bros Cafe sticker"]
NO_PASS = "This member has no opening gift"


@router.post("/{code}/opening/reveal")
async def reveal_opening(code: str, user: dict = Depends(get_current_user)):
    doc = await scanned_member(code)
    status = doc.get("opening_status", "reserved")
    if status == "none":
        raise HTTPException(status_code=400, detail=NO_PASS)
    if status != "redeemed":
        status = "revealed"
        await db.members.update_one({"code": doc["code"]}, {"$set": {"opening_status": status}})
    return {"status": status, "offer": OFFER}


@router.post("/{code}/opening/redeem")
async def redeem_opening(code: str, user: dict = Depends(get_current_user)):
    doc = await scanned_member(code)
    if doc.get("opening_status") == "none":
        raise HTTPException(status_code=400, detail=NO_PASS)
    if doc.get("opening_status") == "redeemed":
        raise HTTPException(status_code=400, detail="Opening offer already redeemed")
    await db.members.update_one({"code": doc["code"]}, {"$set": {
        "opening_status": "redeemed",
        "opening_redeemed_at": datetime.now(timezone.utc).isoformat()}})
    await members.log(doc["code"], doc["name"], user["email"], members.OPENING_REDEEMED,
                      doc["stamps"], doc["stamps"], doc["reward_ready"], doc["reward_ready"])
    return {"status": "redeemed", "offer": OFFER}

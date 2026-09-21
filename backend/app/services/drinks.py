"""Which drink a stamp was for.

A stamp is always for something the bar made: the coffees, the matcha and chai
specialities, the teas and the smoothies. Bottled drinks are left out on
purpose — handing over a can of Coca-Cola is not the thing the card rewards.
The list comes from the live menu, so a drink added there shows up at the
counter without a deploy.
"""
from collections import Counter

from app import db
from app.services.members import COFFEE_ADDED, REWARD_REDEEMED

DRINK_CATEGORIES = ["coffee", "specialty", "tea", "smoothie"]


async def choices() -> list[dict]:
    return await db.products.find(
        {"active": {"$ne": False}, "cat": {"$in": DRINK_CATEGORIES}},
        {"_id": 0, "id": 1, "name": 1, "cat": 1},
    ).sort("order", 1).to_list(50)


async def known(drink: str | None) -> bool:
    """Archived drinks still pass: a stamp mid-shift shouldn't fail because
    someone tidied the menu."""
    if drink is None:
        return True
    return await db.products.count_documents(
        {"id": drink, "cat": {"$in": DRINK_CATEGORIES}}, limit=1) > 0


async def usual(code: str) -> dict | None:
    """What to offer on the house: the drink they've had most since their last
    free coffee. A tie goes to whichever they had most recently, because that
    is the habit they're in now.
    """
    last = await db.transactions.find_one(
        {"code": code, "type": REWARD_REDEEMED}, sort=[("at", -1)])
    query = {"code": code, "type": COFFEE_ADDED, "drink": {"$ne": None}}
    if last:
        query["at"] = {"$gt": last["at"]}

    rows = await db.transactions.find(
        query, {"_id": 0, "drink": 1, "at": 1}).to_list(500)
    if not rows:
        return None

    counts, latest = Counter(), {}
    for row in rows:
        counts[row["drink"]] += 1
        latest[row["drink"]] = max(latest.get(row["drink"], ""), row["at"])

    drink = max(counts, key=lambda d: (counts[d], latest[d]))
    return {"drink": drink, "count": counts[drink], "of": len(rows)}

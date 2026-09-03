"""Loyalty tiers.

A tier is earned by lifetime purchases and shortens the card: the more someone
has bought, the fewer stamps a free coffee costs. Diamond is different — it is
never earned, only granted by an admin, and it makes every coffee free.

The thresholds count `total_coffees`, which records purchases only: the
five-stamp welcome bonus deliberately does not count towards a tier.

`shorter` is relative to STAMPS_REQUIRED rather than absolute, so changing the
base programme keeps the tiers in step instead of silently inverting them.
"""
from app.config import settings

BASE = "base"
DIAMOND = "diamond"

# Lowest first. `at` is lifetime coffees purchased.
EARNED = (
    {"key": "base", "at": 0, "shorter": 0},
    {"key": "bronze", "at": 50, "shorter": 1},
    {"key": "silver", "at": 150, "shorter": 2},
    {"key": "gold", "at": 300, "shorter": 3},
)

# Granted by an admin. Never reached by spending, and never lost by inactivity.
GRANTED = (DIAMOND,)

ALL = tuple(t["key"] for t in EARNED) + GRANTED

# A card can never get shorter than this, whatever the tier maths says.
MIN_STAMPS = 2


def _spec(key: str) -> dict:
    return next((t for t in EARNED if t["key"] == key), EARNED[0])


def _bought(doc: dict) -> int:
    """Lifetime purchases as a whole number.

    Mongo will hand back a float if a value was ever written by something other
    than the app, and a tier line reading "149.0 more coffees" looks broken.
    """
    try:
        return int(doc.get("total_coffees", 0) or 0)
    except (TypeError, ValueError):
        return 0


def earned_tier(total_coffees: int) -> str:
    """The highest tier this many purchases has reached."""
    best = EARNED[0]["key"]
    for tier in EARNED:
        if total_coffees >= tier["at"]:
            best = tier["key"]
    return best


def effective_tier(doc: dict) -> str:
    """What the member actually has.

    An admin grant wins over the earned tier, but only upwards — someone who
    has bought their way to gold does not drop to bronze because an admin once
    granted them one.
    """
    granted = doc.get("tier_override")
    earned = earned_tier(_bought(doc))
    if not granted or granted not in ALL:
        return earned
    if granted in GRANTED:
        return granted
    order = [t["key"] for t in EARNED]
    return granted if order.index(granted) > order.index(earned) else earned


def always_free(tier: str) -> bool:
    return tier == DIAMOND


def stamps_required(doc: dict) -> int:
    """How many stamps a free coffee costs this member. 0 means always free."""
    tier = effective_tier(doc)
    if always_free(tier):
        return 0
    return max(MIN_STAMPS, settings.stamps_required - _spec(tier)["shorter"])


def next_tier(doc: dict) -> tuple[str | None, int]:
    """The tier above this one, and the purchases still needed to reach it.

    Diamond sits outside the ladder, and someone already at gold has nothing
    left to climb — both return (None, 0).
    """
    tier = effective_tier(doc)
    if always_free(tier):
        return None, 0
    order = [t["key"] for t in EARNED]
    index = order.index(tier)
    if index >= len(EARNED) - 1:
        return None, 0
    upcoming = EARNED[index + 1]
    return upcoming["key"], max(0, upcoming["at"] - _bought(doc))


def summary(doc: dict) -> dict:
    """Everything the apps need to describe a member's standing."""
    tier = effective_tier(doc)
    upcoming, remaining = next_tier(doc)
    return {
        "tier": tier,
        "tier_granted": bool(doc.get("tier_override")) and tier == doc.get("tier_override"),
        "always_free": always_free(tier),
        "next_tier": upcoming,
        "coffees_to_next": remaining,
    }

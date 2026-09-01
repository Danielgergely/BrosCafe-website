"""Analytics aggregation. Pure computation over loaded documents, so each
endpoint is one small wrapper around a function that is easy to reason about."""
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from app import db
from app.services import app_settings

TRACKED_EVENTS = {"qr_scan", "page_view", "registration_started",
                  "registration_completed", "wallet_added"}


def parse_ts(value):
    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def since(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


def today_start() -> datetime:
    return datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


def pct(n, d) -> float:
    return round((n / d) * 100, 1) if d else 0.0


def parse_user_agent(ua: str) -> tuple[str, str]:
    ua = (ua or "").lower()
    if "ipad" in ua or "tablet" in ua:
        device = "tablet"
    elif "mobi" in ua or "iphone" in ua or "android" in ua:
        device = "mobile"
    else:
        device = "desktop"
    for needle, name in (("edg", "Edge"), ("chrome", "Chrome"), ("crios", "Chrome"),
                         ("firefox", "Firefox"), ("safari", "Safari")):
        if needle in ua:
            return device, name
    return device, "Other"


async def load() -> tuple[list, list, list]:
    txs = await db.transactions.find({}, {"_id": 0}).to_list(100000)
    members = await db.members.find({}, {"_id": 0}).to_list(100000)
    events = await db.analytics_events.find({}, {"_id": 0}).to_list(100000)
    return txs, members, events


def coffee_dates_by_code(txs) -> dict[str, list[datetime]]:
    by = defaultdict(list)
    for t in txs:
        if t["type"] == "coffee_added":
            dt = parse_ts(t.get("at"))
            if dt:
                by[t["code"]].append(dt)
    return by


def _count_since(items, key, cutoff, **match) -> int:
    return sum(
        1 for it in items
        if (dt := parse_ts(it.get(key))) and dt >= cutoff
        and all(it.get(k) == v for k, v in match.items())
    )


def _reached(members, n) -> int:
    return sum(1 for m in members if m["total_coffees"] >= n)


def _hours_to_reward(txs, members) -> list[float]:
    registered = {m["code"]: parse_ts(m["created_at"]) for m in members}
    out = []
    for t in txs:
        if t["type"] != "reward_earned":
            continue
        earned, start = parse_ts(t.get("at")), registered.get(t["code"])
        if earned and start:
            out.append((earned - start).total_seconds() / 3600)
    return out


def _mean(values, digits=1):
    return round(sum(values) / len(values), digits) if values else 0


async def overview() -> dict:
    txs, members, events = await load()
    cfg = await app_settings.read()

    def block(cutoff):
        return {
            "qr_scans": _count_since(events, "at", cutoff, type="qr_scan"),
            "new_customers": _count_since(members, "created_at", cutoff),
            "coffees": _count_since(txs, "at", cutoff, type="coffee_added"),
            "rewards_earned": _count_since(txs, "at", cutoff, type="reward_earned"),
            "rewards_redeemed": _count_since(txs, "at", cutoff, type="reward_redeemed"),
        }

    active_cutoff = since(cfg["active_days"])
    active = {c for c, dates in coffee_dates_by_code(txs).items()
              if any(d >= active_cutoff for d in dates)}
    return {
        "today": block(today_start()),
        "week": block(since(7)),
        "month": block(since(30)),
        "totals": {
            "total_customers": len(members),
            "active_customers": len(active),
            "total_coffees": sum(m["total_coffees"] for m in members),
            "total_rewards_redeemed": sum(m["rewards_redeemed"] for m in members),
        },
    }


async def funnel() -> list[dict]:
    txs, members, events = await load()

    def unique_sessions(kind):
        return len({e["session_id"] for e in events if e["type"] == kind})

    stages = [
        ("QR Scanned", sum(1 for e in events if e["type"] == "qr_scan")),
        ("Loyalty Page Viewed", unique_sessions("page_view")),
        ("Registration Started", unique_sessions("registration_started")),
        ("Registration Completed", len(members)),
        ("Wallet Card Added", len({e.get("code") for e in events
                                   if e["type"] == "wallet_added" and e.get("code")})),
        *[(f"Coffee #{n}", _reached(members, n)) for n in range(1, 5)],
        ("Free Coffee Redeemed", sum(1 for m in members if m["rewards_redeemed"] >= 1)),
    ]
    top = max((c for _, c in stages), default=1) or 1
    return [{"stage": s, "count": c, "pct": pct(c, top)} for s, c in stages]


async def customers() -> dict:
    txs, members, events = await load()
    cfg = await app_settings.read()
    by_code = coffee_dates_by_code(txs)
    total = len(members)

    gaps = []
    for dates in by_code.values():
        ordered = sorted(dates)
        gaps += [(ordered[i] - ordered[i - 1]).total_seconds() / 3600
                 for i in range(1, len(ordered))]

    active_cutoff = since(cfg["active_days"])
    active = len({c for c, d in by_code.items() if any(x >= active_cutoff for x in d)})
    earned = sum(1 for t in txs if t["type"] == "reward_earned")
    redeemed = sum(1 for t in txs if t["type"] == "reward_redeemed")
    total_coffees = sum(m["total_coffees"] for m in members)
    total_visits = sum(len(d) for d in by_code.values())

    return {
        "total": total,
        "new": _count_since(members, "created_at", since(cfg["new_days"])),
        "returning": sum(1 for d in by_code.values() if len({x.date() for x in d}) > 1),
        "active": active,
        "inactive": total - active,
        "avg_coffees_per_customer": round(total_coffees / total, 1) if total else 0,
        "avg_visits": round(total_visits / total, 1) if total else 0,
        "avg_hours_between_purchases": _mean(gaps),
        "avg_hours_to_reward": _mean(_hours_to_reward(txs, members)),
        "reward_redemption_rate": pct(redeemed, earned),
    }


async def coffee() -> dict:
    txs, members, _ = await load()
    poured = [t for t in txs if t["type"] == "coffee_added"]
    dates = [dt for t in poured if (dt := parse_ts(t.get("at")))]
    now = datetime.now(timezone.utc)

    daily = []
    for offset in range(13, -1, -1):
        day = (now - timedelta(days=offset)).date()
        daily.append({"date": day.isoformat()[5:],
                      "count": sum(1 for d in dates if d.date() == day)})

    hourly = [{"hour": h, "count": 0} for h in range(24)]
    for d in dates:
        hourly[d.hour]["count"] += 1

    # Include the code: two customers can share a name, so the front end needs
    # a unique key.
    top = sorted(members, key=lambda m: m["total_coffees"], reverse=True)[:5]
    return {
        "total": len(poured),
        "today": sum(1 for d in dates if d >= today_start()),
        "week": sum(1 for d in dates if d >= since(7)),
        "month": sum(1 for d in dates if d >= since(30)),
        "year": sum(1 for d in dates if d >= since(365)),
        "avg_per_customer": round(len(poured) / len(members), 1) if members else 0,
        "most_active": [{"code": m["code"], "name": m["name"], "coffees": m["total_coffees"]}
                        for m in top if m["total_coffees"] > 0],
        "trend_daily": daily,
        "trend_hourly": hourly,
    }


async def rewards() -> dict:
    txs, members, _ = await load()
    earned = sum(1 for t in txs if t["type"] == "reward_earned")
    redeemed = sum(1 for t in txs if t["type"] == "reward_redeemed")
    return {
        "earned": earned,
        "redeemed": redeemed,
        "waiting": sum(1 for m in members if m["reward_ready"]),
        "redemption_rate": pct(redeemed, earned),
        "avg_hours_to_earn": _mean(_hours_to_reward(txs, members)),
    }


async def retention() -> list[dict]:
    txs, members, _ = await load()
    cfg = await app_settings.read()
    by_code = coffee_dates_by_code(txs)
    active_cutoff = since(cfg["active_days"])
    return [
        {"label": "New", "count": _count_since(members, "created_at", since(cfg["new_days"]))},
        {"label": "Returning", "count": sum(1 for d in by_code.values() if len({x.date() for x in d}) > 1)},
        {"label": "Visited Once", "count": sum(1 for d in by_code.values() if len(d) == 1)},
        {"label": "Reached 2", "count": _reached(members, 2)},
        {"label": "Reached 4", "count": _reached(members, 4)},
        {"label": "Redeemed", "count": sum(1 for m in members if m["rewards_redeemed"] >= 1)},
        {"label": "Churned", "count": sum(1 for d in by_code.values() if d and max(d) < active_cutoff)},
    ]


SEGMENT_ORDER = ["New", "Active", "Almost Reward", "Reward Available", "Inactive", "Loyal"]


async def segments() -> list[dict]:
    txs, members, _ = await load()
    cfg = await app_settings.read()
    active_cutoff = since(cfg["active_days"])
    inactive_cutoff = since(cfg["inactive_days"])
    new_cutoff = since(cfg["new_days"])
    last_coffee = {c: max(d) for c, d in coffee_dates_by_code(txs).items()}

    counts = defaultdict(int)
    for m in members:
        last = last_coffee.get(m["code"])
        created = parse_ts(m["created_at"])
        if m["reward_ready"]:
            counts["Reward Available"] += 1
        elif m["stamps"] >= cfg["almost_reward_stamps"]:
            counts["Almost Reward"] += 1
        if m["rewards_redeemed"] >= cfg["loyal_cycles"]:
            counts["Loyal"] += 1
        if last and last >= active_cutoff:
            counts["Active"] += 1
        if (last or created) and (last or created) < inactive_cutoff:
            counts["Inactive"] += 1
        if created and created >= new_cutoff and m["total_coffees"] <= 1:
            counts["New"] += 1
    return [{"segment": k, "count": counts.get(k, 0)} for k in SEGMENT_ORDER]

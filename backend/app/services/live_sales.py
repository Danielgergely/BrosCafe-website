"""Today's takings against an ordinary day like it: the phone widget and the
live sales dashboard in /admin.

Every LIVE_SALES_EVERY_MIN minutes during opening hours the backend asks
Fruitsys for today's takings per hour, what sold, and the receipts, and stores
one summary. GET /api/live-sales hands it to the widget; the admin dashboard
gets it with more around it, and can ask for a fresh fetch (at most once a
minute — see `refresh_if_stale`).

The comparison is with the same weekday on earlier weeks, up to the same
minute: at 10:20 on a Friday, today so far against what earlier Fridays had
taken by 10:20. Fruitsys only reports by clock hour, so "by 10:20" counts the
10:00–11:00 takings at twenty sixtieths. Closed days never change, so each is
fetched once and kept in `sales_days`. Forecasts and how they turned out are
in `sales_forecasts`; the method is in services/forecasts.py.

The loop runs inside the API process. That is fine with the single uvicorn
worker the Dockerfile starts; more workers would each poll.
"""
import asyncio
import logging
import time
from datetime import date, datetime, timedelta
from statistics import mean

import httpx

from app import db
from app.config import CAFE_TZ, settings
from app.services import forecasts
from app.services.forecasts import taken_by
from app.services.fruitsys import Fruitsys, FruitsysError

logger = logging.getLogger(__name__)

# Poll only while the café could be taking money: Monday to Saturday, 06:00 to
# 20:00 café time. Outside that the last summary simply stays where it was.
POLL_FROM, POLL_UNTIL = 6, 20
CLOSED_WEEKDAYS = {6}  # Sunday
# How far back the first run looks for history, in months.
BACKFILL_MONTHS = 24
# A dashboard asking for fresh figures gets them at most this often.
FRESH_AFTER_SECONDS = 60
# How many finished days the dashboard's forecast history shows.
HISTORY_DAYS = 30

_lock = asyncio.Lock()
_last_refresh = 0.0


def _months_back(today: date, count: int):
    year, month = today.year, today.month
    for _ in range(count):
        yield year, month
        month -= 1
        if month == 0:
            year, month = year - 1, 12


def daily_target() -> int | None:
    """Break-even per open day in gross, as the till counts."""
    target = round(settings.break_even_net_ft * settings.gross_per_net)
    return target if target > 0 else None


async def _sync_past_days(client: Fruitsys, today: date) -> None:
    """Store every closed workday that isn't stored yet: hours and receipts."""
    known = {d["date"]: d for d in await db.sales_days.find(
        {}, {"_id": 0, "date": 1, "workday_id": 1, "receipts": 1}).to_list(None)}
    # First run: walk back until a month with no workdays (before opening).
    # After that, this month and last month cover yesterday at a month's turn.
    months = BACKFILL_MONTHS if not known else 2
    for year, month in _months_back(today, months):
        workdays = await client.workdays(year, month)
        if not workdays and not known:
            break
        for workday in workdays:
            day = workday["opened_at"][:10]
            if day >= today.isoformat() or day in known:
                continue
            hours = await client.hourly(workday["id"])
            await db.sales_days.update_one({"date": day}, {"$set": {
                "date": day,
                "weekday": date.fromisoformat(day).weekday(),
                "workday_id": workday["id"],
                "hours": {str(h): v for h, v in hours.items()},
                "total": sum(hours.values()),
                "receipts": await client.receipts(workday["id"]),
            }}, upsert=True)
            known[day] = {}
    # Days stored before receipts were collected get them once.
    for day, doc in known.items():
        if doc.get("workday_id") and "receipts" not in doc:
            await db.sales_days.update_one(
                {"date": day}, {"$set": {"receipts": await client.receipts(doc["workday_id"])}})


async def _fetch_today(client: Fruitsys, today: date) -> dict:
    hours: dict[int, int] = {}
    sold: list[dict] = []
    receipts = {"count": 0, "gross": 0, "net": 0}
    for workday in await client.workdays(today.year, today.month):
        if workday["opened_at"][:10] != today.isoformat():
            continue
        for hour, amount in (await client.hourly(workday["id"])).items():
            hours[hour] = hours.get(hour, 0) + amount
        sold += await client.products(workday["id"])
        for key, value in (await client.receipts(workday["id"])).items():
            receipts[key] += value

    # Some Fruitsys users are sent the counts but not the amounts. Then the
    # revenue is the count at the till's list price: close, though it misses
    # discounts and paid extras such as plant milk — so it is marked.
    estimated = any(p["count"] for p in sold) and not any(p["gross"] for p in sold)
    if estimated:
        prices = await client.prices()
        for p in sold:
            p["gross"] = p["count"] * prices.get(f"{p['name']} {p['unit']}".strip(), 0)

    products: dict[str, dict] = {}
    for p in sold:
        entry = products.setdefault(p["name"], {"count": 0, "gross": 0})
        entry["count"] += p["count"]
        entry["gross"] += p["gross"]
    return {"hours": hours, "products": products, "receipts": receipts,
            "products_estimated": estimated}


async def refresh() -> dict:
    global _last_refresh
    now = datetime.now(CAFE_TZ)
    today = now.date()
    async with Fruitsys(settings.fruitsys_user, settings.fruitsys_password) as client:
        await _sync_past_days(client, today)
        fetched = await _fetch_today(client, today)

    history = await db.sales_days.find(
        {"date": {"$lt": today.isoformat()}}, {"_id": 0}).sort("date", 1).to_list(None)
    past = [d for d in history if d["weekday"] == today.weekday()]
    previous = await db.live_sales.find_one({"_id": "current"}) or {}
    hours, products, receipts = fetched["hours"], fetched["products"], fetched["receipts"]
    total = sum(hours.values())

    summary = {
        "date": today.isoformat(),
        "updated_at": now.isoformat(timespec="seconds"),
        "total": total,
        "hours": {str(h): v for h, v in sorted(hours.items())},
        "has_sales": bool(hours),
        "compared_days": len(past),
        **_comparison(past, total, now),
        **_target(total, now, past, previous),
        **_records(past, history, total),
        **_baskets(receipts, past),
        "top_product": (_top(products, 1) or [None])[0],
        "top_products": _top(products, 3),
        "products": _top(products, 5),
        "products_estimated": fetched["products_estimated"],
        "week": _week(history, today, total),
        "month": _month(history, today, total),
        **await _forecasts(history, today, now, hours, total),
    }
    await db.live_sales.replace_one({"_id": "current"}, summary, upsert=True)
    _last_refresh = time.monotonic()
    return summary


async def refresh_if_stale(max_age: float = FRESH_AFTER_SECONDS) -> None:
    """Fetch now unless that happened within `max_age` seconds, so a dashboard
    reloaded over and over can't hammer Fruitsys."""
    if time.monotonic() - _last_refresh < max_age:
        return
    async with _lock:
        if time.monotonic() - _last_refresh >= max_age:
            await refresh()


def _comparison(past: list[dict], total: int, now: datetime) -> dict:
    """Today against the same weekday on earlier weeks, and that weekday's
    usual takings per hour (the line behind the widget's bars)."""
    if not past:
        return {"average_so_far": None, "average_day": None, "diff_pct": None, "average_hours": {}}
    so_far = mean(taken_by(d["hours"], now.hour, now.minute) for d in past)
    day = mean(d["total"] for d in past)
    hours = sorted({int(h) for d in past for h in d["hours"]})
    return {
        "average_so_far": round(so_far),
        "average_day": round(day),
        "diff_pct": round((total - so_far) / so_far * 100, 1) if so_far > 0 else None,
        "average_hours": {str(h): round(mean(d["hours"].get(str(h), 0) for d in past)) for h in hours},
    }


def _target(total: int, now: datetime, past: list[dict], previous: dict) -> dict:
    """Progress to the day's break-even, and when today should reach it.

    The ETA scales today by how an ordinary day of this weekday fills up: if
    earlier Fridays had taken 40% of their day by now, today's takings so far
    are 40% of today. Before a tenth of the usual day is in, that guess is too
    noisy to show.
    """
    target = daily_target()
    if not target:
        return {"target": None, "target_progress": None, "target_missing": None,
                "target_reached_at": None, "target_eta": None, "projected_day": None}

    reached_at = None
    if total >= target:
        same_day = previous.get("date") == now.date().isoformat()
        reached_at = (previous.get("target_reached_at") if same_day else None) or now.strftime("%H:%M")

    projected = eta = None
    if past:
        def usual_by(hour, minute):
            return mean(taken_by(d["hours"], hour, minute) for d in past)
        day = mean(d["total"] for d in past)
        now_share = usual_by(now.hour, now.minute)
        if day > 0 and now_share >= day * 0.1 and total > 0:
            projected = round(total * day / now_share)
            if reached_at is None and projected >= target:
                for step in range(5, 16 * 60, 5):  # look ahead in five-minute steps
                    minutes = now.hour * 60 + now.minute + step
                    if minutes >= 24 * 60:
                        break
                    if total * usual_by(minutes // 60, minutes % 60) / now_share >= target:
                        eta = f"{minutes // 60:02d}:{minutes % 60:02d}"
                        break

    return {
        "target": target,
        "target_progress": round(min(total / target, 1.0), 3),
        "target_missing": max(target - total, 0),
        "target_reached_at": reached_at,
        "target_eta": eta,
        "projected_day": projected,
    }


def _records(past: list[dict], history: list[dict], total: int) -> dict:
    best_weekday = max((d["total"] for d in past), default=None)
    best_ever = max((d["total"] for d in history), default=None)
    return {
        "best_weekday": best_weekday,
        "record_weekday": best_weekday is not None and total > best_weekday,
        "best_ever": best_ever,
        "record_ever": best_ever is not None and total > best_ever,
    }


def _baskets(receipts: dict, past: list[dict]) -> dict:
    """Average receipt today against the same weekday's usual."""
    basket = round(receipts["gross"] / receipts["count"]) if receipts["count"] else None
    usual = [d["receipts"]["gross"] / d["receipts"]["count"] for d in past
             if (d.get("receipts") or {}).get("count")]
    return {
        "receipts": receipts["count"],
        "basket": basket,
        "usual_basket": round(mean(usual)) if usual else None,
        "usual_receipts": round(mean(d["receipts"]["count"] for d in past if d.get("receipts")))
        if any(d.get("receipts") for d in past) else None,
    }


def _top(products: dict[str, dict], count: int) -> list[dict]:
    """Today's best sellers by number sold, with what they brought in."""
    ranked = sorted(products.items(), key=lambda item: (item[1]["count"], item[1]["gross"]), reverse=True)
    return [{"name": name, "count": p["count"], "gross": p["gross"]}
            for name, p in ranked[:count] if p["count"] > 0]


def _week(history: list[dict], today: date, total: int) -> dict:
    """This week so far, day by day, against the same days last week."""
    totals = {d["date"]: d["total"] for d in history}
    totals[today.isoformat()] = total
    monday = today - timedelta(days=today.weekday())
    days = []
    for offset in range(today.weekday() + 1):
        day = monday + timedelta(days=offset)
        if day.weekday() in CLOSED_WEEKDAYS:
            continue
        days.append({
            "date": day.isoformat(),
            "weekday": day.weekday(),
            "total": totals.get(day.isoformat()),
            "last_week": totals.get((day - timedelta(days=7)).isoformat()),
        })
    return {
        "days": days,
        "total": sum(d["total"] or 0 for d in days),
        "last_week": sum(d["last_week"] or 0 for d in days),
    }


def _month(history: list[dict], today: date, total: int) -> dict:
    """The month so far against the break-even for the whole month."""
    prefix = today.isoformat()[:7]
    days = [d["total"] for d in history if d["date"].startswith(prefix)] + ([total] if total else [])
    target = daily_target()
    return {
        "total": sum(days),
        "open_days": len(days),
        "average_day": round(mean(days)) if days else None,
        "target": target * settings.month_open_days if target else None,
        "target_to_date": target * len(days) if target else None,
    }


async def _forecasts(history: list[dict], today: date, now: datetime,
                     hours: dict[int, int], total: int) -> dict:
    """Close finished days' forecasts, replay any day that has none, save
    today's checkpoints as they come due, and forecast from right now."""
    open_days = [d for d in history if d["weekday"] not in CLOSED_WEEKDAYS]
    stored = {doc["date"]: doc for doc in await db.sales_forecasts.find({}, {"_id": 0}).to_list(None)}
    actual = {d["date"]: d["total"] for d in history}

    # Past days: fill in the actual total, or replay the day from scratch with
    # only what was known before it, so the history isn't empty on day one.
    closed = []
    for i, day in enumerate(open_days):
        doc = stored.get(day["date"])
        if doc is None:
            calibration = forecasts.calibrate(closed)
            checkpoints = {str(cp): forecasts.checkpoint(day["hours"], cp, open_days[:i],
                                                         day["weekday"], calibration)
                           for cp in forecasts.CHECKPOINTS}
            doc = {"date": day["date"], "weekday": day["weekday"], "backtest": True,
                   "checkpoints": {k: v for k, v in checkpoints.items() if v}}
        if doc.get("actual") != actual[day["date"]] or day["date"] not in stored:
            doc["actual"] = actual[day["date"]]
            await db.sales_forecasts.replace_one({"date": doc["date"]}, doc, upsert=True)
        closed.append(doc)

    calibration = forecasts.calibrate(closed)
    if today.weekday() in CLOSED_WEEKDAYS:
        return {"forecast": None, "checkpoints": {}}

    today_doc = stored.get(today.isoformat()) or {
        "date": today.isoformat(), "weekday": today.weekday(), "backtest": False,
        "checkpoints": {}, "actual": None}
    for cp in forecasts.CHECKPOINTS:
        if now.hour >= cp and str(cp) not in today_doc["checkpoints"]:
            result = forecasts.checkpoint(hours, cp, open_days, today.weekday(), calibration)
            if result:
                result["made_at"] = now.isoformat(timespec="minutes")
                # Saved after the checkpoint's hour (the server was off, say):
                # still computed from the hours before it, but shown as late.
                result["late"] = now.hour > cp
                today_doc["checkpoints"][str(cp)] = result
    await db.sales_forecasts.replace_one({"date": today_doc["date"]}, today_doc, upsert=True)

    reference, basis = forecasts.reference_days(open_days, today.weekday())
    current = forecasts.estimate(
        total, now.hour, now.minute, reference,
        forecasts.weight_at(now.hour, now.minute, calibration["weights"]),
        forecasts.spread_at(now.hour, now.minute, calibration["spreads"]),
        calibration["levels"][forecasts.CHECKPOINTS[0]])
    if current:
        current["basis"] = basis
    return {"forecast": current, "checkpoints": today_doc["checkpoints"]}


async def dashboard() -> dict:
    """The summary plus the forecast scorecard, for the admin dashboard."""
    summary = await db.live_sales.find_one({"_id": "current"}, {"_id": 0})
    docs = await db.sales_forecasts.find(
        {"actual": {"$ne": None}}, {"_id": 0}).sort("date", -1).to_list(HISTORY_DAYS)
    history = []
    for doc in docs:
        history.append({
            "date": doc["date"],
            "weekday": doc["weekday"],
            "actual": doc["actual"],
            "replayed": doc.get("backtest", False),
            "checkpoints": {cp: {"value": c["value"], "low": c["low"], "high": c["high"],
                                 "error_pct": forecasts.error_pct(c["value"], doc["actual"])}
                            for cp, c in doc["checkpoints"].items()},
        })
    accuracy = {}
    for cp in forecasts.CHECKPOINTS:
        errors = [h["checkpoints"][str(cp)]["error_pct"] for h in history if str(cp) in h["checkpoints"]]
        recent = errors[:7]
        accuracy[str(cp)] = {
            "days": len(errors),
            "mean_abs_error": round(mean(abs(e) for e in errors), 1) if errors else None,
            "bias": round(mean(errors), 1) if errors else None,
            "last_week_abs_error": round(mean(abs(e) for e in recent), 1) if recent else None,
            "within_range": sum(1 for h in history if str(cp) in h["checkpoints"]
                                and h["checkpoints"][str(cp)]["low"] <= h["actual"]
                                <= h["checkpoints"][str(cp)]["high"]),
        }
    return {"summary": summary, "forecast_history": history, "accuracy": accuracy}


def _polling_time(now: datetime) -> bool:
    return now.weekday() not in CLOSED_WEEKDAYS and POLL_FROM <= now.hour < POLL_UNTIL


async def run_forever() -> None:
    """Poll on a fixed interval. One failed run is logged and the next tries
    again; nothing here may take the API down with it."""
    first = True
    while True:
        if first or _polling_time(datetime.now(CAFE_TZ)):
            try:
                async with _lock:
                    summary = await refresh()
                logger.info("live sales: %s Ft, %s%% vs %s earlier days",
                            summary["total"], summary["diff_pct"], summary["compared_days"])
            except (FruitsysError, httpx.HTTPError, ValueError) as exc:
                logger.warning("live sales refresh failed: %s", exc)
            except Exception:
                logger.exception("live sales refresh crashed")
        first = False
        await asyncio.sleep(max(settings.live_sales_every_min, 5) * 60)

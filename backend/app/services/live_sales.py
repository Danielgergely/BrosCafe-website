"""Today's takings against an ordinary day like it, for the phone widget.

Every LIVE_SALES_EVERY_MIN minutes during opening hours the backend asks
Fruitsys for today's takings per hour and stores one small summary, which
GET /api/live-sales hands to the widget. The comparison is with the same
weekday on earlier weeks, up to the same minute: at 10:20 on a Friday, today
so far against what earlier Fridays had taken by 10:20.

Fruitsys only reports by clock hour, so "by 10:20" counts earlier Fridays'
10:00–11:00 takings at twenty sixtieths. Closed days never change, so each is
fetched once and kept in `sales_days`; a run after that costs a login, the
month's workday list and today's hours — a few kilobytes.

The loop runs inside the API process. That is fine with the single uvicorn
worker the Dockerfile starts; more workers would each poll.
"""
import asyncio
import logging
from datetime import date, datetime

import httpx

from app import db
from app.config import CAFE_TZ, settings
from app.services.fruitsys import Fruitsys, FruitsysError

logger = logging.getLogger(__name__)

# Poll only while the café could be taking money: Monday to Saturday, 06:00 to
# 20:00 café time. Outside that the last summary simply stays where it was.
POLL_FROM, POLL_UNTIL = 6, 20
CLOSED_WEEKDAYS = {6}  # Sunday
# How far back the first run looks for history, in months.
BACKFILL_MONTHS = 24


def _months_back(today: date, count: int):
    year, month = today.year, today.month
    for _ in range(count):
        yield year, month
        month -= 1
        if month == 0:
            year, month = year - 1, 12


def taken_by(hours: dict, hour: int, minute: int) -> float:
    """What a day had taken by hour:minute, counting the current hour pro rata."""
    hours = {int(h): v for h, v in hours.items()}
    return sum(v for h, v in hours.items() if h < hour) + hours.get(hour, 0) * minute / 60


async def _sync_past_days(client: Fruitsys, today: date) -> None:
    """Store every closed workday's hours that isn't stored yet."""
    known = set(await db.sales_days.distinct("date"))
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
            }}, upsert=True)
            known.add(day)


async def refresh() -> dict:
    now = datetime.now(CAFE_TZ)
    today = now.date()
    async with Fruitsys(settings.fruitsys_user, settings.fruitsys_password) as client:
        await _sync_past_days(client, today)
        hours: dict[int, int] = {}
        sold: dict[str, int] = {}
        for workday in await client.workdays(today.year, today.month):
            if workday["opened_at"][:10] == today.isoformat():
                for hour, amount in (await client.hourly(workday["id"])).items():
                    hours[hour] = hours.get(hour, 0) + amount
                for product in await client.products(workday["id"]):
                    sold[product["name"]] = sold.get(product["name"], 0) + product["count"]

    past = await db.sales_days.find(
        {"weekday": today.weekday(), "date": {"$lt": today.isoformat()}}, {"_id": 0}).to_list(None)
    best_ever = await db.sales_days.find_one(
        {"date": {"$lt": today.isoformat()}}, {"_id": 0, "total": 1, "date": 1}, sort=[("total", -1)])
    previous = await db.live_sales.find_one({"_id": "current"}) or {}
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
        **_records(past, best_ever, total),
        "top_product": _top(sold),
    }
    await db.live_sales.replace_one({"_id": "current"}, summary, upsert=True)
    return summary


def _comparison(past: list[dict], total: int, now: datetime) -> dict:
    """Today against the same weekday on earlier weeks, and that weekday's
    usual takings per hour (the line behind the widget's bars)."""
    if not past:
        return {"average_so_far": None, "average_day": None, "diff_pct": None, "average_hours": {}}
    so_far = sum(taken_by(d["hours"], now.hour, now.minute) for d in past) / len(past)
    day = sum(d["total"] for d in past) / len(past)
    hours = sorted({int(h) for d in past for h in d["hours"]})
    return {
        "average_so_far": round(so_far),
        "average_day": round(day),
        "diff_pct": round((total - so_far) / so_far * 100, 1) if so_far > 0 else None,
        "average_hours": {str(h): round(sum(d["hours"].get(str(h), 0) for d in past) / len(past))
                          for h in hours},
    }


def _target(total: int, now: datetime, past: list[dict], previous: dict) -> dict:
    """Progress to the day's break-even, and when today should reach it.

    The forecast scales today by how an ordinary day of this weekday fills up:
    if earlier Fridays had taken 40% of their day by now, today's takings so
    far are 40% of today. Before a tenth of the usual day is in, that guess is
    too noisy to show.
    """
    target = round(settings.break_even_net_ft * settings.gross_per_net)
    if target <= 0:
        return {"target": None, "target_progress": None, "target_missing": None,
                "target_reached_at": None, "target_eta": None, "projected_day": None}

    reached_at = None
    if total >= target:
        same_day = previous.get("date") == now.date().isoformat()
        reached_at = (previous.get("target_reached_at") if same_day else None) or now.strftime("%H:%M")

    projected = eta = None
    if past:
        def usual_by(hour, minute):
            return sum(taken_by(d["hours"], hour, minute) for d in past) / len(past)
        day = sum(d["total"] for d in past) / len(past)
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


def _records(past: list[dict], best_ever: dict | None, total: int) -> dict:
    best_weekday = max((d["total"] for d in past), default=None)
    return {
        "best_weekday": best_weekday,
        "record_weekday": best_weekday is not None and total > best_weekday,
        "best_ever": best_ever["total"] if best_ever else None,
        "record_ever": bool(best_ever) and total > best_ever["total"],
    }


def _top(sold: dict[str, int]) -> dict | None:
    if not sold:
        return None
    name, count = max(sold.items(), key=lambda item: item[1])
    return {"name": name, "count": count}


def _polling_time(now: datetime) -> bool:
    return now.weekday() not in CLOSED_WEEKDAYS and POLL_FROM <= now.hour < POLL_UNTIL


async def run_forever() -> None:
    """Poll on a fixed interval. One failed run is logged and the next tries
    again; nothing here may take the API down with it."""
    first = True
    while True:
        if first or _polling_time(datetime.now(CAFE_TZ)):
            try:
                summary = await refresh()
                logger.info("live sales: %s Ft, %s%% vs %s earlier days",
                            summary["total"], summary["diff_pct"], summary["compared_days"])
            except (FruitsysError, httpx.HTTPError, ValueError) as exc:
                logger.warning("live sales refresh failed: %s", exc)
            except Exception:
                logger.exception("live sales refresh crashed")
        first = False
        await asyncio.sleep(max(settings.live_sales_every_min, 5) * 60)

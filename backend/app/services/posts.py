"""Did an Instagram post bring people in? Posts are flagged by hand on the
dashboard (date, optionally the time and what it was); this measures the
takings after each one against ordinary days like them.

The window is the rest of the post's day from its hour (the whole day if no
time was given) plus the next open day. Each window day is compared with the
same hours on the same weekday a week before and a week after — before and
after, so a café that grows every week doesn't make every post look like a
success. Until the week after exists, the result is provisional and leans on
the week before alone (and so flatters the post a little). Comparison days
that are holidays, marked unusual or inside another post's window are
skipped in favour of two weeks away; window days that are themselves
holidays or unusual aren't measured at all.

One post says little: a single day swings ±20% on its own. The average over
many finished posts is the figure to watch.

Pure functions, like services/forecasts.py.
"""
from datetime import date, timedelta
from statistics import mean

from app.services.daytypes import NORMAL

# How many open days after the post day count as part of its effect.
DAYS_AFTER = 1
# How far to look for an ordinary comparison day, in weeks either side.
MAX_WEEKS = 2


def _from_hour(hours: dict, hour: int) -> float:
    return sum(v for h, v in hours.items() if int(h) >= hour)


def _window(post: dict, days: dict[str, dict]) -> list[tuple[str, int]]:
    """[(date, from hour)]: the post day, then the next open days (a post on
    a closed Sunday counts from Monday)."""
    hour = int(post["time"][:2]) if post.get("time") else 0
    window = [(post["date"], hour)] if post["date"] in days else []
    later = sorted(d for d in days if d > post["date"])
    window += [(d, 0) for d in later[:DAYS_AFTER]
               if date.fromisoformat(d) - date.fromisoformat(post["date"]) <= timedelta(days=3)]
    return window


def effect(post: dict, days: dict[str, dict], blocked: set[str]) -> dict:
    """The takings after one post against ordinary days like them.

    `days` is {date: {"hours", "kind"}} for every day with takings (today
    included, so far); `blocked` the dates inside any post's window.
    """
    actual = expected = 0.0
    compared, measured, provisional = [], [], False
    for day, hour in _window(post, days):
        if days[day].get("kind", NORMAL) != NORMAL:
            continue
        when = date.fromisoformat(day)
        sides = []
        for direction in (-1, 1):
            for weeks in range(1, MAX_WEEKS + 1):
                other = (when + timedelta(weeks=weeks * direction)).isoformat()
                doc = days.get(other)
                if doc and doc.get("kind", NORMAL) == NORMAL and other not in blocked:
                    sides.append(other)
                    break
            else:
                if direction == 1:
                    provisional = True
        if not sides:
            continue
        actual += _from_hour(days[day]["hours"], hour)
        expected += mean(_from_hour(days[other]["hours"], hour) for other in sides)
        compared += sides
        measured.append(day)
    return {
        **post,
        "measured_days": measured,
        "compared_days": compared,
        "actual": round(actual),
        "expected": round(expected),
        "lift_pct": round((actual - expected) / expected * 100, 1) if expected else None,
        "provisional": provisional,
    }


def effects(posts: list[dict], days: dict[str, dict]) -> dict:
    """Every post's effect, newest first, and the average over finished ones."""
    blocked = {day for post in posts for day, _ in _window(post, days)}
    results = [effect(post, days, blocked) for post in sorted(posts, key=lambda p: p["date"], reverse=True)]
    finished = [r["lift_pct"] for r in results if r["lift_pct"] is not None and not r["provisional"]]
    return {
        "posts": results,
        "average_lift_pct": round(mean(finished), 1) if finished else None,
        "finished": len(finished),
    }

"""Forecasting the day's takings, and keeping score of how well it went.

Two estimates of the final total, blended:

  pace     today so far, scaled by how much of an ordinary day is usually in
           by now — at 12:00 on a Friday, if earlier Fridays had taken 40% of
           their day, today's takings so far are taken as 40% of today
  average  the ordinary day's total, ignoring today

Pace knows about today but is jumpy early on; the average is steady but
blind to an unusual day. So the blend leans on the average in the morning and
on pace later: `weight` is the share given to pace.

At 9:00, 12:00 and 15:00 the forecast is saved, and once the day is over its
actual total is filled in. Those scores are the learning: `calibrate` picks,
per checkpoint, the weight that would have been closest on the days so far,
and the spread of past errors becomes the range shown around a forecast.
A third correction handles growth: a young café sells more each week, so an
average of earlier weeks runs behind. `level` is how far recent finished days
came in above (or below) that average, and scales the average part only —
pace already measures today's level, and correcting it too overshoots.
With a few weeks of data that is all the learning the numbers can carry —
anything cleverer would memorise noise.

Holidays and other odd days (services/daytypes.py) are compared with days
like them and never learnt from: each day in `history` and each forecast
document may carry a "kind", and only "normal" ones feed the averages of
ordinary days and the calibration.

Pure functions only: no database, no network, so they can be checked against
the stored history directly.
"""
from statistics import mean

from app.services.daytypes import HOLIDAY, MIN_HOLIDAYS, NORMAL, WORKDAY_SATURDAY

SATURDAY = 5

CHECKPOINTS = (9, 12, 15)
# Before there is enough history to calibrate: lean on the average early.
DEFAULT_WEIGHTS = {9: 0.3, 12: 0.6, 15: 0.85}
# Range around a forecast, as a fraction, until past errors say otherwise.
DEFAULT_SPREAD = {9: 0.25, 12: 0.15, 15: 0.10}
MIN_DAYS_TO_CALIBRATE = 8
MIN_DAYS_FOR_SPREAD = 5
# The level correction looks at this many most recent finished days, so it
# follows the café's current trend rather than its opening weeks.
LEVEL_WINDOW = 10


def taken_by(hours: dict, hour: int, minute: int = 0) -> float:
    """What a day had taken by hour:minute, counting the current hour pro rata
    (Fruitsys reports by clock hour)."""
    hours = {int(h): v for h, v in hours.items()}
    return sum(v for h, v in hours.items() if h < hour) + hours.get(hour, 0) * minute / 60


def _normal(day: dict) -> bool:
    return day.get("kind", NORMAL) == NORMAL


def reference_days(history: list[dict], weekday: int, kind: str = NORMAL) -> tuple[list[dict], str]:
    """The days to compare with, and which they are ("weekday", "holidays",
    "saturdays", "weekdays" or "all"):

      holiday           earlier holidays once there are MIN_HOLIDAYS, else
                        ordinary Saturdays
      workday_saturday  ordinary Monday-to-Friday days
      anything else     ordinary days of the same weekday

    falling back to all ordinary days, then to every day.
    """
    normal = [d for d in history if _normal(d)]
    if kind == HOLIDAY:
        earlier = [d for d in history if d.get("kind") == HOLIDAY]
        if len(earlier) >= MIN_HOLIDAYS:
            return earlier, "holidays"
        saturdays = [d for d in normal if d["weekday"] == SATURDAY]
        if saturdays:
            return saturdays, "saturdays"
    elif kind == WORKDAY_SATURDAY:
        weekdays = [d for d in normal if d["weekday"] < SATURDAY]
        if weekdays:
            return weekdays, "weekdays"
    else:
        same = [d for d in normal if d["weekday"] == weekday]
        if same:
            return same, "weekday"
    return (normal, "all") if normal else (history, "all")


def estimate(so_far: float, hour: int, minute: int, reference: list[dict],
             weight: float, spread: float, level: float = 1.0) -> dict | None:
    if not reference:
        return None
    usual_day = mean(d["total"] for d in reference)
    usual_by = mean(taken_by(d["hours"], hour, minute) for d in reference)
    # Until a twentieth of a usual day is in (a Saturday opening at nine, say),
    # today has said nothing yet and pace would only drag the forecast to 0.
    pace = so_far * usual_day / usual_by if usual_by >= usual_day * 0.05 else None
    expected = usual_day * level
    value = expected if pace is None else weight * pace + (1 - weight) * expected
    return {
        "value": round(value),
        "low": round(value * (1 - spread)),
        "high": round(value * (1 + spread)),
        "pace": round(pace) if pace is not None else None,
        "average": round(usual_day),
        "expected": round(expected),
        "weight": round(weight, 2),
        "level": round(level, 3),
        "so_far": round(so_far),
    }


def _interpolate(hour: float, points: list[tuple[float, float]]) -> float:
    if hour <= points[0][0]:
        return points[0][1]
    for (h0, v0), (h1, v1) in zip(points, points[1:]):
        if hour <= h1:
            return v0 + (v1 - v0) * (hour - h0) / (h1 - h0)
    return points[-1][1]


def weight_at(hour: int, minute: int, weights: dict) -> float:
    """Pace weight between checkpoints: little before opening's rush, all of
    it by closing time."""
    points = [(7, 0.1)] + [(cp, weights[cp]) for cp in CHECKPOINTS] + [(19, 1.0)]
    return _interpolate(hour + minute / 60, points)


def spread_at(hour: int, minute: int, spreads: dict) -> float:
    points = [(7, spreads[CHECKPOINTS[0]] * 1.2)] + [(cp, spreads[cp]) for cp in CHECKPOINTS] \
        + [(19, spreads[CHECKPOINTS[-1]] * 0.4)]
    return _interpolate(hour + minute / 60, points)


def error_pct(predicted: float, actual: float) -> float | None:
    return round((predicted - actual) / actual * 100, 1) if actual else None


def calibrate(closed: list[dict]) -> dict:
    """Per checkpoint: the pace weight that fits the finished days best, the
    level correction from the most recent ones, and the 90th-percentile error
    left after both as the forecast range (90th percentile, at least the default).

    `closed` is forecast documents with an actual total, in date order;
    only ordinary days count. Returns {"weights", "spreads", "levels", "days"} — defaults wherever the
    data is too thin.
    """
    weights, spreads, days = dict(DEFAULT_WEIGHTS), dict(DEFAULT_SPREAD), {}
    closed = sorted((doc for doc in closed if _normal(doc)), key=lambda doc: doc["date"])
    # Growth: recent days against the plain average they were compared with.
    recent_days = [(doc["checkpoints"][str(CHECKPOINTS[0])]["average"], doc["actual"])
                   for doc in closed if doc.get("actual")
                   and (doc.get("checkpoints") or {}).get(str(CHECKPOINTS[0]))][-LEVEL_WINDOW:]
    level = mean(actual / average for average, actual in recent_days) \
        if len(recent_days) >= MIN_DAYS_FOR_SPREAD else 1.0
    levels = {cp: level for cp in CHECKPOINTS}
    for cp in CHECKPOINTS:
        rows = [(doc["checkpoints"][str(cp)], doc["actual"]) for doc in closed
                if doc.get("actual") and (doc.get("checkpoints") or {}).get(str(cp))]
        rows = [(c["pace"], c["average"], actual) for c, actual in rows if c.get("pace") is not None]
        days[cp] = len(rows)
        if len(rows) < MIN_DAYS_FOR_SPREAD:
            continue
        def forecast(w, p, a):
            return w * p + (1 - w) * a * level
        if len(rows) >= MIN_DAYS_TO_CALIBRATE:
            def miss(w):
                return mean(abs(forecast(w, p, a) - actual) / actual for p, a, actual in rows)
            weights[cp] = min((step / 20 for step in range(21)), key=miss)
        w = weights[cp]
        # The 90th-percentile miss, never narrower than the default: with a
        # few weeks of days, a tighter range would claim more than we know.
        errors = sorted(abs(forecast(w, p, a) - actual) / actual for p, a, actual in rows[-LEVEL_WINDOW:])
        spreads[cp] = max(errors[int(0.9 * (len(errors) - 1))], DEFAULT_SPREAD[cp])
    return {"weights": weights, "spreads": spreads, "levels": levels, "days": days}


def checkpoint(day_hours: dict, cp: int, history: list[dict], weekday: int,
               calibration: dict, kind: str = NORMAL) -> dict | None:
    """The forecast as it would have been made at cp:00 — only hours before
    the checkpoint count, so it can be replayed for past days honestly."""
    reference, basis = reference_days(history, weekday, kind)
    result = estimate(taken_by(day_hours, cp, 0), cp, 0, reference,
                      calibration["weights"][cp], calibration["spreads"][cp],
                      calibration.get("levels", {}).get(cp, 1.0))
    if result:
        result["basis"] = basis
        result["compared_days"] = len(reference)
    return result

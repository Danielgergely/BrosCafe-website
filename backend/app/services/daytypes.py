"""What kind of day a date is, for the sales forecasts.

An ordinary Friday is best predicted by earlier Fridays, but a public holiday
on a Friday is not: the commuter morning that makes a weekday never comes.
So each date gets a kind:

  normal            compared with the same weekday, and learnt from
  holiday           a public holiday or a day off swapped in for one (the
                    Friday after a Thursday holiday, say): compared with
                    earlier holidays once there are a few, until then with
                    Saturdays, the closest ordinary day
  workday_saturday  a Saturday that is a working day, given up for such a
                    swap: compared with ordinary Monday-to-Friday days
  unusual           marked by hand in the dashboard (an event on the street,
                    closing early): forecast like a normal day

Only normal days teach the forecasts: the others are left out of the
averages, the growth correction and the calibration, so one odd day can't
drag down the next few weeks.

The calendar is the `holidays` package, which follows the government's
yearly decree on swapped days.

`context` adds what may matter but is not yet used by the forecasts — school
breaks, days since payday, summer time — so it can be tested against the
takings once there are a few months of them.
"""
import re
from datetime import date, datetime, time, timedelta
from functools import lru_cache

import holidays

NORMAL, HOLIDAY, WORKDAY_SATURDAY, UNUSUAL = "normal", "holiday", "workday_saturday", "unusual"
# How many earlier holidays it takes before holidays are compared only with
# each other rather than with Saturdays.
MIN_HOLIDAYS = 3
_SWAPPED_FROM = re.compile(r"(\d{2})/(\d{2})/(\d{4})")

# School breaks from the yearly decree on the school year ("a tanév rendje",
# published each summer): (first day off, last day off, kind). Add the next
# school year when it is out; until then later dates simply have no break.
# The summer break runs to 31 August unless the decree says otherwise.
SCHOOL_BREAKS = [
    ("2025-10-23", "2025-11-02", "autumn"),
    ("2025-12-20", "2026-01-04", "winter"),
    ("2026-04-02", "2026-04-12", "spring"),
    ("2026-06-20", "2026-08-31", "summer"),
    ("2026-10-23", "2026-11-01", "autumn"),
    ("2026-12-19", "2027-01-03", "winter"),
    ("2027-03-25", "2027-04-04", "spring"),
    ("2027-06-19", "2027-08-31", "summer"),
]
# Wages are due by the 10th of the following month (Mt. 157. §); when that
# isn't a working day, most employers pay the working day before.
PAYDAY = 10


@lru_cache(maxsize=16)
def _calendar(year: int) -> tuple[dict[str, dict], dict[str, str]]:
    """({date: {"name", "name_hu"}} for days off, {date: name} for working
    Saturdays) in one year."""
    english = holidays.country_holidays("HU", years=year, language="en_US")
    hungarian = holidays.country_holidays("HU", years=year, language="hu")
    days_off, workdays = {}, {}
    for day, name in english.items():
        # "Day off (substituted from 01/10/2026)": that Saturday is worked.
        match = _SWAPPED_FROM.search(name)
        days_off[day.isoformat()] = {"name": "Bridge day", "name_hu": "Áthelyezett pihenőnap"} if match \
            else {"name": name, "name_hu": hungarian.get(day, name)}
        if match:
            month, dom, swapped_year = (int(g) for g in match.groups())
            workdays[date(swapped_year, month, dom).isoformat()] = "Working Saturday"
    return days_off, workdays


def day_info(day: str | date, unusual: dict[str, str] | None = None) -> dict:
    """{"kind", "name", "name_hu"} for one date. `unusual` is the days marked
    in the dashboard, {date: note}."""
    iso = day.isoformat() if isinstance(day, date) else day
    if unusual and iso in unusual:
        note = unusual[iso] or ""
        return {"kind": UNUSUAL, "name": note, "name_hu": note}
    year = int(iso[:4])
    days_off, workdays = _calendar(year)
    if iso in days_off:
        return {"kind": HOLIDAY, **days_off[iso]}
    # The day off a Saturday is worked for can fall in the next or the
    # previous year (a December Saturday for 2 January, say).
    for calendar_year in (year - 1, year, year + 1):
        if iso in _calendar(calendar_year)[1]:
            return {"kind": WORKDAY_SATURDAY, "name": "Working Saturday", "name_hu": "Áthelyezett munkanap"}
    return {"kind": NORMAL, "name": None, "name_hu": None}



def _working_day(day: date) -> bool:
    kind = day_info(day)["kind"]
    return kind == WORKDAY_SATURDAY or (day.weekday() < 5 and kind != HOLIDAY)


def payday(year: int, month: int) -> date:
    day = date(year, month, PAYDAY)
    while not _working_day(day):
        day -= timedelta(days=1)
    return day


def context(day: str | date, tz) -> dict:
    """What else was going on: {"school_break": "autumn" | … | None,
    "days_since_payday": 0 on payday, "summer_time": bool}."""
    day = date.fromisoformat(day) if isinstance(day, str) else day
    iso = day.isoformat()
    school_break = next((kind for first, last, kind in SCHOOL_BREAKS if first <= iso <= last), None)
    paid = payday(day.year, day.month)
    if paid > day:
        previous = day.replace(day=1) - timedelta(days=1)
        paid = payday(previous.year, previous.month)
    noon = datetime.combine(day, time(12), tz)
    return {
        "school_break": school_break,
        "days_since_payday": (day - paid).days,
        "summer_time": bool(noon.dst()),
    }

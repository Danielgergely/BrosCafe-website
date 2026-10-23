"""The weather at the café, kept beside each day's takings.

From Open-Meteo (free, no key). Its forecast API also serves the recent past,
as its best estimate of what happened; older days come from its archive.

For now the weather is collected and shown, not used: with a few weeks of
days, any "rain costs 12%" would be noise. Once there are a few months,
check against `sales_days` whether it improves the forecasts (walk-forward,
as with the rest of services/forecasts.py) before letting it in. That is
also why each checkpoint forecast keeps the weather *forecast* it was made
with: a model can only use what was known at the time.
"""
from datetime import date, datetime, timedelta

import httpx

from app.config import CAFE_TZ, settings

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
HOURLY = "temperature_2m,apparent_temperature,precipitation,weather_code,cloud_cover"
DAILY = "sunset,daylight_duration"
# The forecast API reaches this many days back; earlier comes from the archive.
FORECAST_PAST_DAYS = 90
# The hours the day's summary covers: roughly when the café takes money.
OPEN_FROM, OPEN_UNTIL = 7, 18
RAIN_MM = 0.1  # an hour with at least this much counts as rainy


def _number(value) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


async def hourly(start: date, end: date) -> dict[str, dict]:
    """{date: {"hours": {hour: {"temp", "feels", "rain", "code", "cloud"}},
    "sunset": "17:52", "daylight_h": 10.4}} for the days from start to end,
    café time."""
    today = datetime.now(CAFE_TZ).date()
    split = today - timedelta(days=FORECAST_PAST_DAYS - 1)
    ranges = []
    if start < split:
        ranges.append((ARCHIVE_URL, start, min(end, split - timedelta(days=1))))
    if end >= split:
        ranges.append((FORECAST_URL, max(start, split), end))
    days: dict[str, dict] = {}
    async with httpx.AsyncClient(timeout=20) as http:
        for url, first, last in ranges:
            response = await http.get(url, params={
                "latitude": settings.weather_lat, "longitude": settings.weather_lon,
                "hourly": HOURLY, "daily": DAILY, "timezone": str(CAFE_TZ),
                "start_date": first.isoformat(), "end_date": last.isoformat()})
            response.raise_for_status()
            data = response.json().get("hourly") or {}
            columns = {key: data.get(key) or [] for key in HOURLY.split(",")}
            for i, stamp in enumerate(data.get("time") or []):
                day, hour = str(stamp)[:10], str(int(str(stamp)[11:13]))
                row = {name: _number(values[i]) if i < len(values) else None
                       for name, values in zip(("temp", "feels", "rain", "code", "cloud"), columns.values())}
                if row["temp"] is not None:
                    days.setdefault(day, {"hours": {}})["hours"][hour] = row
            daily = response.json().get("daily") or {}
            for i, day in enumerate(daily.get("time") or []):
                entry = days.setdefault(str(day), {"hours": {}})
                sunsets, lengths = daily.get("sunset") or [], daily.get("daylight_duration") or []
                if i < len(sunsets) and sunsets[i]:
                    entry["sunset"] = str(sunsets[i])[11:16]
                if i < len(lengths) and _number(lengths[i]) is not None:
                    entry["daylight_h"] = round(_number(lengths[i]) / 3600, 1)
    return days


def summarise(day: dict) -> dict | None:
    """One day's weather over the opening hours: mean and highest temperature,
    rain in mm and in rainy hours, the worst WMO weather code, mean cloud;
    and the sunset and length of daylight."""
    hours = day.get("hours") or {}
    rows = [row for hour, row in hours.items() if OPEN_FROM <= int(hour) < OPEN_UNTIL]
    if not rows:
        return None

    def values(key):
        return [row[key] for row in rows if row.get(key) is not None]

    temps, rain = values("temp"), values("rain")
    return {
        "temp": round(sum(temps) / len(temps), 1),
        "temp_max": round(max(temps), 1),
        "feels": round(sum(values("feels")) / len(values("feels")), 1) if values("feels") else None,
        "rain_mm": round(sum(rain), 1),
        "rain_hours": sum(1 for mm in rain if mm >= RAIN_MM),
        # WMO codes rise with severity: 0 clear … 3 overcast, 45 fog,
        # 51+ drizzle, 61+ rain, 71+ snow, 95+ thunderstorm.
        "code": int(max(values("code"))) if values("code") else None,
        "cloud": round(sum(values("cloud")) / len(values("cloud"))) if values("cloud") else None,
        "sunset": day.get("sunset"),
        "daylight_h": day.get("daylight_h"),
        "hours": {hour: hours[hour] for hour in sorted(hours, key=int)
                  if OPEN_FROM <= int(hour) < OPEN_UNTIL},
    }

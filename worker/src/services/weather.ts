// The weather at the café, kept beside each day's takings. Port of backend/app/services/weather.py.
// From Open-Meteo (free, no key): its forecast API also serves the recent past, older days come from its archive.
// Collected and shown, not used by the forecasts yet.
import { settings } from '../config';
import type { App } from '../http';
import { localParts } from '../util';
import { addDays } from './daytypes';
import { fsum, pyRound } from './forecasts';
import { httpFetch, jsonOf, pyFloat, raiseForStatus } from './fruitsys';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const HOURLY = 'temperature_2m,apparent_temperature,precipitation,weather_code,cloud_cover';
const DAILY = 'sunset,daylight_duration';
const FORECAST_PAST_DAYS = 90;
const OPEN_FROM = 7;
const OPEN_UNTIL = 18;
const RAIN_MM = 0.1;

type Row = Record<string, number | null>;
export interface WeatherDay { hours: Record<string, Row>; sunset?: string; daylight_h?: number }

function num(value: unknown): number | null {
  return value === null || value === undefined ? null : pyFloat(value);
}

/** {date: {hours: {hour: {temp, feels, rain, code, cloud}}, sunset, daylight_h}} for start..end (dates), café time. */
export async function hourly(app: App, start: string, end: string): Promise<Record<string, WeatherDay>> {
  const s = settings(app.env);
  const today = localParts(new Date(), s.cafe_tz).date;
  const split = addDays(today, -(FORECAST_PAST_DAYS - 1));
  const ranges: [string, string, string][] = [];
  if (start < split) {
    const before = addDays(split, -1);
    ranges.push([ARCHIVE_URL, start, end < before ? end : before]);
  }
  if (end >= split) ranges.push([FORECAST_URL, start > split ? start : split, end]);
  const days: Record<string, WeatherDay> = {};
  const names = ['temp', 'feels', 'rain', 'code', 'cloud'];
  for (const [url, first, last] of ranges) {
    const query = new URLSearchParams({
      latitude: String(s.weather_lat), longitude: String(s.weather_lon), hourly: HOURLY, daily: DAILY,
      timezone: s.cafe_tz, start_date: first, end_date: last,
    });
    const full = `${url}?${query}`;
    const res = await httpFetch(full);
    raiseForStatus(res, full);
    const body = await jsonOf(res);
    const data = body?.hourly || {};
    const columns = HOURLY.split(',').map((key) => data[key] || []);
    (data.time || []).forEach((stamp: unknown, i: number) => {
      const text = String(stamp);
      const day = text.slice(0, 10);
      // str(int(stamp[11:13])): "07" → "7"; anything else is Python's ValueError
      if (!/^\s*[+-]?\d+\s*$/.test(text.slice(11, 13))) throw new SyntaxError(`invalid literal for int(): ${text.slice(11, 13)}`);
      const hour = String(Number(text.slice(11, 13).trim()));
      const row: Row = {};
      names.forEach((name, j) => (row[name] = i < columns[j].length ? num(columns[j][i]) : null));
      if (row.temp !== null) (days[day] ??= { hours: {} }).hours[hour] = row;
    });
    const daily = body?.daily || {};
    (daily.time || []).forEach((day: unknown, i: number) => {
      const entry = (days[String(day)] ??= { hours: {} });
      const sunsets = daily.sunset || [], lengths = daily.daylight_duration || [];
      if (i < sunsets.length && sunsets[i]) entry.sunset = String(sunsets[i]).slice(11, 16);
      if (i < lengths.length && num(lengths[i]) !== null) entry.daylight_h = pyRound((num(lengths[i]) as number) / 3600, 1);
    });
  }
  return days;
}

/** One day's weather over the opening hours, or null when there are no hours for it. */
export function summarise(day: Partial<WeatherDay>): Record<string, any> | null {
  const hours = day.hours || {};
  const rows = Object.entries(hours).filter(([hour]) => OPEN_FROM <= Number(hour) && Number(hour) < OPEN_UNTIL).map(([, row]) => row);
  if (!rows.length) return null;
  const values = (key: string) => rows.filter((row) => row[key] !== null && row[key] !== undefined).map((row) => row[key] as number);
  const temps = values('temp'), rain = values('rain'), feels = values('feels'), codes = values('code'), cloud = values('cloud');
  const sorted = Object.keys(hours).sort((a, b) => Number(a) - Number(b)).filter((h) => OPEN_FROM <= Number(h) && Number(h) < OPEN_UNTIL);
  return {
    temp: pyRound(fsum(temps) / temps.length, 1),
    temp_max: pyRound(Math.max(...temps), 1),
    feels: feels.length ? pyRound(fsum(feels) / feels.length, 1) : null,
    rain_mm: pyRound(fsum(rain), 1),
    rain_hours: rain.filter((mm) => mm >= RAIN_MM).length,
    code: codes.length ? Math.trunc(Math.max(...codes)) : null,
    cloud: cloud.length ? pyRound(fsum(cloud) / cloud.length) : null,
    sunset: day.sunset ?? null,
    daylight_h: day.daylight_h ?? null,
    hours: Object.fromEntries(sorted.map((h) => [h, hours[h]])),
  };
}

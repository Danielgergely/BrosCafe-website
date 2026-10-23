import { useCallback, useEffect, useState } from "react";
import { ArrowClockwise, ArrowDown, ArrowUp, Camera, Flag, Trophy } from "@phosphor-icons/react";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip,
  XAxis, YAxis,
} from "recharts";

import {
  CHART, Loading, SectionCard, axisProps, chartTooltipProps,
} from "@/features/staff/components/AdminPrimitives";
import { useI18n } from "@/i18n";
import { api, errorMessage } from "@/lib/api";
import { formatHuf } from "@/lib/format";

const CHECKPOINTS = ["9", "12", "15"];
const k = (n) => (n == null ? "–" : `${Math.round(n / 1000)}k`);
const signed = (n, digits = 1) =>
  n == null ? "–" : `${n >= 0 ? "+" : ""}${n.toLocaleString("hu-HU", { maximumFractionDigits: digits })}%`;

// WMO weather codes, roughly: 0–1 clear, 2 partly cloudy, 3 overcast, 45–48
// fog, 51–67 and 80–82 rain, 71–77 and 85–86 snow, 95+ thunderstorm.
function weatherIcon(code) {
  if (code == null) return "";
  if (code >= 95) return "⛈️";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "🌨️";
  if (code >= 51) return "🌧️";
  if (code >= 45) return "🌫️";
  if (code === 3) return "☁️";
  if (code === 2) return "⛅";
  return "☀️";
}

function WeatherChip({ weather, t }) {
  if (!weather) return null;
  return (
    <span className="whitespace-nowrap" title={t("admin.live.weather")}>
      {weatherIcon(weather.code)} {Math.round(weather.temp)}°
      <span className="text-muted">
        {" · "}{weather.rain_mm > 0 ? t("admin.live.rain", { mm: weather.rain_mm }) : t("admin.live.dry")}
      </span>
    </span>
  );
}

// Payday is worth pointing out only for the few days after it.
const PAYDAY_DAYS = 3;

/** School break, payday and sunset: shown beside the figures, not yet used by the forecasts. */
function contextLabels(context, weather, t) {
  const labels = [];
  if (context?.school_break) {
    labels.push({ icon: "🎒", text: t(`admin.live.schoolBreak.${context.school_break}`) });
  }
  if (context?.days_since_payday === 0) labels.push({ icon: "💰", text: t("admin.live.payday") });
  else if (context?.days_since_payday <= PAYDAY_DAYS) {
    labels.push({ icon: "💰", text: t("admin.live.afterPayday", { n: context.days_since_payday }) });
  }
  if (weather?.sunset) labels.push({ icon: "🌇", text: t("admin.live.sunset", { time: weather.sunset }) });
  return labels;
}

const dayName = (day, lang) => (lang === "hu" ? day?.name_hu : day?.name) || day?.name || "";

/** A holiday, working Saturday or day marked unusual: what it's compared with. */
function DayBanner({ day, lang, t, onUnmark }) {
  if (!day || day.kind === "normal") return null;
  const name = dayName(day, lang);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-olive/40 bg-cream px-4 py-3 text-sm" data-testid="live-day-kind">
      <p className="text-ink">
        <span className="font-semibold">{t(`admin.live.dayKind.${day.kind}`)}{name ? `: ${name}` : ""}</span>
        <span className="ml-2 text-muted">{t(`admin.live.dayNote.${day.kind}`)}</span>
      </p>
      {day.kind === "unusual" && (
        <button type="button" onClick={onUnmark} className="text-xs font-semibold text-olive underline">
          {t("admin.live.unmarkUnusual")}
        </button>
      )}
    </div>
  );
}

function Tile({ label, value, children, testId }) {
  return (
    <div className="rounded-card border border-line bg-white p-4" data-testid={testId}>
      <p className="text-[11px] font-semibold uppercase tracking-label text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl text-ink">{value}</p>
      {children && <div className="mt-1 text-xs text-muted">{children}</div>}
    </div>
  );
}

function Change({ pct }) {
  if (pct == null) return null;
  const up = pct >= 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold ${up ? "text-olive" : "text-alert"}`}>
      <Icon size={12} weight="bold" /> {signed(pct)}
    </span>
  );
}

function ProgressBar({ value }) {
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-cream-dark">
      <div className="h-full rounded-full bg-olive" style={{ width: `${Math.min(value, 1) * 100}%` }} />
    </div>
  );
}

/** Today per hour: dark bars beat the usual, light ones fell short. */
function HoursChart({ summary, t }) {
  const hours = [...Object.keys(summary.hours), ...Object.keys(summary.average_hours || {})].map(Number);
  if (!hours.length) return <p className="text-sm text-muted">{t("admin.live.noSalesYet")}</p>;
  const now = new Date(summary.updated_at).getHours();
  const rows = [];
  for (let h = Math.min(...hours); h <= Math.max(...hours); h += 1) {
    rows.push({ hour: `${h}`, h, today: summary.hours[h] ?? null, usual: summary.average_hours?.[h] ?? null });
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={CHART.line} vertical={false} />
        <XAxis dataKey="hour" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={k} width={36} />
        <Tooltip {...chartTooltipProps} formatter={(v, name) => [formatHuf(v), t(`admin.live.series.${name}`)]}
          labelFormatter={(h) => `${h}:00–${Number(h) + 1}:00`} />
        <Bar dataKey="today" radius={[4, 4, 0, 0]}>
          {rows.map((row) => (
            <Cell
              key={row.h}
              fill={row.h === now ? CHART.line : (row.today ?? 0) >= (row.usual ?? 0) ? CHART.olive : CHART.oliveSoft}
              stroke={row.h === now ? CHART.olive : undefined}
              strokeDasharray={row.h === now ? "3 2" : undefined}
            />
          ))}
        </Bar>
        <Line type="monotone" dataKey="usual" stroke={CHART.ink} strokeOpacity={0.6} strokeWidth={1.5}
          strokeDasharray="4 3" dot={{ r: 2.5, fill: CHART.ink, strokeWidth: 0 }} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function ForecastToday({ summary, t }) {
  const { forecast, checkpoints } = summary;
  return (
    <div className="space-y-4">
      {forecast && (
        <div>
          <p className="text-sm text-muted">{t("admin.live.forecastNow")}</p>
          <p className="font-display text-3xl text-ink">
            ≈ {formatHuf(forecast.value)}
          </p>
          <p className="text-sm text-muted">
            {t("admin.live.range", { low: formatHuf(forecast.low), high: formatHuf(forecast.high) })}
          </p>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {CHECKPOINTS.map((cp) => {
          const c = checkpoints?.[cp];
          return (
            <div key={cp} className="rounded-card border border-line bg-white p-3 text-center">
              <p className="text-[11px] font-semibold text-muted">{cp}:00</p>
              {c ? (
                <>
                  <p className="font-display text-xl text-ink">{k(c.value)}</p>
                  <p className="text-[11px] text-muted">{k(c.low)}–{k(c.high)}</p>
                  {c.late && <p className="mt-1 text-[10px] text-alert">{t("admin.live.late")}</p>}
                </>
              ) : (
                <p className="mt-2 text-xs text-muted">{t("admin.live.notYet")}</p>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted">{t("admin.live.forecastHow")}</p>
    </div>
  );
}

function errorClass(pct) {
  if (pct == null) return "text-muted";
  const abs = Math.abs(pct);
  return abs <= 5 ? "text-olive font-semibold" : abs <= 15 ? "text-ink" : "text-alert";
}

function Scorecard({ data, t, lang, onMark, onPost }) {
  const { accuracy, forecast_history: history } = data;
  const weekday = (iso) =>
    new Date(iso).toLocaleDateString(lang === "hu" ? "hu-HU" : "en-GB", { weekday: "short", month: "numeric", day: "numeric" });
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        {CHECKPOINTS.map((cp) => {
          const a = accuracy[cp];
          return (
            <div key={cp} className="rounded-card border border-line bg-white p-3 text-center">
              <p className="text-[11px] font-semibold text-muted">{cp}:00</p>
              <p className="font-display text-xl text-ink">±{a.mean_abs_error ?? "–"}%</p>
              <p className="text-[11px] text-muted">
                {t("admin.live.withinRange", { n: a.within_range, of: a.days })}
              </p>
              <p className="text-[11px] text-muted">{t("admin.live.lastWeek", { pct: a.last_week_abs_error ?? "–" })}</p>
            </div>
          );
        })}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="pb-2 pr-2">{t("admin.live.day")}</th>
              <th className="pb-2 pr-2 text-right">{t("admin.live.actual")}</th>
              {CHECKPOINTS.map((cp) => <th key={cp} className="pb-2 pr-2 text-right">{cp}:00</th>)}
              <th className="pb-2 pr-2">{t("admin.live.weather")}</th>
              <th className="pb-2" aria-label={t("admin.live.markUnusual")} />
            </tr>
          </thead>
          <tbody>
            {history.map((row) => {
              const kind = row.day?.kind ?? "normal";
              const name = dayName(row.day, lang);
              return (
                <tr key={row.date} className={`border-b border-line/60 ${kind === "normal" ? "" : "opacity-50"}`}>
                  <td className="py-1.5 pr-2 text-ink">
                    {weekday(row.date)}{row.replayed && <span className="text-muted"> *</span>}
                    {contextLabels(row.context, null, t).map(({ icon, text }) => (
                    <span key={icon} className="ml-1 cursor-default text-[11px]" title={text}>{icon}</span>
                  ))}
                  {kind !== "normal" && (
                      <span className="ml-1 text-[11px] text-muted" title={name}>
                        · {t(`admin.live.dayKind.${kind}`)}{name ? `: ${name}` : ""}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-ink">{k(row.actual)}</td>
                  {CHECKPOINTS.map((cp) => {
                    const c = row.checkpoints[cp];
                    return (
                      <td key={cp} className={`py-1.5 pr-2 text-right tabular-nums ${errorClass(c?.error_pct)}`}
                        title={c ? `${formatHuf(c.value)} (${formatHuf(c.low)}–${formatHuf(c.high)})` : ""}>
                        {c ? signed(c.error_pct, 0) : "–"}
                      </td>
                    );
                  })}
                  <td className="py-1.5 pr-2 text-xs"><WeatherChip weather={row.weather} t={t} /></td>
                  <td className="whitespace-nowrap py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => onPost(row.date, !row.posted)}
                      title={t(row.posted ? "admin.live.unmarkPost" : "admin.live.posted")}
                      aria-label={t(row.posted ? "admin.live.unmarkPost" : "admin.live.posted")}
                      className={`mr-2 ${row.posted ? "text-olive" : "text-muted/50 hover:text-olive"}`}
                    >
                      <Camera size={14} weight={row.posted ? "fill" : "regular"} />
                    </button>
                    {(kind === "normal" || kind === "unusual") && (
                      <button
                        type="button"
                        onClick={() => onMark(row.date, kind !== "unusual")}
                        title={t(kind === "unusual" ? "admin.live.unmarkUnusual" : "admin.live.markUnusual")}
                        aria-label={t(kind === "unusual" ? "admin.live.unmarkUnusual" : "admin.live.markUnusual")}
                        className={kind === "unusual" ? "text-olive" : "text-muted/50 hover:text-olive"}
                      >
                        <Flag size={14} weight={kind === "unusual" ? "fill" : "regular"} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">{t("admin.live.replayedNote")} {t("admin.live.notScored")}</p>
    </div>
  );
}

/** Each flagged Instagram post and the takings after it. */
function Posts({ data, t, lang }) {
  const { posts, average_lift_pct: average, finished } = data.posts ?? { posts: [] };
  const day = (iso) =>
    new Date(iso).toLocaleDateString(lang === "hu" ? "hu-HU" : "en-GB", { weekday: "short", month: "numeric", day: "numeric" });
  if (!posts.length) return <p className="text-sm text-muted">{t("admin.live.postsEmpty")}</p>;
  return (
    <div className="space-y-4">
      {average != null && (
        <div>
          <p className="font-display text-2xl text-ink">
            {t("admin.live.averageLift", { pct: signed(average) })}
          </p>
          <p className="text-xs text-muted">{t("admin.live.averageLiftNote", { n: finished })}</p>
        </div>
      )}
      <ol className="space-y-2">
        {posts.map((p) => (
          <li key={p.date} className="flex items-baseline justify-between gap-3 border-b border-line/60 pb-2 text-sm">
            <span className="min-w-0 truncate text-ink">
              <span className="mr-2 text-muted">{day(p.date)}{p.time ? ` ${p.time}` : ""}</span>
              {p.note}
            </span>
            <span className="shrink-0 text-right tabular-nums"
              title={p.lift_pct != null ? `${formatHuf(p.actual)} / ${formatHuf(p.expected)}` : ""}>
              {p.lift_pct == null ? (
                <span className="text-xs text-muted">{t("admin.live.notMeasurable")}</span>
              ) : (
                <>
                  <Change pct={p.lift_pct} />
                  {p.provisional && <span className="ml-1 text-xs text-muted">{t("admin.live.provisional")}</span>}
                </>
              )}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">{t("admin.live.postsHow")}</p>
    </div>
  );
}

function Products({ summary, t }) {
  if (!summary.products?.length) return <p className="text-sm text-muted">{t("admin.live.noSalesYet")}</p>;
  return (
    <ol className="space-y-2">
      {summary.products.map((p, i) => (
        <li key={p.name} className="flex items-baseline justify-between gap-3 border-b border-line/60 pb-2">
          <span className="min-w-0 truncate text-ink">
            <span className="mr-2 text-muted">{i + 1}.</span>{p.name}
          </span>
          <span className="shrink-0 text-right tabular-nums">
            <span className="font-semibold text-ink">{summary.products_estimated ? "≈ " : ""}{formatHuf(p.gross)}</span>
            <span className="ml-2 text-xs text-muted">
              {t("admin.live.sold", { n: p.count })}
              {summary.total ? ` · ${Math.round((p.gross / summary.total) * 100)}%` : ""}
            </span>
          </span>
        </li>
      ))}
      {summary.products_estimated && (
        <li className="pt-1 text-xs text-muted">{t("admin.live.productsEstimated")}</li>
      )}
    </ol>
  );
}

function Week({ summary, t, lang }) {
  const { week } = summary;
  const rows = week.days.map((d) => ({
    day: new Date(d.date).toLocaleDateString(lang === "hu" ? "hu-HU" : "en-GB", { weekday: "short" }),
    thisWeek: d.total,
    lastWeek: d.last_week,
  }));
  const change = week.last_week ? ((week.total - week.last_week) / week.last_week) * 100 : null;
  return (
    <div>
      <p className="text-sm text-muted">
        {formatHuf(week.total)} · {t("admin.live.vsLastWeek")} <Change pct={change} />
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={rows} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART.line} vertical={false} />
          <XAxis dataKey="day" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={k} width={36} />
          <Tooltip {...chartTooltipProps} formatter={(v, name) => [formatHuf(v), t(`admin.live.series.${name}`)]} />
          <Legend formatter={(name) => t(`admin.live.series.${name}`)} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="lastWeek" fill={CHART.oliveSoft} radius={[4, 4, 0, 0]} />
          <Bar dataKey="thisWeek" fill={CHART.olive} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Month({ summary, t }) {
  const { month } = summary;
  if (!month.target) return null;
  const ahead = month.total - month.target_to_date;
  return (
    <div className="space-y-3">
      <div>
        <p className="font-display text-2xl text-ink">
          {formatHuf(month.total)} <span className="text-base text-muted">/ {formatHuf(month.target)}</span>
        </p>
        <ProgressBar value={month.total / month.target} />
        <p className="mt-1 text-xs text-muted">{t("admin.live.monthCovered", { pct: Math.round((month.total / month.target) * 100) })}</p>
      </div>
      <p className={`text-sm font-semibold ${ahead >= 0 ? "text-olive" : "text-alert"}`}>
        {ahead >= 0
          ? t("admin.live.aheadOfBreakEven", { amount: formatHuf(ahead), days: month.open_days })
          : t("admin.live.behindBreakEven", { amount: formatHuf(-ahead), days: month.open_days })}
      </p>
      <p className="text-xs text-muted">{t("admin.live.monthAverage", { amount: formatHuf(month.average_day) })}</p>
    </div>
  );
}

/**
 * Live sales: today against an ordinary day, the forecasts and how earlier
 * ones turned out, best sellers, the week and the month. Opening it asks the
 * server for fresh figures (at most once a minute — the server enforces it).
 */
export default function LiveSalesPanel() {
  const { t, lang } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (fresh) => {
    setLoading(true);
    try {
      const { data: payload } = await api.get("/admin/live-sales", { params: { fresh } });
      setData(payload);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, t("common.somethingWrong")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load(true);
  }, [load]);

  // Mark a day unusual (asks what happened) or make it ordinary again; the
  // server refreshes today's figures straight after.
  const markDay = useCallback(async (date, unusual) => {
    let note = null;
    if (unusual) {
      note = window.prompt(t("admin.live.unusualPrompt"));
      if (note == null) return;
    }
    setLoading(true);
    try {
      if (unusual) await api.put(`/admin/live-sales/unusual/${date}`, { note });
      else await api.delete(`/admin/live-sales/unusual/${date}`);
    } catch (err) {
      setError(errorMessage(err, t("common.somethingWrong")));
    }
    await load(false);
  }, [load, t]);

  // Flag an Instagram post ("14:30 new pumpkin latte": the time is optional)
  // or remove the flag.
  const markPost = useCallback(async (date, posted) => {
    let body = null;
    if (posted) {
      const answer = window.prompt(t("admin.live.postPrompt"));
      if (answer == null) return;
      const match = answer.trim().match(/^(\d{1,2}[:.]\d{2})\s*(.*)$/);
      body = match ? { time: match[1], note: match[2] } : { time: null, note: answer.trim() };
    }
    setLoading(true);
    try {
      if (posted) await api.put(`/admin/live-sales/posts/${date}`, body);
      else await api.delete(`/admin/live-sales/posts/${date}`);
    } catch (err) {
      setError(errorMessage(err, t("common.somethingWrong")));
    }
    await load(false);
  }, [load, t]);
  const postedToday = data?.posts?.posts?.some((p) => p.date === data.summary.date);

  if (!data && error) return <p className="text-sm text-alert" data-testid="live-error">{error}</p>;
  if (!data) return <Loading />;

  const s = data.summary;
  const updated = new Date(s.updated_at);
  const reached = Boolean(s.target_reached_at);

  return (
    <div className="space-y-6" data-testid="live-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {t("admin.live.updated", { time: updated.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" }) })}
          {s.weather && <span className="ml-3 text-ink"><WeatherChip weather={s.weather} t={t} /></span>}
          {contextLabels(s.context, s.weather, t).map(({ icon, text }) => (
            <span key={icon} className="ml-3 whitespace-nowrap text-ink">{icon} {text}</span>
          ))}
          {data.refresh_failed && <span className="ml-2 text-alert">{t("admin.live.refreshFailed")}</span>}
          {error && <span className="ml-2 text-alert">{error}</span>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => markPost(s.date, !postedToday)}
            disabled={loading}
            data-testid="live-mark-post"
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors disabled:opacity-50 ${
              postedToday ? "border-olive bg-olive text-cream" : "border-line text-muted hover:border-olive hover:text-olive"}`}
          >
            <Camera size={16} weight={postedToday ? "fill" : "regular"} /> {t(postedToday ? "admin.live.posted" : "admin.live.markPost")}
          </button>
          {(s.day?.kind ?? "normal") === "normal" && (
            <button
              type="button"
              onClick={() => markDay(s.date, true)}
              disabled={loading}
              data-testid="live-mark-today"
              className="flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-muted transition-colors hover:border-olive hover:text-olive disabled:opacity-50"
            >
              <Flag size={16} /> {t("admin.live.markUnusual")}
            </button>
          )}
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading}
            data-testid="live-refresh"
            className="flex items-center gap-2 rounded-full border border-olive px-4 py-2 text-sm font-semibold text-olive transition-colors hover:bg-olive hover:text-cream disabled:opacity-50"
          >
            <ArrowClockwise size={16} className={loading ? "animate-spin" : ""} /> {t("admin.live.refresh")}
          </button>
        </div>
      </div>

      <DayBanner day={s.day} lang={lang} t={t} onUnmark={() => markDay(s.date, false)} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={t("admin.live.today")} value={formatHuf(s.total)} testId="live-total">
          <Change pct={s.diff_pct} /> {t(`admin.live.vsBasis.${s.day?.basis ?? "weekday"}`, { n: s.compared_days })}
          {(s.record_ever || s.record_weekday) && (
            <span className="ml-1 inline-flex items-center gap-0.5 font-semibold text-olive">
              <Trophy size={12} weight="fill" /> {t(s.record_ever ? "admin.live.recordEver" : "admin.live.recordWeekday")}
            </span>
          )}
        </Tile>
        <Tile label={t("admin.live.breakEven")} value={reached ? `✓ ${s.target_reached_at}` : formatHuf(s.target_missing)}>
          {reached ? t("admin.live.reached") : s.target_eta ? t("admin.live.missingEta", { time: s.target_eta }) : t("admin.live.missing")}
          {s.target && <ProgressBar value={s.target_progress} />}
          {s.target && <p className="mt-1 text-[11px]">{t("admin.live.breakEvenDay", { amount: formatHuf(s.target) })}</p>}
        </Tile>
        <Tile label={t("admin.live.forecast")} value={s.forecast ? `≈ ${k(s.forecast.value)}` : "–"}>
          {s.forecast && t("admin.live.range", { low: k(s.forecast.low), high: k(s.forecast.high) })}
        </Tile>
        <Tile label={t("admin.live.basket")} value={s.basket ? formatHuf(s.basket) : "–"}>
          {t("admin.live.receipts", { n: s.receipts })}
          {s.usual_basket && <> · {t("admin.live.usualBasket", { amount: formatHuf(s.usual_basket) })}</>}
        </Tile>
      </div>

      <SectionCard title={t("admin.live.hoursTitle")}>
        <HoursChart summary={s} t={t} />
        <p className="mt-2 text-xs text-muted">{t("admin.live.hoursLegend")}</p>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title={t("admin.live.forecastTitle")}>
          <ForecastToday summary={s} t={t} />
        </SectionCard>
        <SectionCard title={t("admin.live.productsTitle")}>
          <Products summary={s} t={t} />
        </SectionCard>
      </div>

      <SectionCard title={t("admin.live.scorecardTitle")}>
        <Scorecard data={data} t={t} lang={lang} onMark={markDay} onPost={markPost} />
      </SectionCard>

      <SectionCard title={t("admin.live.postsTitle")}>
        <Posts data={data} t={t} lang={lang} />
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title={t("admin.live.weekTitle")}>
          <Week summary={s} t={t} lang={lang} />
        </SectionCard>
        <SectionCard title={t("admin.live.monthTitle")}>
          <Month summary={s} t={t} />
        </SectionCard>
      </div>
    </div>
  );
}

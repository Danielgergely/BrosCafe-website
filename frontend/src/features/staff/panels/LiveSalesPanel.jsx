import { useCallback, useEffect, useState } from "react";
import { ArrowClockwise, ArrowDown, ArrowUp, Trophy } from "@phosphor-icons/react";
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

function Scorecard({ data, t, lang }) {
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
            </tr>
          </thead>
          <tbody>
            {history.map((row) => (
              <tr key={row.date} className="border-b border-line/60">
                <td className="py-1.5 pr-2 text-ink">
                  {weekday(row.date)}{row.replayed && <span className="text-muted"> *</span>}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">{t("admin.live.replayedNote")}</p>
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
          {data.refresh_failed && <span className="ml-2 text-alert">{t("admin.live.refreshFailed")}</span>}
        </p>
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={t("admin.live.today")} value={formatHuf(s.total)} testId="live-total">
          <Change pct={s.diff_pct} /> {t("admin.live.vsUsual", { n: s.compared_days })}
          {(s.record_ever || s.record_weekday) && (
            <span className="ml-1 inline-flex items-center gap-0.5 font-semibold text-olive">
              <Trophy size={12} weight="fill" /> {t(s.record_ever ? "admin.live.recordEver" : "admin.live.recordWeekday")}
            </span>
          )}
        </Tile>
        <Tile label={t("admin.live.breakEven")} value={reached ? `✓ ${s.target_reached_at}` : formatHuf(s.target_missing)}>
          {reached ? t("admin.live.reached") : s.target_eta ? t("admin.live.missingEta", { time: s.target_eta }) : t("admin.live.missing")}
          {s.target && <ProgressBar value={s.target_progress} />}
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
        <Scorecard data={data} t={t} lang={lang} />
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

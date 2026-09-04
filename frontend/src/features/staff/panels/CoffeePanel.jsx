import { useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import {
  CHART, Loading, SectionCard, StatTile, axisProps, chartTooltipProps,
} from "@/features/staff/components/AdminPrimitives";
import { useAdminData } from "@/features/staff/panels/useAdminData";
import { useI18n } from "@/i18n";

const MIX_PERIODS = ["week", "month", "all"];

/**
 * Share of cups by drink.
 *
 * A plain bar list rather than a chart: eight rows read faster than a pie, and
 * the unrecorded row has to sit in the same scale as the rest — a mix is only
 * worth reading next to how much of it was actually captured.
 */
function DrinkMix({ rows }) {
  const { t, lang } = useI18n();
  if (!rows?.length) return <p className="text-sm text-muted">{t("admin.noDrinkData")}</p>;

  const top = rows[0].count || 1;
  return (
    <div className="space-y-2" data-testid="drink-mix">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-3">
          <span
            className={`w-32 shrink-0 truncate text-sm ${
              row.id === "unrecorded" ? "italic text-muted" : "text-ink"
            }`}
          >
            {row.name?.[lang] ?? t("admin.unrecorded")}
          </span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-cream">
            <div
              className={`h-full rounded-full ${
                row.id === "unrecorded" ? "bg-line" : "bg-olive"
              }`}
              style={{ width: `${(row.count / top) * 100}%` }}
            />
          </div>
          <span className="w-20 shrink-0 text-right text-sm tabular-nums text-muted">
            {row.count} · {row.share}%
          </span>
        </div>
      ))}
    </div>
  );
}

export default function CoffeePanel() {
  const { t } = useI18n();
  const [period, setPeriod] = useState("month");
  const data = useAdminData("/admin/analytics/coffee");
  if (!data) return <Loading />;

  const tiles = [
    [data.today, "admin.periods.today"],
    [data.week, "admin.periods.week"],
    [data.month, "admin.periods.month"],
    [data.year, "admin.stats.thisYear"],
    [data.total, "admin.stats.allTime"],
  ];

  return (
    <div className="space-y-6" data-testid="coffee-panel">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {tiles.map(([value, key]) => (
          <StatTile key={key} value={value} label={t(key)} />
        ))}
      </div>

      <SectionCard title={t("admin.dailyTrend")}>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data.trend_daily} margin={{ left: -20, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART.line} />
            <XAxis dataKey="date" {...axisProps} />
            <YAxis allowDecimals={false} {...axisProps} />
            <Tooltip {...chartTooltipProps} />
            <Line
              type="monotone"
              dataKey="count"
              stroke={CHART.olive}
              strokeWidth={2.5}
              dot={{ r: 3, fill: CHART.olive }}
            />
          </LineChart>
        </ResponsiveContainer>
      </SectionCard>

      <SectionCard title={t("admin.hourlyTrend")}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data.trend_hourly} margin={{ left: -20, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART.line} />
            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: CHART.muted }} />
            <YAxis allowDecimals={false} {...axisProps} />
            <Tooltip {...chartTooltipProps} />
            <Bar dataKey="count" fill={CHART.olive} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </SectionCard>

      <SectionCard title={t("admin.drinkMix")}>
        <div className="mb-4 flex gap-1">
          {MIX_PERIODS.map((key) => (
            <button
              key={key}
              data-testid={`mix-period-${key}`}
              onClick={() => setPeriod(key)}
              className={`rounded-card px-3 py-1 text-xs font-semibold transition-colors ${
                period === key ? "bg-olive text-cream" : "bg-cream text-muted hover:text-olive"
              }`}
            >
              {t(key === "all" ? "admin.stats.allTime" : `admin.periods.${key}`)}
            </button>
          ))}
        </div>
        <DrinkMix rows={data.drink_mix?.[period]} />
      </SectionCard>

      <SectionCard title={t("admin.freeMix")}>
        <DrinkMix rows={data.free_mix} />
      </SectionCard>

      <SectionCard title={t("admin.mostActive")}>
        <div className="space-y-2" data-testid="most-active">
          {data.most_active.length === 0 && (
            <p className="text-sm text-muted">{t("admin.noPurchases")}</p>
          )}
          {data.most_active.map((entry, i) => (
            <div
              key={entry.code}
              className="flex items-center justify-between border-b border-line py-2 last:border-0"
            >
              <span className="text-sm text-ink">
                {i + 1}. {entry.name}
              </span>
              <span className="text-sm font-semibold text-olive">
                {entry.coffees} {t("admin.stats.coffees").toLowerCase()}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import {
  CHART, Loading, SectionCard, StatTile, axisProps, chartTooltipProps,
} from "@/features/staff/components/AdminPrimitives";
import { useAdminData } from "@/features/staff/panels/useAdminData";
import { useI18n } from "@/i18n";

export default function CoffeePanel() {
  const { t } = useI18n();
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

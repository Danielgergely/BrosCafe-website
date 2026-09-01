import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  CHART, Loading, SectionCard, axisProps, chartTooltipProps,
} from "@/features/staff/components/AdminPrimitives";
import { useAdminData } from "@/features/staff/panels/useAdminData";
import { useI18n } from "@/i18n";

export default function RetentionPanel() {
  const { t } = useI18n();
  const rows = useAdminData("/admin/analytics/retention");
  if (!rows) return <Loading />;

  return (
    <SectionCard title={t("admin.retentionTitle")}>
      <div data-testid="retention-panel">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={rows} margin={{ left: -20, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART.line} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: CHART.muted }}
              interval={0}
              angle={-15}
              textAnchor="end"
              height={50}
            />
            <YAxis allowDecimals={false} {...axisProps} />
            <Tooltip {...chartTooltipProps} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {rows.map((row, i) => (
                <Cell key={row.label} fill={i % 2 ? CHART.oliveSoft : CHART.olive} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}

import { CHART, Loading, SectionCard } from "@/features/staff/components/AdminPrimitives";
import { useAdminData } from "@/features/staff/panels/useAdminData";
import { useI18n } from "@/i18n";

/** Minimum bar width so a zero-count stage stays readable. */
const MIN_BAR_PCT = 6;

export default function FunnelPanel() {
  const { t } = useI18n();
  const stages = useAdminData("/admin/analytics/funnel");
  if (!stages) return <Loading />;

  return (
    <SectionCard title={t("admin.funnelTitle")}>
      <div className="space-y-3" data-testid="funnel-panel">
        {stages.map((stage, i) => (
          <div key={stage.stage} className="flex items-center gap-4">
            <div className="w-44 shrink-0 text-sm text-ink">{stage.stage}</div>
            <div className="relative h-9 flex-1 overflow-hidden rounded-lg bg-cream">
              <div
                className="flex h-full items-center rounded-lg px-3 text-sm font-semibold text-cream transition-all"
                style={{
                  width: `${Math.max(stage.pct, MIN_BAR_PCT)}%`,
                  backgroundColor: CHART.olive,
                  opacity: 1 - i * 0.06,
                }}
              >
                {stage.count}
              </div>
            </div>
            <div className="w-14 shrink-0 text-right text-sm text-muted">{stage.pct}%</div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

import { Loading, StatTile } from "@/features/staff/components/AdminPrimitives";
import { useAdminData } from "@/features/staff/panels/useAdminData";
import { useI18n } from "@/i18n";

export default function SegmentsPanel() {
  const { t } = useI18n();
  const rows = useAdminData("/admin/analytics/segments");
  if (!rows) return <Loading />;

  return (
    <div className="space-y-6" data-testid="segments-panel">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {rows.map((row) => (
          <StatTile key={row.segment} value={row.count} label={row.segment} />
        ))}
      </div>
      <p className="text-xs text-muted">{t("admin.segmentsNote")}</p>
    </div>
  );
}

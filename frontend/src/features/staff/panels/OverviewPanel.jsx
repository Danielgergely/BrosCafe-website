import { Loading, SectionCard, StatTile } from "@/features/staff/components/AdminPrimitives";
import { useAdminData } from "@/features/staff/panels/useAdminData";
import { useI18n } from "@/i18n";

const PERIODS = ["today", "week", "month"];

export default function OverviewPanel() {
  const { t } = useI18n();
  const data = useAdminData("/admin/analytics/overview");
  if (!data) return <Loading />;

  const metrics = [
    ["qr_scans", "qrScans"],
    ["new_customers", "newCustomers"],
    ["coffees", "coffees"],
    ["rewards_redeemed", "rewardsRedeemed"],
  ];

  return (
    <div className="space-y-6" data-testid="overview-panel">
      {PERIODS.map((period) => (
        <SectionCard key={period} title={t(`admin.periods.${period}`)}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {metrics.map(([field, labelKey]) => (
              <StatTile
                key={field}
                value={data[period][field]}
                label={t(`admin.stats.${labelKey}`)}
              />
            ))}
          </div>
        </SectionCard>
      ))}

      <SectionCard title={t("admin.periods.totals")}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile
            testId="total-customers"
            value={data.totals.total_customers}
            label={t("admin.stats.totalCustomers")}
          />
          <StatTile value={data.totals.active_customers} label={t("admin.stats.activeCustomers")} />
          <StatTile value={data.totals.total_coffees} label={t("admin.stats.coffeesServed")} />
          <StatTile
            value={data.totals.total_rewards_redeemed}
            label={t("admin.stats.freeCoffeesGiven")}
          />
        </div>
      </SectionCard>
    </div>
  );
}

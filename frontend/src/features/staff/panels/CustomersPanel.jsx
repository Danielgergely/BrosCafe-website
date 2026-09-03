import { Loading, StatTile } from "@/features/staff/components/AdminPrimitives";
import { useAdminData } from "@/features/staff/panels/useAdminData";
import { useI18n } from "@/i18n";

/** Hours read badly past two days; switch to whole days. */
const humanDuration = (hours) => (hours >= 48 ? `${Math.round(hours / 24)}d` : `${hours}h`);

export default function CustomersPanel({ onNavigate }) {
  const { t } = useI18n();
  const data = useAdminData("/admin/analytics/customers");
  if (!data) return <Loading />;

  // The headline count is the obvious way in to the list behind it.
  const tiles = [
    [data.total, "total", () => onNavigate?.("members")],
    [data.new, "new"],
    [data.returning, "returning"],
    [data.active, "active"],
    [data.inactive, "inactive"],
    [data.avg_coffees_per_customer, "avgCoffees"],
    [data.avg_visits, "avgVisits"],
    [humanDuration(data.avg_hours_between_purchases), "avgBetween"],
    [humanDuration(data.avg_hours_to_reward), "avgToReward"],
    [`${data.reward_redemption_rate}%`, "redemptionRate"],
  ];

  return (
    <div
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
      data-testid="customers-panel"
    >
      {tiles.map(([value, key, onClick]) => (
        <StatTile
          key={key}
          testId={`stat-${key}`}
          value={value}
          label={t(`admin.stats.${key}`)}
          onClick={onClick}
          hint={onClick ? t("admin.viewMembers") : undefined}
        />
      ))}
    </div>
  );
}

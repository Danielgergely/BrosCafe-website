import { Loading, StatTile } from "@/features/staff/components/AdminPrimitives";
import { useAdminData } from "@/features/staff/panels/useAdminData";
import { useI18n } from "@/i18n";

const humanDuration = (hours) => (hours >= 48 ? `${Math.round(hours / 24)}d` : `${hours}h`);

export default function RewardsPanel() {
  const { t } = useI18n();
  const data = useAdminData("/admin/analytics/rewards");
  if (!data) return <Loading />;

  const tiles = [
    [data.earned, "rewardsEarned"],
    [data.redeemed, "rewardsRedeemed"],
    [data.waiting, "rewardsWaiting"],
    [`${data.redemption_rate}%`, "redemptionRate"],
    [humanDuration(data.avg_hours_to_earn), "avgToEarn"],
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" data-testid="rewards-panel">
      {tiles.map(([value, key]) => (
        <StatTile key={key} value={value} label={t(`admin.stats.${key}`)} />
      ))}
    </div>
  );
}

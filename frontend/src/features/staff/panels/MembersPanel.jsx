import { Loading, SectionCard } from "@/features/staff/components/AdminPrimitives";
import { useAdminData } from "@/features/staff/panels/useAdminData";
import { useI18n } from "@/i18n";

export default function MembersPanel() {
  const { t } = useI18n();
  const members = useAdminData("/admin/members");
  if (!members) return <Loading />;

  const headers = ["name", "email", "progress", "coffees", "rewards"];
  const headerLabel = {
    name: t("admin.name"),
    email: t("admin.email"),
    progress: t("admin.table.progress"),
    coffees: t("admin.stats.coffees"),
    rewards: t("admin.table.rewards"),
  };

  return (
    <SectionCard title={`${t("admin.membersTitle")} (${members.length})`}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" data-testid="members-table">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted">
              {headers.map((key) => (
                <th key={key} className="py-2 pr-4 font-semibold">
                  {headerLabel[key]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.code} className="border-t border-line">
                <td className="py-3 pr-4 font-medium text-ink">{member.name}</td>
                <td className="py-3 pr-4 text-muted">{member.email}</td>
                <td className="py-3 pr-4">
                  {member.reward_ready ? (
                    <span className="rounded-full bg-olive/10 px-3 py-1 text-xs font-semibold text-olive">
                      {t("admin.rewardReady")}
                    </span>
                  ) : (
                    <span className="text-ink">
                      {member.stamps} / {member.stamps_required}
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4 text-ink">{member.total_coffees}</td>
                <td className="py-3 pr-4 text-ink">{member.rewards_redeemed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

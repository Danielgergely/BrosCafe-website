import { CHART, Loading, SectionCard } from "@/features/staff/components/AdminPrimitives";
import { useAdminData } from "@/features/staff/panels/useAdminData";
import { useI18n } from "@/i18n";
import { formatDateTime } from "@/lib/format";

/** Colour per transaction type; labels come from the dictionary. */
const TYPE_COLOUR = {
  registration: CHART.muted,
  coffee_added: CHART.olive,
  reward_earned: CHART.warn,
  reward_redeemed: CHART.alert,
  manual_adjustment: CHART.muted,
  opening_redeemed: CHART.oliveSoft,
};

export default function TransactionsPanel() {
  const { t, lang } = useI18n();
  const rows = useAdminData("/admin/transactions?limit=150");
  if (!rows) return <Loading />;

  const headers = ["when", "customer", "type", "balance", "by"];

  return (
    <SectionCard title={t("admin.transactionsTitle")}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" data-testid="transactions-table">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted">
              {headers.map((key) => (
                <th key={key} className="py-2 pr-4 font-semibold">
                  {t(`admin.table.${key}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={headers.length} className="py-8 text-center text-muted">
                  {t("admin.noTransactions")}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line">
                <td className="py-3 pr-4 text-muted">{formatDateTime(row.at, lang)}</td>
                <td className="py-3 pr-4 text-ink">{row.customer_name}</td>
                <td className="py-3 pr-4">
                  <span
                    className="font-medium"
                    style={{ color: TYPE_COLOUR[row.type] ?? CHART.ink }}
                  >
                    {t(`admin.txTypes.${row.type}`)}
                  </span>
                </td>
                <td className="py-3 pr-4 text-ink">
                  {row.prev_stamps} → {row.new_stamps}
                </td>
                <td className="py-3 pr-4 text-muted">{row.employee}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

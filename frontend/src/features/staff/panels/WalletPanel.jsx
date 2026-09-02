import { Loading, SectionCard, StatTile } from "@/features/staff/components/AdminPrimitives";
import { useAdminData } from "@/features/staff/panels/useAdminData";
import { useI18n } from "@/i18n";
import { formatDateTime } from "@/lib/format";

export default function WalletPanel() {
  const { t, lang } = useI18n();
  const data = useAdminData("/admin/wallet/status");
  if (!data) return <Loading />;

  const tiles = [
    [data.passes_issued, "passesIssued"],
    [data.google_passes_issued, "googlePassesIssued"],
    [data.active_registrations, "deviceRegistrations"],
    [data.generation_failures, "generationFailures"],
    [data.push_failures, "pushFailures"],
    [data.google_push_failures, "googlePushFailures"],
  ];

  /** Apple and Google are configured independently; either can be live alone. */
  const platforms = [
    { key: "apple", title: t("admin.walletTitle"), config: data.config },
    { key: "google", title: t("admin.walletGoogleTitle"), config: data.google_config },
  ];

  return (
    <div className="space-y-6" data-testid="wallet-panel">
      {platforms.map(({ key, title, config }) => (
        <SectionCard key={key} title={title}>
          <span
            data-testid={`wallet-status-${key}`}
            className={`rounded-full px-3 py-1 text-xs font-semibold text-white ${
              config?.configured ? "bg-olive" : "bg-amber-800"
            }`}
          >
            {t(config?.configured ? "admin.walletLive" : "admin.walletOff")}
          </span>
          {!config?.configured && (
            <div className="mt-4 rounded-card bg-cream p-4 text-sm">
              <p className="font-semibold text-ink">{t("admin.walletMissing")}</p>
              <ul className="mt-2 list-disc pl-5 text-muted">
                {(config?.missing ?? []).map((name) => (
                  <li key={name}>
                    <code className="text-ink">{name}</code>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">{t("admin.walletNote")}</p>
            </div>
          )}
        </SectionCard>
      ))}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {tiles.map(([value, key]) => (
          <StatTile key={key} value={value ?? 0} label={t(`admin.stats.${key}`)} />
        ))}
      </div>

      <SectionCard title={t("admin.lastPassUpdate")}>
        <p className="text-sm text-ink">
          {data.last_update ? formatDateTime(data.last_update, lang) : "—"}
        </p>
      </SectionCard>
    </div>
  );
}

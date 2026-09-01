import { useCountdown } from "@/hooks/useCountdown";
import { useI18n } from "@/i18n";

/**
 * Live countdown to the grand opening.
 * @param {"hero"|"compact"} variant sizing
 */
export default function OpeningCountdown({ variant = "hero", showHeader = true }) {
  const { t } = useI18n();
  const { ready, isOpen, days, hours, minutes, seconds } = useCountdown(1000);
  const compact = variant === "compact";

  if (!ready) return <div className="h-24 w-full animate-pulse rounded-card bg-white/40" />;

  if (isOpen) {
    return (
      <div className="animate-fade-up text-center" data-testid="opening-live">
        <p className="font-display text-4xl leading-tight text-olive sm:text-5xl">
          {t("opening.weAreOpenTitle")}
        </p>
        <p className="mt-2 text-sm font-semibold uppercase tracking-label text-muted">
          {t("opening.weAreOpenSub")}
        </p>
      </div>
    );
  }

  const units = [
    { key: "days", value: days },
    { key: "hours", value: hours },
    { key: "minutes", value: minutes },
    { key: "seconds", value: seconds },
  ];

  return (
    <div className="w-full" data-testid="opening-countdown">
      {showHeader && (
        <div className="mb-3 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-olive">
            {t("opening.grandTitle")}
          </p>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted">
            {t("opening.dateLine")}
          </p>
        </div>
      )}
      <div className={`grid grid-cols-4 ${compact ? "gap-2" : "gap-3"}`}>
        {units.map((unit) => (
          <div
            key={unit.key}
            className={`flex flex-col items-center justify-center rounded-card border border-olive/15 bg-white shadow-card ${
              compact ? "py-3" : "py-5"
            }`}
          >
            <span
              data-testid={`countdown-${unit.key}`}
              className={`font-display leading-none tabular-nums text-ink ${
                compact ? "text-2xl" : "text-4xl sm:text-5xl"
              }`}
            >
              {String(unit.value).padStart(2, "0")}
            </span>
            <span
              className={`mt-1.5 font-semibold uppercase tracking-wide text-muted ${
                compact ? "text-[9px]" : "text-[10px]"
              }`}
            >
              {t(`opening.${unit.key}`)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

import { Crown, Diamond } from "lucide-react";

import { TIER_STYLE } from "@/config/site";
import { useI18n } from "@/i18n";

/**
 * The member's standing, and how far the next one is.
 *
 * Base members see nothing: a badge saying "no tier yet" is a reminder of what
 * you lack, and the progress line below already says what to do about it.
 */
export default function TierBadge({ tier, nextTier, coffeesToNext, alwaysFree }) {
  const { t } = useI18n();
  const style = TIER_STYLE[tier] || TIER_STYLE.base;
  if (tier === "base" && !nextTier) return null;

  return (
    <div className="flex flex-col items-center gap-1" data-testid={`tier-${tier}`}>
      {tier !== "base" && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-label"
          style={{ borderColor: style.ring, color: style.ink, background: style.glow }}
        >
          {tier === "diamond" ? <Diamond size={13} /> : <Crown size={13} />}
          {t(`loyalty.tiers.${tier}`)}
        </span>
      )}
      {/* Nothing to add when everything is free — the card already says so. */}
      {!alwaysFree && (
        <span className="text-xs text-muted">
          {nextTier
            ? t("loyalty.tierProgress", {
                n: coffeesToNext,
                next: t(`loyalty.tiers.${nextTier}`),
              })
            : t("loyalty.tierTop")}
        </span>
      )}
    </div>
  );
}

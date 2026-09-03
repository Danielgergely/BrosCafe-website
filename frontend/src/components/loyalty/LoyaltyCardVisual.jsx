import { Coffee, Crown, Diamond } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import BrosLogo from "@/components/layout/BrosLogo";
import LoyaltyProgress from "@/components/loyalty/LoyaltyProgress";
import palette from "@/config/palette";
import { BRAND, TIER_STYLE } from "@/config/site";
import { useI18n } from "@/i18n";

/**
 * The scannable loyalty card. The QR encodes the card code the staff scanner
 * reads.
 *
 * Deliberately mirrors the wallet pass: same tier band, same accent, same
 * running totals. Someone who has the pass on their phone and opens this page
 * should recognise it as the same card rather than wonder which one counts.
 */
export default function LoyaltyCardVisual({ member, showQR = true, animateLast = false }) {
  const { t } = useI18n();
  const required = member.stamps_required ?? BRAND.stampsRequired;
  const remaining = required - member.stamps;
  const rewardReady = member.reward_ready;
  const alwaysFree = member.always_free;
  const tier = member.tier || "base";
  const style = TIER_STYLE[tier] || TIER_STYLE.base;

  // Diamond turns the whole card over; the earned tiers keep the cream ground
  // and take the tier only as an accent, exactly as the pass does.
  const dark = Boolean(style.surface);
  const ink = dark ? style.text : undefined;
  const quiet = dark ? style.muted : undefined;

  return (
    <div
      data-testid="loyalty-card-visual"
      className={`relative overflow-hidden rounded-panel border p-7 text-center shadow-panel ${
        rewardReady ? "animate-reward-glow" : ""
      }`}
      style={{
        borderColor: style.ring,
        background: style.surface || "#fff",
        color: ink,
        boxShadow: `0 0 0 5px ${style.glow}`,
      }}
    >
      {/* The tier band, in the same place as on the wallet pass. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1.5"
        style={{ background: style.ring }}
      />

      <div className="mt-1 flex items-center justify-between">
        <BrosLogo light={dark} />
        <span
          data-testid={`card-tier-${tier}`}
          className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: dark ? style.text : style.ink }}
        >
          {tier === "diamond" ? <Diamond size={14} /> : tier === "base" ? <Coffee size={14} /> : <Crown size={14} />}
          {t(`loyalty.tiers.${tier}`)}
        </span>
      </div>

      <div className="mt-6">
        {alwaysFree ? (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-label" style={{ color: quiet }}>
              {t("card.member")}
            </p>
            <h3 data-testid="card-member-name" className="mt-1 font-display text-3xl leading-tight" style={{ color: ink }}>
              {member.name}
            </h3>
            <p className="mt-2 font-display text-2xl leading-tight" style={{ color: dark ? style.text : palette.olive }}>
              {t("loyalty.tierAlwaysFree")}
            </p>
          </>
        ) : rewardReady ? (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-label text-olive" style={{ color: ink }}>
              {t("card.rewardReady")}
            </p>
            <h3 className="mt-1 font-display text-3xl leading-tight" style={{ color: ink }}>
              {t("card.freeCoffee")}
            </h3>
            <p className="mt-1 text-sm text-muted" style={{ color: quiet }}>{t("card.showCounter")}</p>
          </>
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-label text-muted" style={{ color: quiet }}>
              {t("card.member")}
            </p>
            <h3 data-testid="card-member-name" className="mt-1 font-display text-3xl leading-tight" style={{ color: ink }}>
              {member.name}
            </h3>
            <p data-testid="card-progress-text" className="mt-1 text-sm text-muted" style={{ color: quiet }}>
              {member.stamps} / {required} ·{" "}
              {remaining === 1 ? t("card.remainingOne") : t("card.remainingMany", { n: remaining })}
            </p>
          </>
        )}
      </div>

      {!alwaysFree && (
        <div className="mt-6">
          <LoyaltyProgress stamps={member.stamps} required={required} animateLast={animateLast} />
        </div>
      )}

      {/* The same three figures the pass carries, so the two agree. */}
      <div
        className="mt-6 grid grid-cols-3 gap-2 border-t pt-4 text-center"
        style={{ borderColor: dark ? style.ring : palette.creamDark }}
      >
        {[
          [member.total_coffees ?? 0, t("card.totalCoffees")],
          [member.rewards_redeemed ?? 0, t("card.freeCoffees")],
          [
            member.next_tier ? member.coffees_to_next : "—",
            member.next_tier
              ? t("card.toTier", { tier: t(`loyalty.tiers.${member.next_tier}`) })
              : t("card.topTier"),
          ],
        ].map(([value, label]) => (
          <div key={label}>
            <p className="font-display text-2xl leading-none" style={{ color: ink }}>{value}</p>
            <p className="mt-1 text-[10px] uppercase leading-tight tracking-wide text-muted" style={{ color: quiet }}>
              {label}
            </p>
          </div>
        ))}
      </div>

      {showQR && (
        <div className="mt-7 flex flex-col items-center">
          <div className="rounded-card bg-white p-4 shadow-[0_4px_18px_rgba(44,51,34,0.08)] ring-1 ring-line">
            <QRCodeSVG
              value={member.code}
              size={148}
              level="M"
              fgColor={palette.ink}
              bgColor={palette.white}
              data-testid="member-qr-code"
            />
          </div>
          <p className="mt-3 text-[11px] uppercase tracking-wide text-muted" style={{ color: quiet }}>
            {t("card.scanCounter")}
          </p>
        </div>
      )}
    </div>
  );
}

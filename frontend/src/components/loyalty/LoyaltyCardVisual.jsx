import { Coffee } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import BrosLogo from "@/components/layout/BrosLogo";
import LoyaltyProgress from "@/components/loyalty/LoyaltyProgress";
import palette from "@/config/palette";
import { BRAND } from "@/config/site";
import { useI18n } from "@/i18n";

/** The scannable loyalty card. The QR encodes the card code the staff scanner reads. */
export default function LoyaltyCardVisual({ member, showQR = true, animateLast = false }) {
  const { t } = useI18n();
  const required = member.stamps_required ?? BRAND.stampsRequired;
  const remaining = required - member.stamps;
  const rewardReady = member.reward_ready;

  return (
    <div
      data-testid="loyalty-card-visual"
      className={`relative overflow-hidden rounded-panel border border-line bg-white p-7 text-center shadow-panel ${
        rewardReady ? "animate-reward-glow" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <BrosLogo />
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-olive">
          <Coffee size={14} /> {t("loyalty.club")}
        </span>
      </div>

      <div className="mt-6">
        {rewardReady ? (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-label text-olive">
              {t("card.rewardReady")}
            </p>
            <h3 className="mt-1 font-display text-3xl leading-tight text-ink">
              {t("card.freeCoffee")}
            </h3>
            <p className="mt-1 text-sm text-muted">{t("card.showCounter")}</p>
          </>
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-label text-muted">
              {t("card.member")}
            </p>
            <h3 data-testid="card-member-name" className="mt-1 font-display text-3xl leading-tight text-ink">
              {member.name}
            </h3>
            <p data-testid="card-progress-text" className="mt-1 text-sm text-muted">
              {member.stamps} / {required} ·{" "}
              {remaining === 1 ? t("card.remainingOne") : t("card.remainingMany", { n: remaining })}
            </p>
          </>
        )}
      </div>

      <div className="mt-6">
        <LoyaltyProgress stamps={member.stamps} required={required} animateLast={animateLast} />
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
          <p className="mt-3 text-[11px] uppercase tracking-wide text-muted">
            {t("card.scanCounter")}
          </p>
        </div>
      )}
    </div>
  );
}

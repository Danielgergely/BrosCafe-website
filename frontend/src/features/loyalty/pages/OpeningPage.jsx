import { ArrowRight, Coffee, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";

import PageShell from "@/components/layout/PageShell";
import OpeningCountdown from "@/components/loyalty/OpeningCountdown";
import { BRAND, ROUTES } from "@/config/site";
import { useI18n } from "@/i18n";
import { useCustomer } from "@/state/CustomerAuth";

export default function OpeningPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { member } = useCustomer();

  const hasPass = Boolean(member) && member.opening_status !== "redeemed";
  const claimed = Boolean(member) && member.opening_status === "redeemed";

  return (
    <PageShell>
      <section className="animate-fade-up text-center">
        <p className="text-[11px] font-semibold uppercase tracking-label text-olive">
          {t("opening.grandTitle")}
        </p>
        <h1 className="mt-2 font-display text-5xl leading-[1.05] tracking-tight text-ink">
          {BRAND.name}
        </h1>
        <p className="mt-2 text-sm font-medium uppercase tracking-wide text-muted">
          {t("opening.dateLine")}
        </p>
      </section>

      <div className="mt-8 animate-fade-up rounded-panel border border-olive/15 bg-white/60 p-6 shadow-panel">
        <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-eyebrow text-olive">
          {t("opening.opensIn")}
        </p>
        <OpeningCountdown variant="hero" showHeader={false} />
      </div>

      {/* Teaser only — the gift itself is revealed by staff on the day. */}
      <div
        data-testid="opening-mystery-teaser"
        className="mt-6 animate-fade-up rounded-panel border border-olive/30 bg-white p-6 text-center"
      >
        <p className="text-sm font-semibold uppercase tracking-wide text-olive">
          {t("opening.teaserHeadline")}
        </p>
        <p className="mt-2 text-sm text-muted">{t("opening.teaserBody")}</p>
      </div>

      {claimed ? (
        <div
          data-testid="opening-redeemed"
          className="mt-6 animate-fade-up rounded-panel border border-olive/40 bg-white p-6 text-center"
        >
          <p className="font-semibold text-olive">{t("opening.redeemed")}</p>
        </div>
      ) : hasPass ? (
        <div
          data-testid="opening-pass"
          className="mt-6 animate-fade-up rounded-panel border border-olive/40 bg-white p-6 text-center"
        >
          <p className="text-[11px] font-semibold uppercase tracking-label text-olive">
            {t("opening.passTitle")}
          </p>
          <p className="mt-2 font-display text-2xl text-ink">{t("opening.dateLine")}</p>
          <p className="mt-2 text-sm font-semibold text-olive">{t("opening.badge")}</p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-olive">
            <Lock size={15} /> {t("opening.statusReserved")}
          </p>
          <p className="mt-2 text-sm text-muted">{t("opening.comeDiscover")}</p>
        </div>
      ) : (
        <div
          data-testid="opening-join"
          className="mt-6 animate-fade-up rounded-panel border border-line bg-white p-6 text-center shadow-card"
        >
          <p className="font-display text-2xl text-ink">{t("opening.joinTitle")}</p>
          <p className="mt-1 text-sm text-muted">{t("opening.joinSub")}</p>
          <button
            data-testid="opening-join-btn"
            onClick={() => navigate(ROUTES.loyalty)}
            className="mt-5 inline-flex items-center gap-2 rounded-card bg-olive px-6 py-3.5 font-semibold text-cream transition-colors hover:bg-olive-dark"
          >
            <Coffee size={20} /> {t("loyalty.getCard")} <ArrowRight size={16} />
          </button>
        </div>
      )}
    </PageShell>
  );
}

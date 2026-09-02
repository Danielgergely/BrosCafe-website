import { useCallback, useEffect, useState } from "react";
import { Coffee, PartyPopper, RefreshCw } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import PageShell from "@/components/layout/PageShell";
import LoyaltyCardVisual from "@/components/loyalty/LoyaltyCardVisual";
import WalletButtons from "@/components/loyalty/WalletButtons";
import OpeningCountdown from "@/components/loyalty/OpeningCountdown";
import { ROUTES } from "@/config/site";
import { useI18n } from "@/i18n";
import { api, errorMessage } from "@/lib/api";

/** How often to re-poll, so a stamp added at the counter appears on the phone. */
const REFRESH_MS = 5000;
const CELEBRATION_MS = 3500;

export default function LoyaltyCardPage() {
  const { code } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [member, setMember] = useState(null);
  const [error, setError] = useState("");
  const [celebrating, setCelebrating] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/members/${code}`);
      setMember((previous) => {
        // Celebrate only on the transition into "reward ready".
        if (data.reward_ready && previous && !previous.reward_ready) setCelebrating(true);
        return data;
      });
    } catch (err) {
      setError(errorMessage(err, t("card.notFound")));
    }
  }, [code, t]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!celebrating) return undefined;
    const id = setTimeout(() => setCelebrating(false), CELEBRATION_MS);
    return () => clearTimeout(id);
  }, [celebrating]);

  if (error) {
    return (
      <PageShell>
        <div className="flex flex-col items-center py-16 text-center">
          <Coffee size={40} className="text-olive" />
          <p className="mt-4 font-display text-2xl text-ink">{t("card.notFound")}</p>
          <p className="mt-1 text-sm text-muted">{error}</p>
          <button
            onClick={() => navigate(ROUTES.loyalty)}
            className="mt-6 h-12 rounded-card border border-olive bg-white px-6 font-semibold text-olive"
          >
            {t("card.getNew")}
          </button>
        </div>
      </PageShell>
    );
  }

  if (!member) {
    return (
      <PageShell>
        <div className="flex h-64 items-center justify-center">
          <Coffee size={40} className="animate-pulse text-olive" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="flex items-center justify-end py-2">
        <button
          data-testid="refresh-card-btn"
          onClick={load}
          aria-label={t("card.refresh")}
          className="text-muted transition-colors hover:text-olive"
        >
          <RefreshCw size={20} strokeWidth={1.5} />
        </button>
      </div>

      {member.reward_ready && (
        <div
          data-testid="reward-banner"
          className="mb-5 flex animate-fade-up items-center gap-3 rounded-card border border-olive/30 bg-white px-5 py-4"
        >
          <PartyPopper size={26} className="text-olive" />
          <div>
            <p className="font-display text-lg text-ink">{t("card.bannerTitle")}</p>
            <p className="text-sm text-muted">{t("card.bannerSub")}</p>
          </div>
        </div>
      )}

      <div className="animate-fade-up">
        <LoyaltyCardVisual member={member} animateLast />
      </div>

      <div className="mt-8">
        <WalletButtons code={code} emphasis="solid" />
      </div>
      <p className="mt-3 text-center text-xs text-muted">{t("card.walletHint")}</p>

      {member.opening_status !== "redeemed" && (
        <div
          data-testid="opening-pass"
          className="mt-8 rounded-panel border border-olive/40 bg-white p-6 text-center"
        >
          <p className="text-[11px] font-semibold uppercase tracking-label text-olive">
            {t("opening.passTitle")}
          </p>
          <p className="mt-2 font-display text-2xl text-ink">{t("opening.dateLine")}</p>
          <p className="mt-1 text-sm font-semibold text-olive">{t("opening.badge")}</p>
          <div className="mt-4" data-testid="card-countdown">
            <OpeningCountdown variant="compact" showHeader={false} />
          </div>
          <p className="mt-4 text-sm text-ink">{t("opening.reservedForYou")}</p>
          <p className="mt-1 text-sm text-muted">{t("opening.mystery")}</p>
          <p className="mt-3 text-xs text-muted">{t("opening.bring")}</p>
        </div>
      )}

      <div className="mt-10 grid grid-cols-2 gap-4">
        {[
          { value: member.total_coffees, label: t("card.coffeesBought") },
          { value: member.rewards_redeemed, label: t("card.freeCoffees") },
        ].map((stat) => (
          <div key={stat.label} className="rounded-card border border-line bg-white p-5 text-center">
            <p className="font-display text-3xl text-olive">{stat.value}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-muted">{stat.label}</p>
          </div>
        ))}
      </div>

      {celebrating && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-cream/70 backdrop-blur-sm">
          <div className="animate-fade-up rounded-panel bg-white px-10 py-12 text-center shadow-[0_20px_60px_rgba(102,115,74,0.25)]">
            <PartyPopper size={52} className="mx-auto text-olive" />
            <h2 className="mt-4 font-display text-3xl text-ink">{t("card.celebrateTitle")}</h2>
            <p className="mt-2 text-sm text-muted">{t("card.celebrateSub")}</p>
          </div>
        </div>
      )}
    </PageShell>
  );
}

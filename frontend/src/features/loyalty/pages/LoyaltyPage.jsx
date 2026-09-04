import { useEffect, useState } from "react";
import { Coffee, Gamepad2, Gift, Mail } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import PageShell from "@/components/layout/PageShell";
import LoyaltyProgress from "@/components/loyalty/LoyaltyProgress";
import TierBadge from "@/components/loyalty/TierBadge";
import WalletButtons from "@/components/loyalty/WalletButtons";
import ProductRow from "@/components/product/ProductRow";
import { BRAND, FEATURED, ROUTES, TIER_STYLE } from "@/config/site";
import { useI18n } from "@/i18n";
import { errorMessage, safeGet } from "@/lib/api";
import { LAST_EMAIL_KEY, useCustomer } from "@/state/CustomerAuth";

function SignedInView() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { member } = useCustomer();
  const [params] = useSearchParams();

  const required = member.stamps_required ?? BRAND.stampsRequired;
  const remaining = required - member.stamps;
  const justJoined = params.get("welcome") === "1";
  const tierStyle = TIER_STYLE[member.tier] || TIER_STYLE.base;

  return (
    <>
      {justJoined && (
        <div
          data-testid="loyalty-welcome-banner"
          className="mb-6 animate-fade-up rounded-panel border border-olive/30 bg-white p-6 text-center"
        >
          <Gift size={34} className="mx-auto text-olive" />
          <h1 className="mt-3 font-display text-3xl text-ink">{t("loyalty.welcomeNewTitle")}</h1>
          <p className="mt-1 text-sm text-muted">
            {t("loyalty.welcomeNewSub", { welcome: BRAND.welcomeStamps, n: required })}
          </p>
          <p className="mt-1 text-sm font-medium text-olive">
            {t("loyalty.welcomeBonus", { left: remaining })}
          </p>
        </div>
      )}

      <p data-testid="loyalty-welcome-back" className="animate-fade-up font-display text-3xl text-ink">
        {t("loyalty.welcomeBack", { name: member.name })}
      </p>
      <p className="mt-1 font-display text-2xl italic text-olive/80">
        {member.always_free
          ? t("loyalty.tierAlwaysFree")
          : t("loyalty.memberTitle", { n: required })}
      </p>

      <div
        data-testid="loyalty-card"
        className="mt-6 animate-fade-up rounded-panel border-2 p-7 text-center shadow-panel"
        style={{
          borderColor: tierStyle.ring,
          boxShadow: `0 0 0 6px ${tierStyle.glow}`,
          background: tierStyle.surface || "#fff",
          color: tierStyle.text || undefined,
        }}
      >
        <p
          className="text-[11px] font-semibold uppercase tracking-label"
          style={{ color: tierStyle.muted || undefined }}
        >
          {t("loyalty.yourLoyalty")}
        </p>
        {member.always_free ? (
          <p
            data-testid="loyalty-stamps"
            className="mt-2 font-display text-3xl leading-tight"
            style={{ color: tierStyle.text || undefined }}
          >
            {t("loyalty.tierAlwaysFree")}
          </p>
        ) : (
          <>
            <p data-testid="loyalty-stamps" className="mt-2 font-display text-5xl text-ink">
              {member.stamps} / {required}
            </p>
            <div className="mt-5">
              <LoyaltyProgress stamps={member.stamps} required={required} />
            </div>
          </>
        )}

        <div className="mt-5">
          <TierBadge
            tier={member.tier}
            nextTier={member.next_tier}
            coffeesToNext={member.coffees_to_next}
            alwaysFree={member.always_free}
          />
        </div>

        {member.reward_ready ? (
          <div className="mt-5" data-testid="loyalty-free-ready">
            <p
              className="font-display text-2xl text-olive"
              style={{ color: tierStyle.text || undefined }}
            >
              {t("loyalty.freeReady")}
            </p>
            <p
              className="mt-1 text-sm text-muted"
              style={{ color: tierStyle.muted || undefined }}
            >
              {t("loyalty.freeReadySub")}
            </p>
          </div>
        ) : member.always_free ? null : (
          <p className="mt-4 text-sm text-muted">
            {remaining === 1 ? t("loyalty.oneMore") : t("loyalty.nMore", { n: remaining })}
          </p>
        )}
      </div>

      <div className="mt-6 space-y-3">
        <button
          data-testid="loyalty-open-wallet-card"
          onClick={() => navigate(ROUTES.card(member.code))}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-card bg-olive font-semibold text-cream transition-colors hover:bg-olive-dark"
        >
          <Coffee size={20} /> {t("loyalty.openWalletCard")}
        </button>
        <WalletButtons code={member.code} />
        <Link
          data-testid="loyalty-play-game"
          to={ROUTES.game}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-card border border-line bg-white text-sm font-semibold text-ink transition-colors hover:border-olive"
        >
          <Gamepad2 size={17} /> {t("game.playWhileYouWait")}
        </Link>
      </div>

      <ProductRow
        ids={FEATURED.discoverRow}
        title={t("loyalty.discoverTitle")}
        subtitle={t("loyalty.discoverSub")}
        testId="loyalty-discover"
      />
    </>
  );
}

function SignUpForm() {
  const { t } = useI18n();
  const { requestLink, expired, clearExpired } = useCustomer();
  // Prefilled from the last sign-in, so coming back is a tap rather than
  // typing an address on a phone.
  const [email, setEmail] = useState(() => safeGet(LAST_EMAIL_KEY) || "");
  const [firstName, setFirstName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState("");

  useEffect(() => {
    if (sentTo) window.scrollTo({ top: 0, behavior: "auto" });
  }, [sentTo]);

  const submit = async (event) => {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      await requestLink(email.trim(), firstName.trim());
      clearExpired();
      setSentTo(email.trim());
    } catch (error) {
      toast.error(errorMessage(error, t("common.somethingWrong")));
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-olive/10 text-olive">
          <Mail size={30} />
        </span>
        <h1 className="mt-6 font-display text-3xl text-ink">{t("loyalty.checkInboxTitle")}</h1>
        <p data-testid="loyalty-check-inbox" className="mt-3 text-sm leading-relaxed text-muted">
          {t("loyalty.checkInboxBody", { email: sentTo })}
        </p>
        <button
          onClick={() => setSentTo("")}
          className="mt-8 text-sm font-medium text-olive hover:underline"
        >
          ← {t("loyalty.backToForm")}
        </button>
      </div>
    );
  }

  const inputClass =
    "mt-1 h-12 w-full rounded-card border border-line bg-white px-4 outline-none focus:border-olive focus:ring-2 focus:ring-olive/30";

  return (
    <>
      <section className="animate-fade-up">
        <p className="text-[11px] font-semibold uppercase tracking-label text-olive">
          {t("loyalty.kicker")}
        </p>
        <h1 className="mt-2 font-display text-4xl leading-[1.05] text-ink">
          {t("loyalty.heroTitle", { n: BRAND.stampsRequired })}
        </h1>
      </section>

      <section className="mt-8 animate-fade-up rounded-panel border border-line bg-white p-6 shadow-card">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-olive">
          {t("loyalty.howTitle")}
        </p>
        <ol className="mt-4 space-y-3">
          {t("loyalty.steps").map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-olive text-xs font-semibold text-cream">
                {i + 1}
              </span>
              <span className="text-sm text-ink">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {expired && (
        <div
          data-testid="session-expired"
          className="mt-8 rounded-panel border border-olive/30 bg-white p-5 text-sm leading-relaxed text-ink"
        >
          <p className="font-semibold">{t("loyalty.expiredTitle")}</p>
          <p className="mt-1 text-muted">{t("loyalty.expiredBody")}</p>
        </div>
      )}

      <form onSubmit={submit} className="mt-8 space-y-4" data-testid="loyalty-form">
        <p className="font-display text-2xl text-ink">{t("loyalty.formTitle")}</p>
        <p className="-mt-2 text-sm text-muted">{t("loyalty.formSub")}</p>
        {/* Showing the half-filled card persuades far better than a sentence
            about it — the head start was previously one small line here and
            went unnoticed. */}
        <div
          data-testid="loyalty-welcome-bonus"
          className="!mt-6 rounded-panel border border-olive/25 bg-olive/[0.07] p-5 text-center"
        >
          <p className="text-[10px] font-semibold uppercase tracking-label text-olive/70">
            {t("loyalty.bonusLabel")}
          </p>
          <p className="mt-1 font-display text-2xl text-olive">
            {t("loyalty.bonusHeadline", { welcome: BRAND.welcomeStamps })}
          </p>
          <div className="mt-4 flex justify-center">
            <LoyaltyProgress stamps={BRAND.welcomeStamps} required={BRAND.stampsRequired} size={24} />
          </div>
          <p className="mt-3 text-sm text-olive/80">
            {t("loyalty.formBonus", {
              welcome: BRAND.welcomeStamps,
              left: BRAND.stampsRequired - BRAND.welcomeStamps,
            })}
          </p>
        </div>

        <div>
          <label htmlFor="first-name" className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("auth.firstNameLabel")}
          </label>
          <input
            id="first-name"
            data-testid="loyalty-firstname"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            placeholder={t("auth.firstNamePlaceholder")}
            autoComplete="given-name"
            required
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("auth.emailLabel")}
          </label>
          <input
            id="email"
            data-testid="loyalty-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t("auth.emailPlaceholder")}
            required
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          data-testid="loyalty-submit"
          className="flex h-14 w-full items-center justify-center gap-2 rounded-card bg-olive text-base font-semibold text-cream transition-colors hover:bg-olive-dark disabled:opacity-60"
        >
          <Coffee size={20} /> {t("loyalty.send")}
        </button>
      </form>

      <p className="mt-8 text-center text-xs leading-relaxed text-muted">{t("loyalty.privacy")}</p>
    </>
  );
}

export default function LoyaltyPage() {
  const { member } = useCustomer();

  return (
    <PageShell>
      {member === null ? (
        <div className="flex h-64 items-center justify-center">
          <Coffee size={36} className="animate-pulse text-olive" />
        </div>
      ) : member ? (
        <SignedInView />
      ) : (
        <SignUpForm />
      )}
    </PageShell>
  );
}

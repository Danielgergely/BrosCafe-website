import { ArrowRight, Coffee, Gift, Heart, LogOut, Newspaper, Pencil } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import PageShell from "@/components/layout/PageShell";
import LoyaltyProgress from "@/components/loyalty/LoyaltyProgress";
import InviteFriend from "@/components/loyalty/InviteFriend";
import WalletButtons from "@/components/loyalty/WalletButtons";
import { BRAND, ROUTES } from "@/config/site";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/lib/api";
import { localize, useCatalog } from "@/lib/catalog";
import { formatMonthYear } from "@/lib/format";
import { useCustomer } from "@/state/CustomerAuth";
import { useUi } from "@/state/UiStore";

function Panel({ title, children, testId }) {
  return (
    <div data-testid={testId} className="rounded-card border border-line bg-white p-6 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-olive">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** The signed-in member's hub: stamps, rewards, favourites, wallet. */
export default function AccountPage() {
  const { t, lang } = useI18n();

  const navigate = useNavigate();
  const { member, changeEmail, signOut } = useCustomer();
  const { favourites, openProduct } = useUi();
  const { get } = useCatalog();


  if (!member) return null;

  const required = member.stamps_required ?? BRAND.stampsRequired;
  const picks = favourites.map((id) => localize(get(id), lang)).filter(Boolean);

  const onChangeEmail = async () => {
    const next = window.prompt(t("account.changeEmailPrompt"), member.email);
    if (!next || next === member.email) return;
    try {
      await changeEmail(next);
      toast.success(t("account.emailChanged"));
    } catch (error) {
      toast.error(errorMessage(error, t("common.somethingWrong")));
    }
  };

  return (
    <PageShell>
      <p className="text-[11px] font-semibold uppercase tracking-label text-olive/70">
        {t("account.greeting")}
      </p>
      <h1 className="mt-1 font-display text-5xl italic text-ink">{member.name}.</h1>
      <p className="mt-2 text-sm text-muted">
        {t("account.memberSince", { since: formatMonthYear(member.created_at, lang) })}
      </p>

      <div className="mt-8 space-y-4">
        <button
          data-testid="account-loyalty"
          onClick={() => navigate(ROUTES.loyalty)}
          className="block w-full rounded-card border border-line bg-white p-6 text-left shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-olive">
              {t("account.yourLoyalty")}
            </p>
            <ArrowRight size={16} className="text-muted" />
          </div>
          <p className="mt-3 flex items-center gap-2 font-display text-3xl text-ink">
            <Coffee size={22} className="text-olive" />
            {member.stamps} / {required}
          </p>
          <div className="mt-3">
            <LoyaltyProgress stamps={member.stamps} required={required} size={20} />
          </div>
          {member.reward_ready && (
            <p className="mt-3 text-sm font-semibold text-olive">{t("card.celebrateTitle")}</p>
          )}
        </button>

        <Panel title={t("account.rewardsTitle")} testId="account-rewards">
          <p className="flex items-center gap-2 text-ink">
            <Gift size={20} className="text-olive" />
            {t("account.rewardsAvailable", { n: member.reward_ready ? 1 : 0 })}
          </p>
        </Panel>

        <Panel title={t("account.inviteTitle")} testId="account-invite">
          <InviteFriend member={member} compact />
        </Panel>

        {picks.length > 0 && (
          <Panel title={t("account.picks")} testId="account-picks">
            <div className="flex flex-wrap gap-2.5">
              {picks.map((product) => (
                <button
                  key={product.id}
                  data-testid={`account-pick-${product.id}`}
                  onClick={() => openProduct(product.id)}
                  className="flex items-center gap-2 rounded-xl bg-cream px-3 py-2 transition-transform duration-300 hover:-translate-y-0.5"
                >
                  <img
                    src={product.images?.[0]}
                    alt=""
                    className="h-8 w-8 rounded-lg object-cover"
                  />
                  <span className="text-sm font-medium text-ink">{product.name}</span>
                  <Heart size={11} className="text-olive" fill="currentColor" />
                </button>
              ))}
            </div>
          </Panel>
        )}

        <Panel title={t("account.whatsNew")} testId="account-news">
          <button
            onClick={() => navigate(ROUTES.news)}
            className="flex items-center gap-2 text-sm font-medium text-olive"
          >
            <Newspaper size={16} /> {t("account.whatsNew")} <ArrowRight size={14} />
          </button>
        </Panel>

        <Panel title={t("account.walletTitle")} testId="account-wallet">
          <WalletButtons code={member.code} emphasis="solid" />
        </Panel>

        <Panel title={t("account.title")} testId="account-settings">
          <p className="text-sm text-muted">
            {t("account.emailLabel")}: <span className="text-ink">{member.email}</span>
          </p>
          <div className="mt-4 flex flex-col items-start gap-2">
            <button
              data-testid="change-email-btn"
              onClick={onChangeEmail}
              className="flex items-center gap-2 text-sm font-medium text-olive"
            >
              <Pencil size={16} /> {t("account.changeEmail")}
            </button>
            <button
              data-testid="logout-btn"
              onClick={() => {
                signOut();
                toast(t("account.loggedOut"));
                navigate(ROUTES.home);
              }}
              className="flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-ink"
            >
              <LogOut size={16} /> {t("account.logOut")}
            </button>
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}

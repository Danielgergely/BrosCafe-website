import { Smartphone } from "lucide-react";

import { useWallet } from "@/hooks/useWallet";
import { useI18n } from "@/i18n";

/**
 * "Add to Apple Wallet" / "Add to Google Wallet" for one member.
 *
 * @param {string} code      the member's loyalty card code
 * @param {"solid"|"outline"} emphasis  styling of the Apple button; Google is
 *                                      always the quieter of the two
 */
export default function WalletButtons({ code, emphasis = "outline" }) {
  const { t } = useI18n();
  const { available, busy, addToApple, addToGoogle } = useWallet(code);

  const base =
    "flex h-12 w-full items-center justify-center gap-2 rounded-card font-semibold transition-colors disabled:opacity-60";
  const apple =
    emphasis === "solid"
      ? `${base} bg-olive text-cream hover:bg-olive-dark`
      : `${base} border border-olive bg-white text-olive hover:bg-cream`;
  // Google stays quiet while unconfigured, so it doesn't look like a dead
  // primary action.
  const google = available.google
    ? `${base} border border-olive bg-white text-olive hover:bg-cream`
    : `${base} border border-line bg-white text-muted`;

  return (
    <div className="space-y-3">
      <button data-testid="wallet-add-apple" onClick={addToApple} className={apple}>
        <Smartphone size={18} /> {t("card.addApple")}
      </button>
      <button
        data-testid="wallet-add-google"
        onClick={addToGoogle}
        disabled={busy === "google"}
        className={google}
      >
        <Smartphone size={18} />
        {busy === "google" ? t("card.addingGoogle") : t("card.addGoogle")}
      </button>
    </div>
  );
}
